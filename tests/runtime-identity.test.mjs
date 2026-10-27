import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeEvidence, validRuntimeIdentity, synthesizeRuntimeIdentity } from '../lib/runtime-identity.js';
import { runtimeTurns } from '../lib/runtime-turn.js';

const state = () => ({ state_summary: 'A new correction matters.', salience: [{ item: 'correction', weight: 0.8, evidence: ['current_input'] }],
  tensions: [], commitments: [], active_threads: [], relevant_memory: [], uncertainties: [],
  freedoms: ['May revise the prior'], direction: { toward: [], away_from: [] }, context_focus: ['correction'], evidence_refs: ['current_input'] });

test('empty, invented provenance, and coercible weights are not valid runtime state', () => {
  const evidence = [{id:'current_input'}];
  assert.equal(validRuntimeIdentity({}, evidence), false);
  assert.equal(validRuntimeIdentity(state(), evidence), true);
  const fake = state(); fake.salience[0].evidence = ['invented'];
  assert.equal(validRuntimeIdentity(fake, evidence), false);
  const textWeight = state(); textWeight.salience[0].weight = '0.8';
  assert.equal(validRuntimeIdentity(textWeight, evidence), false);
});

test('evidence includes the completed answer, metadata, objects and timeline', () => {
  const result = runtimeEvidence({input:'correction', previous:{id:'8',runtime:{state:state(),exchange:{output:'new commitment',action:'responded'}}},
    cognitive:{metaMemory:[{id:1,content:'lesson'}]}, space:{objects:[{id:2,title:'work'}]}, timeline:{events:[{id:3,summary:'event'}]}});
  assert.equal(result.selected.find(row=>row.id==='exchange:8').data.output,'new commitment');
  for (const id of ['meta_memory:1','object:2','timeline:3']) assert.ok(result.selected.some(row=>row.id===id));
});

test('a compact state can cite more than eight supplied sources without losing provenance', () => {
  const evidence = [{id:'current_input'}, ...Array.from({length:33}, (_,i)=>({id:`core:${i}`}))];
  const rich = state(); rich.evidence_refs = evidence.map(row=>row.id);
  assert.equal(validRuntimeIdentity(rich, evidence), true);
  rich.evidence_refs[1] = 'invented';
  assert.equal(validRuntimeIdentity(rich, evidence), false);
  rich.evidence_refs = evidence.map(row=>row.id);
  rich.commitments = Array(9).fill('too many commitments');
  assert.equal(validRuntimeIdentity(rich, evidence), false);
});

test('synthesis calls only the injected transport and validates its output', async () => {
  let calls = 0;
  const result = await synthesizeRuntimeIdentity({call:async()=>{calls++;return JSON.stringify(state());},
    modelConfig:{provider:'anthropic',upstreamModel:'claude-sonnet-4-5',profile:'Zefir'}, evidence:runtimeEvidence({input:'correction'})});
  assert.equal(calls,1); assert.equal(result.state_summary,state().state_summary);
});

function fakeDB() {
  const rows = [], active = new Map();
  return { rows, async rpc(name,args) {
    const profile = args.p_profile;
    if (name === 'runtime_identity_begin') {
      if (active.has(profile)) return {data:null};
      const previous = rows.findLast(row=>row.profile===profile && row.status==='completed');
      const row={id:String(rows.length+1),profile,status:'pending',token:args.p_token};
      rows.push(row); active.set(profile,row);
      return {data:{id:row.id,previous:previous ? {id:previous.id,runtime:previous} : null}};
    }
    const row=active.get(profile);
    if (!row || row.token!==args.p_token) return {data:false};
    Object.assign(row,args.p_patch,{status:args.p_status});
    if(row.status!=='pending')active.delete(profile);
    return {data:true};
  }};
}

test('same-profile turns serialize through delivery; other profiles remain independent', async () => {
  const db=fakeDB(), runtime=runtimeTurns(db,{enabled:true});
  let unblock; const gate=new Promise(resolve=>{unblock=resolve}); const order=[];
  const first=runtime.withTurn('Spud',async turn=>{order.push('first');turn.validState=true;await gate;await turn.complete({status:'telegram_sent'});order.push('delivered')});
  const second=runtime.withTurn('Spud',async turn=>{order.push('second');assert.equal(turn.previous.id,'1')});
  await runtime.withTurn('Reon',async()=>{order.push('reon')});
  assert.deepEqual(order,['first','reon']);unblock();await Promise.all([first,second]);
  assert.deepEqual(order,['first','reon','delivered','second']);
});

test('failed API/delivery, pass and end have distinct lifecycle outcomes', async () => {
  const db=fakeDB(), runtime=runtimeTurns(db,{enabled:true});
  for(const action of ['passed','ended']) await runtime.withTurn('Spud',async turn=>{
    turn.validState=true;await turn.save({exchange:{action}});await turn.complete({status:'telegram_sent'});
  });
  await assert.rejects(runtime.withTurn('Spud',async()=>{throw new Error('delivery failed')}));
  assert.deepEqual(db.rows.map(row=>row.status),['completed','completed','failed']);
  await runtime.withTurn('Spud',async turn=>{assert.equal(turn.previous.id,'2'); await turn.complete({status:'telegram_sent'});});
  assert.equal(db.rows.at(-1).status,'failed'); // No valid synthesis cannot replace prior.
});

test('another process owning the profile cannot be bypassed', async () => {
  const runtime=runtimeTurns({rpc:async()=>({data:null})},{enabled:true});
  let called=false;
  await assert.rejects(runtime.withTurn('Spud',async()=>{called=true}),/active turn/);
  assert.equal(called,false);
});
