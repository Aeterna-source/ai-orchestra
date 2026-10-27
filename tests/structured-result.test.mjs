import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredResult } from '../lib/structured-result.js';
import { providerCapabilities, structuredBody } from '../lib/provider-capabilities.js';

const request={providerName:'openai',model:'gpt-5.5',purpose:'test',messages:[{role:'user',content:'Return JSON'}]};
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
const validate=value=>value?.ok===true;
test('native output rejected by endpoint downgrades once, malformed JSON gets one repair',async()=>{
  const calls=[];
  const result=await structuredResult({request,schema,name:'test',validate,call:async input=>{
    calls.push(input);
    if(calls.length===1)throw Object.assign(new Error('response_format is not supported'),{status:400});
    return calls.length===2 ? 'broken' : '{"ok":true}';
  }});
  assert.equal(calls.length,3);
  assert.ok(calls[0].extraBody.response_format);
  assert.equal(calls[1].extraBody.response_format,undefined);
  assert.equal(calls[2].extraBody.response_format,undefined);
  assert.deepEqual(result.status,{format:'plain',fallback:true,repair:'repaired'});
});
test('repair failure throws, never returns an empty success',async()=>{
  let calls=0;
  await assert.rejects(structuredResult({request,schema,name:'test',validate,call:async()=>{calls++;return '{}'}}),/Invalid structured/);
  assert.equal(calls,2);
});
test('quota/auth/network errors are not repaired or disguised as unsupported format',async()=>{
  for(const status of [401,429,500]){
    let calls=0;
    await assert.rejects(structuredResult({request,schema,name:'test',validate,call:async()=>{
      calls++;throw Object.assign(new Error('response_format unavailable'),{status});
    }}));
    assert.equal(calls,1);
  }
});
test('provider-specific schema fields never mix Anthropic and OpenAI endpoints',()=>{
  const anthropic=structuredBody(providerCapabilities('anthropic','claude-sonnet-4-5'),schema,'test');
  assert.ok(anthropic.output_config.format.schema);
  assert.equal(anthropic.response_format,undefined);
  const xai=structuredBody(providerCapabilities('xai','grok-4.3'),schema,'test','responses');
  assert.ok(xai.text.format.schema);assert.equal(xai.response_format,undefined);
  assert.deepEqual(structuredBody(providerCapabilities('local','unknown',{}),schema,'test'),{});
});
