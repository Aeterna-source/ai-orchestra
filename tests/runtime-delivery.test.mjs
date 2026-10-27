import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('async function handleTelegramUpdateUnlocked(');
const handler=source.slice(start,source.indexOf('\nlet telegramInboxRunning',start));
async function run({action=null, failGenerate=false, failSend=false, failCommit=false}={}){
  const order=[],statuses=[],notices=[];
  const ctx=vm.createContext({
    runtimeContinuity:{current:()=>({assertLease:async()=>{order.push('lease')},complete:async()=>{
      order.push('complete');if(failCommit)throw new Error('DB commit failed');
    }})},
    getTelegramMessage:update=>update.message,getTelegramText:()=> 'hello',hasTelegramImage:()=>false,
    logTelegramProcessing:async()=>{},isAllowedTelegramMessage:()=>true,
    resolveModelConfig:()=>({profile:'Spud'}),isGroupChat:()=>false,TELEGRAM_GROUP_PRIVATE_CONTEXT:true,
    addressedToBot:()=>true,getTelegramSenderName:()=> 'Nadia',recordSubjectEvent:async()=>({id:1}),
    recordSubjectAttentionDecision:async()=>({status:'shadow'}),telegramApi:async()=>{},stripBotMention:text=>text,
    generateChatReply:async()=>{order.push('generate');if(failGenerate)throw new Error('API failed');return {reply:action?'':'answer',action};},
    sendTelegramReply:async()=>{order.push('send');if(failSend)throw new Error('Telegram failed');return {message_id:2};},
    formatConversationActionNotice:(_,value)=>value,
    sendTelegramTechnicalNotice:async(_,__,text,phase)=>{
      notices.push(phase); if(phase==='conversation_action_notice'){
        order.push('send');return failSend?null:{message_id:2};
      }
      return {message_id:3};
    },
    updateSubjectEventResponseStatus:async(_,status)=>{statuses.push(status)},formatTelegramFailureNotice:()=> 'technical failure'
  });
  vm.runInContext(handler,ctx);
  let error=null;
  try { await ctx.handleTelegramUpdateUnlocked({key:'spud',model:'spud'},{update_id:1,message:{message_id:1,chat:{id:7,type:'private'},from:{id:4}}}); }
  catch(err){error=err.message;}
  return {order,statuses,notices,error};
}
test('Telegram commits runtime only after confirmed delivery, including pass/end',async()=>{
  for(const action of [null,'passed','ended']){
    const result=await run({action});
    assert.equal(result.error,null);
    assert.deepEqual(result.order,['generate','lease','send','complete']);
    assert.deepEqual(result.statuses,[action||'responded']);
  }
});
test('API failure or failed Telegram send cannot complete runtime state',async()=>{
  for(const options of [{failGenerate:true},{failSend:true},{action:'passed',failSend:true}]){
    const result=await run(options);
    assert.ok(result.error);assert.equal(result.order.includes('complete'),false);
    assert.ok(result.notices.includes('failure_notice'));
  }
});
test('delivered answer with failed continuity commit is not reported as unsent',async()=>{
  const result=await run({failCommit:true});
  assert.equal(result.error,'DB commit failed');
  assert.deepEqual(result.statuses,['responded']);
  assert.equal(result.notices.includes('failure_notice'),false);
});
