import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDerivedMemory, selectDerivedMemory } from '../lib/derived-memory.js';

const access = { profile: 'A', chatId: 10, senderId: 20 };
const event = { id: 1, profile: 'A', source: 'telegram', chat_scope: 'private', telegram_chat_id: '10', sender_id: '20' };
const row = { id: 2, table: 'memory_atoms', profile: 'A', status: 'active', content: 'Польові квіти', derived_from_event_ids: [1], created_at: '2026-09-10' };
test('relevant memory returns with traceable source', () => {
  const result = selectDerivedMemory([row], [event], access, 'квіти');
  assert.equal(result.length, 1); assert.deepEqual(result[0].sourceEventIds, [1]);
});
test('all sources must belong to the same private conversation and sender', () => {
  for (const change of [{ profile: 'B' }, { chat_scope: 'group' }, { telegram_chat_id: '11' }, { sender_id: '21' }, { sender_id: null }, { source: 'api' }]) {
    assert.equal(selectDerivedMemory([row], [{ ...event, ...change }], access, 'квіти').length, 0);
  }
  assert.equal(selectDerivedMemory([{ ...row, derived_from_event_ids: [1, 999] }], [event], access, 'квіти').length, 0);
});
test('foreign, archived, sourceless and other-target rows excluded', () => {
  for (const change of [{ profile: 'B' }, { status: 'archived' }, { derived_from_event_ids: [] }, { target_profile: 'B' }]) {
    assert.equal(selectDerivedMemory([{ ...row, ...change }], [event], access, 'квіти').length, 0);
  }
});
test('unrelated memories excluded; trigger match supported; output bounded and deduplicated', () => {
  assert.equal(selectDerivedMemory([row], [event], access, 'техніка').length, 0);
  assert.equal(selectDerivedMemory([{ ...row, trigger_name: 'song' }], [event], access, '', 'song').length, 1);
  assert.equal(selectDerivedMemory([row, { ...row, id: 3 }], [event], access, 'квіти').length, 1);
  assert.equal(selectDerivedMemory([row], [event], access, 'квіти', null, 5).length, 0);
});

function database(fail = false) {
  return { from(table) {
    const chain = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, in() { return this; },
      then(resolve, reject) { return Promise.resolve({ error: fail ? { message: 'private error' } : null, data: table === 'os_events' ? [event] : table === 'memory_atoms' ? [row] : [] }).then(resolve, reject); } };
    return chain;
  } };
}
const options = { profile: 'A', source: 'telegram', chatScope: 'private', telegram: { chatId: 10, senderId: 20 }, query: 'квіти' };
test('shadow records selection without injecting; live injects same selection', async () => {
  const shadow = await loadDerivedMemory(database(), options);
  const live = await loadDerivedMemory(database(), { ...options, mode: 'live' });
  assert.equal(shadow.records.length, 1); assert.equal(shadow.prompt, '');
  assert.deepEqual(live.records, shadow.records); assert.match(live.prompt, /Польові/);
});
test('unavailable storage fails closed without exposing errors', async () => {
  const result = await loadDerivedMemory(database(true), { ...options, mode: 'live' });
  assert.equal(result.status, 'unavailable'); assert.equal(result.prompt, ''); assert.deepEqual(result.records, []);
});
test('group, unauthenticated API and disabled modes perform no database queries', async () => {
  const db = { from() { throw new Error('must not query'); } };
  for (const change of [{ source: 'api' }, { chatScope: 'group' }, { telegram: null }, { mode: 'off' }]) {
    const result = await loadDerivedMemory(db, { ...options, ...change });
    assert.notEqual(result.status, 'unavailable'); assert.equal(result.prompt, '');
  }
});
