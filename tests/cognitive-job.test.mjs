import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the production worker without starting the server or its timers.
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const source = server.slice(server.indexOf('async function processCognitiveJob(job)'), server.indexOf('async function interpretCognitiveEvent(event)'));

async function run(interpretation, attempts = 1, writeFailure = false, options = {}) {
  const updates = [];
  let writes = 0;
  let remembers = 0;
  const context = vm.createContext({
    claimCognitiveJob: async () => ({ id: 7, event_id: 9, attempts, max_attempts: 3, locked_at: 'lease', result: options.priorResult }),
    supabase: { from(table) {
      if (table === 'os_events') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 9 } }) }) }) };
      assert.equal(table, 'os_jobs');
      return { update(value) {
        updates.push(value);
        const filters = {};
        const result = () => {
          assert.equal(filters.id, 7);
          assert.equal(filters.status, 'running');
          assert.equal(filters.locked_at, 'lease');
          return { data: options.checkpointFailure && value.result?.interpretation ? null : { id: 7 } };
        };
        return { eq(key, val) { filters[key] = val; return this; }, select() { return this; },
          maybeSingle: async () => result(), then(resolve) { return Promise.resolve(result()).then(resolve); } };
      } };
    } },
    interpretCognitiveEvent: async () => interpretation,
    storeCognitiveInterpretation: async () => { writes++; if (writeFailure) throw new Error('partial write'); return { atoms: 1 }; },
    maybePostInterpretRemember: async () => { remembers++; if (options.rememberFailure) throw new Error('remember failed'); return {}; },
    clamp01: (value, fallback) => value ?? fallback,
    console: { log() {} }
  });
  vm.runInContext(source, context);
  await context.processCognitiveJob({ id: 7 });
  return { updates, writes, remembers };
}

test('unparsed output retries without creating derived memories', async () => {
  const result = await run({ parsed: false, raw: 'not json' });
  assert.equal(result.writes, 0);
  assert.equal(result.remembers, 0);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].status, 'retry');
});

test('exhausted parse failure is failed, never completed', async () => {
  const result = await run({ parsed: false }, 3);
  assert.equal(result.writes, 0);
  assert.equal(result.updates[0].status, 'failed');
});

test('valid interpretation retains normal materialization and completion', async () => {
  const result = await run({ significance: 0.7 });
  assert.equal(result.writes, 1);
  assert.equal(result.remembers, 1);
  assert.equal(result.updates[0].result.materializationStarted, true);
  assert.equal(result.updates.at(-1).status, 'completed');
});

test('partial materialization fails without repeating already-written records', async () => {
  const result = await run({ significance: 0.7 }, 1, true);
  assert.equal(result.updates.at(-1).status, 'failed');
  assert.equal(result.remembers, 0);
});

test('failure after materialization never retries successful derived writes', async () => {
  const result = await run({ significance: 0.7 }, 1, false, { rememberFailure: true });
  assert.equal(result.writes, 1);
  assert.equal(result.updates.at(-1).status, 'failed');
});

test('unconfirmed checkpoint prevents all materialization', async () => {
  const result = await run({ significance: 0.7 }, 1, false, { checkpointFailure: true });
  assert.equal(result.writes, 0);
  assert.equal(result.updates.at(-1).status, 'failed');
});

test('manually requeued partial job cannot silently duplicate records', async () => {
  const result = await run({ significance: 0.7 }, 1, false, { priorResult: { materializationStarted: true } });
  assert.equal(result.writes, 0);
  assert.equal(result.updates.at(-1).status, 'failed');
});
