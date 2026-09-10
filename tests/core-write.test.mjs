import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const source = server.slice(server.indexOf('async function upsertCoreNode('), server.indexOf('async function recordSubjectSpaceChange('));
for (const operation of ['update', 'insert']) test(`Core ${operation} failure cannot report successful materialization`, async () => {
  const query = { update() { return this; }, insert() { return this; }, eq() { return this; }, select() { return this; },
    maybeSingle: async () => ({ data: null, error: operation === 'update' ? { message: 'unavailable' } : null }),
    single: async () => ({ data: null, error: { message: 'unavailable' } }) };
  const identity = value => value;
  const context = vm.createContext({ CORE_OS_ENABLED: true, normalizeCoreKey: identity, asSubjectText: identity,
    normalizeCoreNodeType: identity, normalizeCoreStatus: identity, inferCoreModeFromKey: () => null,
    clamp01: (value, fallback) => value ?? fallback, formatSupabaseError: () => 'unavailable',
    console: { log() {} }, supabase: { from: () => query } });
  vm.runInContext(source, context);
  await assert.rejects(context.upsertCoreNode({ profile: 'test', node: { key: 'anchor', content: 'test' } }), /failed/);
});
