import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveUpdate, drainUpdates } from '../lib/telegram-inbox.js';
test('receipt uses stable bot/update identity and never overwrites duplicates', async () => {
  let row, options;
  const db={from:()=>({upsert:async(r,o)=>{row=r;options=o;return {};}})};
  assert.equal(await receiveUpdate(db,'a',{update_id:42,message:{text:'x'}}),true);
  assert.equal(row.update_id,42);assert.equal(row.bot_key,'a');
  assert.equal(options.ignoreDuplicates,true);assert.equal(options.onConflict,'bot_key,update_id');
  assert.equal(await receiveUpdate({from(){throw Error('unexpected')}},'a',{}),false);
});
test('storage failure prevents acknowledging receipt', async () => {
  await assert.rejects(receiveUpdate({from:()=>({upsert:async()=>({error:true})})},'a',{update_id:42}));
});
test('worker marks processing exceptions failed instead of replaying them', async () => {
  const outputs=[{}, {data:[{bot_key:'a',update_id:42,payload:{}}]}, {data:[{update_id:42}]}, {}];
  const writes=[];
  const db={from:()=>({update(row){writes.push(row);return this},select(){return this},eq(){return this},lt(){return this},order(){return this},limit(){return this},then(resolve,reject){return Promise.resolve(outputs.shift()).then(resolve,reject)}})};
  let runs=0;
  await drainUpdates(db,new Map([['a',{}]]),async()=>{runs++;throw Error('failed')});
  assert.equal(runs,1);assert.equal(writes.at(-1).status,'failed');
});
