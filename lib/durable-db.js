import { AsyncLocalStorage } from 'node:async_hooks';

// The journal stores reads as well as writes so a restart follows the same
// branches even when earlier writes changed the underlying records.
export function durableDatabase(client) {
  const scope = new AsyncLocalStorage();
  const db = new Proxy(client, { get(target, key) {
    if (key !== 'from') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    return table => {
      const state = scope.getStore();
      if (!state) return client.from(table);
      const request = { table, operation: 'select', filters: [], order: [] };
      let pending;
      const execute = () => pending ||= (async () => {
        const step = `${state.stage}:${state.index++}`;
        let result;
        try { result = await client.rpc('continuity_journal_step', {
          p_job: state.job.id, p_lease: state.job.locked_at, p_step: step, p_request: request
        }); } catch { result = { error: true }; }
        if (result.error) {
          const error = new Error(`Durable database step failed: ${table} ${request.operation}`);
          error.durableFailure = true;
          throw error;
        }
        return { data: result.data, error: null };
      })();
      const query = {
        select() { return this; },
        insert(row) { request.operation = 'insert'; request.row = row; return this; },
        update(row) { request.operation = 'update'; request.row = row; return this; },
        upsert(row, options) { request.operation = 'upsert'; request.row = row; request.conflict = options?.onConflict; return this; },
        eq(key, value) { request.filters.push({key, value}); return this; },
        is(key, value) { if (value !== null) throw new Error('Unsupported durable filter'); request.filters.push({key, value}); return this; },
        order(key, options) { request.order.push({key, ascending: options?.ascending !== false}); return this; },
        single() { request.single = true; request.required = true; return execute(); },
        maybeSingle() { request.single = true; return execute(); },
        then(resolve, reject) { return execute().then(resolve, reject); }
      };
      return query;
    };
  } });
  return { db, run: (job, stage, fn) => scope.run({ job, stage, index: 0 }, fn) };
}
