export async function writeIntention(db, row, targetId, insert) {
  if (!['update', 'close'].includes(row.action)) return insert('intentions', row, 'INTENTION');
  if (!Number.isSafeInteger(Number(targetId)) || Number(targetId) <= 0) {
    return { skipped: true, reason: 'missing-target-id' };
  }
  const loaded = await db.from('intentions').select('*').eq('profile', row.profile).eq('id', targetId).maybeSingle();
  if (loaded.error) throw new Error('Intention target read failed');
  const previous = loaded.data;
  if (!previous) return { skipped: true, reason: 'target-not-found' };
  if (previous.source_job_id === row.source_job_id) return { id: previous.id, replayed: true };
  if (previous.status !== 'active') return { skipped: true, reason: 'target-not-active' };
  const { metadata, ...snapshot } = previous;
  const revisions = Array.isArray(metadata?.revisions) ? metadata.revisions : [];
  const next = {
    ...row,
    updated_at: new Date().toISOString(),
    metadata: { ...row.metadata, revisions: [...revisions, { ...snapshot, metadata: { ...metadata, revisions: undefined } }] }
  };
  let request = db.from('intentions').update(next).eq('profile', row.profile).eq('id', targetId).eq('status', 'active');
  request = previous.updated_at == null ? request.is('updated_at', null) : request.eq('updated_at', previous.updated_at);
  const updated = await request.select('id').maybeSingle();
  if (updated.error) throw new Error('Intention update failed');
  if (!updated.data) return { skipped: true, reason: 'revision-conflict' };
  return updated.data;
}
