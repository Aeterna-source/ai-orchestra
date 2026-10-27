import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { compileContext } from '../lib/context-compiler.js';
import { providerCapabilities, structuredBody } from '../lib/provider-capabilities.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function extract(name){
  const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.ok(start>=0,name);
  const tail=source.slice(start+1);
  const next=tail.search(/\n(?:async function |function |const |app\.)/);
  return source.slice(start,next<0?undefined:start+1+next);
}
function environment(failResponses=false){
  const calls=[];
  const ctx=vm.createContext({process:{env:{}},console:{error(){},log(){}},AbortSignal,
    runtimeContinuity:{current:()=>null},CONTEXT_COMPILER_ENABLED:true,compileContext,providerCapabilities,
    providers:Object.fromEntries(['openai','anthropic','xai','local'].map(key=>[key,{baseUrl:`https://${key}.test/v1`,apiKey:'test'}])),
    resolveResponseTokenLimit:({requested,fallback})=>Number(requested||fallback||1000),
    parseProviderResponse:JSON.parse,requestManifest:()=>({}),logAiCall:async()=>{},
    isMiroProfile:profile=>profile==='Miro',
    createProviderError:({status})=>Object.assign(new Error('provider failure'),{status}),
    fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});
      const failed=failResponses&&url.endsWith('/responses');
      return {ok:!failed,status:failed?400:200,text:async()=>JSON.stringify(failed?{error:'fallback'}:
        {content:[{type:'text',text:'ok'}],output_text:'ok',choices:[{message:{content:'ok'}}]})};}
  });
  for(const name of ['parsePositiveInteger','getResponseTokenCeiling','applyChatCompletionTokenLimit',
    'formatProviderHeaderId','isGrokulchikUserFacingPurpose','shouldUseXaiPromptCache','buildProviderHeaders',
    'getGrokulchikChatReasoningEffort','getGrokulchikResponsesMaxOutputTokens','shouldStoreXaiResponses','messagesContainImageInput',
    'shouldUseXaiResponsesApi','buildProviderBodyExtras','buildXaiResponsesBody','parseDataImageUrl','pushAnthropicPart',
    'formatAnthropicContent','contentToAnthropicParts','mergeAnthropicContent','normalizeAnthropicMessages',
    'buildAnthropicMessagesBody','buildAnthropicHeaders','extractAnthropicText','extractResponsesText','callChatCompletion']) {
    vm.runInContext(extract(name),ctx);
  }
  return {ctx,calls};
}
const messages=[{role:'system',content:'identity'}, {role:'system',content:'protocol'},
  {role:'system',content:'runtime',contextBlock:{id:'runtime',required:true}}, {role:'user',content:'hello'}];
test('actual transport keeps Anthropic body separate and images intact',async()=>{
  const {ctx,calls}=environment();
  const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
  const extraBody=structuredBody(providerCapabilities('anthropic','claude-sonnet-4-5'),schema,'runtime');
  await ctx.callChatCompletion({providerName:'anthropic',model:'claude-sonnet-4-5',profile:'Zefir',purpose:'chat',extraBody,
    messages:[...messages.slice(0,-1),{role:'user',content:[{type:'text',text:'image'}, {type:'image_url',image_url:{url:'data:image/png;base64,AAAA'}}]}]});
  const body=calls[0].body;
  assert.ok(calls[0].url.endsWith('/messages'));
  assert.ok(body.output_config.format.schema);
  assert.ok(body.system.includes('runtime'));
  assert.equal(body.messages[0].content[1].type,'image');
  for(const field of ['response_format','reasoning_effort','max_completion_tokens','max_output_tokens','input'])assert.equal(body[field],undefined);
});
test('Miro retains Responses path and existing chat fallback',async()=>{
  const {ctx,calls}=environment(true);
  await ctx.callChatCompletion({providerName:'xai',model:'grok-4.3',profile:'Miro',purpose:'chat',messages});
  assert.ok(calls[0].url.endsWith('/responses'));assert.ok(calls[0].body.input);
  assert.ok(calls[1].url.endsWith('/chat/completions'));assert.ok(calls[1].body.messages);
  assert.equal(calls[0].body.input.some(message=>message.contextBlock),false);
});
test('all six current profile routes resolve without starting the server',()=>{
  const ctx=vm.createContext({process:{env:{}}});
  vm.runInContext(extract('resolveMiroModelConfig'),ctx);
  const start=source.indexOf('const modelRegistry =');
  const end=source.indexOf('const memoryTables =',start);
  vm.runInContext(source.slice(start,end)+'\nglobalThis.registry=modelRegistry;',ctx);
  const expected={nevan:['openai','Nevan'],spud:['openai','Spud'],reon:['openai','Reon'],miro:['xai','Miro'],zefir:['anthropic','Zefir'],'local-relational':['local','Reon']};
  for(const [key,[provider,profile]] of Object.entries(expected)){
    assert.equal(ctx.registry[key].provider,provider);assert.equal(ctx.registry[key].profile,profile);
  }
});
