// Isolated PostgreSQL (PGlite), never a production connection.
// PGLITE_MODULE must point at an installed @electric-sql/pglite ESM entry.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to an isolated PGlite installation');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table context_packets (id bigserial primary key, profile text not null,
      source text not null default 'api', chat_scope text not null default 'private', packet jsonb not null default '{}');`);
  const sql = await readFile(new URL('../supabase/runtime-identity.sql', import.meta.url),'utf8');
  await db.exec(sql);
  await db.exec(sql); // Repeatable installation.
  const begin = async (profile,token) => (await db.query('select runtime_identity_begin($1,$2) as value',[profile,token])).rows[0].value;
  const update = async (profile,token,patch,status='pending') => (await db.query('select runtime_identity_update($1,$2,$3::jsonb,$4) as value',[profile,token,JSON.stringify(patch),status])).rows[0].value;
  const token='first-lease-token-0001';
  const first=await begin('Spud',token);
  assert.equal(first.previous,null);
  assert.equal(await begin('Spud','other-lease-token-0002'),null);
  assert.ok(await begin('Reon','other-profile-token-0003'));
  await assert.rejects(update('Spud',token,{},'completed')); // No state/delivery.
  await assert.rejects(update('Spud',token,{previousPacketId:'999'}));
  assert.equal(await update('Spud',token,{state:{state_summary:'s'},exchange:{action:'passed'},delivery:{status:'telegram_sent'}},'completed'),true);
  for(let i=0;i<8;i++){
    const key=`failed-lease-token-${i}`;
    await begin('Spud',key);await update('Spud',key,{},'failed');
  }
  const next=await begin('Spud','next-lease-token-0004');
  assert.equal(next.previous.id,first.id); // More than six failed packets cannot hide prior.
  await db.query(`update context_packets set packet=jsonb_set(packet,'{runtimeIdentity,leaseExpires}',to_jsonb('2000-01-01T00:00:00Z'::text)) where id=$1`,[next.id]);
  const replacement=await begin('Spud','replacement-token-0005');
  assert.ok(replacement.id);
  assert.equal(await update('Spud','next-lease-token-0004',{state:{state_summary:'stale'}},'completed'),false);
  assert.equal(await update('Spud','replacement-token-0005',{state:{state_summary:'new'},exchange:{action:'ended'},delivery:{status:'telegram_sent'}},'completed'),true);
  assert.equal((await begin('Spud','last-lease-token-0006')).previous.id,replacement.id);
  const permissions=await db.query(`select has_function_privilege('anon','runtime_identity_begin(text,text,integer)','execute') as anon,
    has_function_privilege('authenticated','runtime_identity_update(text,text,jsonb,text,integer)','execute') as authenticated,
    has_function_privilege('service_role','runtime_identity_begin(text,text,integer)','execute') as service`);
  assert.deepEqual(permissions.rows[0],{anon:false,authenticated:false,service:true});
  console.log('Runtime SQL passed: install twice, prior lookup, profile isolation, pending exclusion, expiry fencing, pass/end, grants.');
} finally { await db.close(); }
