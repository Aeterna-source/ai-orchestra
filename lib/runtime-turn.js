import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export function runtimeTurns(db, { enabled = false, leaseSeconds = 180, heartbeatMs = 30000 } = {}) {
  const scope = new AsyncLocalStorage();
  const queues = new Map();
  const rpc = async (name, args) => {
    const result = await db.rpc(name, args);
    if (result.error) throw new Error(`Runtime continuity storage failed: ${name}`);
    return result.data;
  };
  async function withTurn(profile, run) {
    if (!enabled) return run(null);
    const previousTask = queues.get(profile) || Promise.resolve();
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    const currentTask = previousTask.catch(() => {}).then(() => barrier);
    queues.set(profile, currentTask);
    await previousTask.catch(() => {});
    let turn, timer, renewing = Promise.resolve(), leaseLost = false;
    try {
      const token = randomUUID();
      // A different process may own the profile. Fail explicitly; never fork its prior.
      const claim = await rpc('runtime_identity_begin', { p_profile: profile, p_token: token, p_lease_seconds: leaseSeconds });
      if (!claim?.id) throw new Error('Subject has an active turn in another process; retry after it finishes');
      const update = async (patch, status = 'pending') => {
        if (leaseLost) throw new Error('Runtime continuity lease lost');
        const ok = await rpc('runtime_identity_update', { p_profile: profile, p_token: token, p_patch: patch, p_status: status, p_lease_seconds: leaseSeconds });
        if (!ok) { leaseLost = true; throw new Error('Runtime continuity lease lost'); }
      };
      turn = { id: claim.id, token, previous: claim.previous, status: 'pending', delivered: false, validState: false,
        debug: { runtimeIdentityStatus: 'pending', runtimeIdentityPreviousPacketId: claim.previous?.id || null, structuredResults: {} },
        async save(patch) { await update(patch); },
        async assertLease() { await renewing; await update({}); },
        async complete(delivery) {
          this.delivered = true;
          const status = this.validState ? 'completed' : 'failed';
          await update({ delivery }, status);
          this.status = status; this.debug.runtimeIdentityStatus = this.validState ? 'completed' : 'unavailable';
        }
      };
      timer = setInterval(() => {
        renewing = renewing.then(() => turn.status === 'pending' ? update({}) : undefined).catch(() => { leaseLost = true; });
      }, heartbeatMs);
      timer.unref?.();
      return await scope.run(turn, () => run(turn));
    } finally {
      clearInterval(timer);
      await renewing;
      if (turn?.status === 'pending') {
        // Failure/abandonment never becomes a prior. Do not erase evidence of a
        // delivery whose continuity commit failed.
        try { await rpc('runtime_identity_update', { p_profile: profile,
          p_token: turn.token, p_patch: { delivery: turn.delivered ? { status: 'sent_commit_unconfirmed' } : { status: 'not_confirmed' } }, p_status: 'failed', p_lease_seconds: leaseSeconds }); } catch {}
      }
      release();
      if (queues.get(profile) === currentTask) queues.delete(profile);
    }
  }
  return { withTurn, current: () => scope.getStore(), enabled };
}
