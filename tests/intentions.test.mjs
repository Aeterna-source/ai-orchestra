import test from 'node:test';
import assert from 'node:assert/strict';
import { writeIntention } from '../lib/intentions.js';
const previous = { id: 4, profile: 'A', status: 'active', content: 'old', source_job_id: 1, updated_at: '2026-09-01', metadata: {} };
function db(old = previous, conflict = false) {
  const state = { updates: [], filters: [] };
  state.from = () => ({ select() { return this; }, eq(...args) { state.filters.push(args); return this; }, is(...args) { state.filters.push(args); return this; },
    update(row) { state.updates.push(row); return this; },
    async maybeSingle() { return { data: state.updates.length ? (conflict ? null : { id: 4 }) : old }; } });
  return state;
}
const row = { profile: 'A', content: 'new', action: 'update', status: 'active', source_job_id: 2, metadata: {} };
const noInsert = () => { throw new Error('must not insert'); };
test('updates exact target and preserves prior revision with optimistic guard', async () => {
  const store = db();
  assert.equal((await writeIntention(store, row, 4, noInsert)).id, 4);
  assert.equal(store.updates[0].metadata.revisions[0].content, 'old');
  assert.ok(store.filters.some(([k,v]) => k === 'updated_at' && v === previous.updated_at));
  assert.ok(store.filters.some(([k,v]) => k === 'profile' && v === 'A'));
});
test('missing targets do not become new active intentions', async () => {
  assert.equal((await writeIntention(db(), row, null, noInsert)).reason, 'missing-target-id');
  assert.equal((await writeIntention(db(null), row, 4, noInsert)).reason, 'target-not-found');
});
test('close applies to same ID, closed intentions cannot be resurrected', async () => {
  const store = db();
  await writeIntention(store, { ...row, action: 'close', status: 'closed' }, 4, noInsert);
  assert.equal(store.updates[0].status, 'closed');
  assert.equal((await writeIntention(db({ ...previous, status: 'closed' }), row, 4, noInsert)).reason, 'target-not-active');
});
test('replay and revision conflicts do not overwrite target', async () => {
  const store = db({ ...previous, source_job_id: 2 });
  assert.equal((await writeIntention(store, row, 4, noInsert)).replayed, true);
  assert.equal(store.updates.length, 0);
  assert.equal((await writeIntention(db(previous, true), row, 4, noInsert)).reason, 'revision-conflict');
});
