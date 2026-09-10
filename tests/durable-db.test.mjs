import test from 'node:test';
import assert from 'node:assert/strict';
import { durableDatabase } from '../lib/durable-db.js';

test('lost acknowledgement resumes with original read and exactly one insert', async () => {
  const journal = new Map(); let inserts=0, lose=true, current='before';
  const {db,run}=durableDatabase({ async rpc(name,args) {
    const key=args.p_job+':'+args.p_step;
    if(journal.has(key))return {data:journal.get(key)};
    const result=args.p_request.operation==='select'?{content:current}:{id:++inserts};
    journal.set(key,result);
    if(args.p_request.operation==='insert' && lose){lose=false;current='after';throw new Error('response lost');}
    return {data:result};
  }});
  const work=()=>run({id:1,locked_at:'lease'},'materialize-v1',async()=>{
    const read=await db.from('memory_atoms').select('*').eq('id',1).maybeSingle();
    assert.equal(read.data.content,'before');
    return db.from('memory_atoms').insert({content:read.data.content}).select('id').single();
  });
  await assert.rejects(work(),error=>error.durableFailure===true);
  assert.equal((await work()).data.id,1);
  assert.equal(inserts,1);
});

test('concurrent scopes have independent step numbers and ordinary queries bypass journal',async()=>{
  const calls=[];
  const {db,run}=durableDatabase({from:()=> 'normal',rpc:async(name,args)=>{calls.push(args);return {data:[]};}});
  assert.equal(db.from('ordinary'),'normal');
  await Promise.all([1,2].map(id=>run({id,locked_at:'lease'},'stage',async()=>db.from('memory_atoms').select('*'))));
  assert.deepEqual(calls.map(c=>[c.p_job,c.p_step]),[[1,'stage:0'],[2,'stage:0']]);
});
