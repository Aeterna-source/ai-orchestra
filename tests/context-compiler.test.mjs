import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContext } from '../lib/context-compiler.js';
import { providerCapabilities } from '../lib/provider-capabilities.js';
const block=(id,content,required=false)=>({role:'system',content,contextBlock:{id,required}});
test('local compiler prioritizes focus while retaining identity, core, runtime and image input',()=>{
  const input={role:'user',content:[{type:'text',text:'project'},{type:'image_url',image_url:{url:'data:image/png;base64,AAAA'}}]};
  const messages=[block('identity','identity',true),block('core','core',true),block('runtime','runtime',true),
    block('unrelated','x'.repeat(2000)),block('project','project has a source ID'),...Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:'history'.repeat(30)})),input];
  const result=compileContext(messages,{...providerCapabilities('local','unknown',{}),systemChars:140,historyChars:500},['project']);
  assert.equal(result.messages.filter(message=>message.role==='system').length,1);
  assert.deepEqual(result.messages.at(-1),input);
  for(const id of ['identity','core','runtime','project'])assert.ok(result.debug.selected.includes(id));
  assert.ok(result.debug.dropped.includes('unrelated'));
  assert.ok(result.debug.historyMessages<20);
  assert.equal(result.messages.some(message=>message.contextBlock),false);
});
test('required context overflow is explicit, never silently discards Core',()=>{
  assert.throws(()=>compileContext([block('core','x'.repeat(100),true),{role:'user',content:'hi'}],
    {...providerCapabilities('local','unknown',{}),systemChars:50}),/Required/);
});
test('current user correction and followup draft survive history trimming',()=>{
  const messages=[block('identity','identity',true),{role:'user',content:'old'}, {role:'assistant',content:'old answer'},
    {role:'user',content:'Correction: current truth'}, {role:'assistant',content:'draft'},block('retrieval','new source')];
  const result=compileContext(messages,{...providerCapabilities('openai','gpt-5.5',{}),historyMessages:0},[]);
  assert.ok(result.messages.some(message=>message.content==='Correction: current truth'));
  assert.ok(result.messages.some(message=>message.content==='draft'));
});
