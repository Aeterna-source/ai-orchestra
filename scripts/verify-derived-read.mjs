import { loadDerivedMemory } from '../lib/derived-memory.js';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const local = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
for (const [name, value] of Object.entries(local)) if (process.env[name] === undefined) process.env[name] = value;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const root = process.env.SUPABASE_URL;
const db = { from(table) {
  const params = new URLSearchParams();
  const chain = {
    select(value) { params.set('select', value); return this; },
    eq(field, value) { params.append(field, `eq.${value}`); return this; },
    in(field, values) { params.append(field, `in.(${values.join(',')})`); return this; },
    order(field, options) { params.set('order', `${field}.${options.ascending ? 'asc' : 'desc'}`); return this; },
    limit(value) { params.set('limit', value); return this; },
    then(resolve, reject) {
      return fetch(`${root}/rest/v1/${table}?${params}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
        .then(async response => response.ok ? { data: await response.json(), error: null } : { data: null, error: 'read-failed' })
        .then(resolve, reject);
    }
  }; return chain;
} };
const events = await db.from('os_events').select('profile,source,chat_scope,telegram_chat_id,sender_id,user_message,trigger_name')
  .eq('source','telegram').eq('chat_scope','private').order('created_at',{ascending:false}).limit(12);
if (events.error) throw new Error('Read-only verification unavailable');
if (!events.data?.length) throw new Error('No events visible to local credential; this is not a successful retrieval verification');
const seen = new Set();
for (const event of events.data) {
  if (seen.has(event.profile)) continue;
  seen.add(event.profile);
  const result = await loadDerivedMemory(db, { profile: event.profile, source: event.source, chatScope: event.chat_scope,
    telegram: {chatId:event.telegram_chat_id,senderId:event.sender_id}, query:event.user_message,trigger:event.trigger_name,mode:'live' });
  console.log(JSON.stringify({ profile:event.profile,status:result.status,selected:result.records.length,promptCharacters:result.prompt.length }));
  if (result.status !== 'ok') process.exitCode = 1;
}
