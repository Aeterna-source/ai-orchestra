const arrays = ['memory_atoms','state_updates','causal_links','state_vectors','transfer_notes','meta_memory','core_updates','subject_space_actions','subject_space_objects','subject_space_threads','subject_space_relations','subject_proposals','open_questions'];
const objects = ['episode_memory','state_snapshot','drift','intention'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validInterpretation(value) {
  if (!object(value) || value.parsed === false) return false;
  if (typeof value.significance !== 'number' || !Number.isFinite(value.significance) || value.significance < 0 || value.significance > 1) return false;
  for (const key of arrays) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key])) return false;
    if (!value[key].every(item => object(item) || (['transfer_notes','open_questions'].includes(key) && typeof item === 'string'))) return false;
  }
  for (const key of objects) if (value[key] !== undefined && !object(value[key])) return false;
  if (value.needs_intention !== undefined && typeof value.needs_intention !== 'boolean') return false;
  return true;
}
