import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`async function ${name}(`);
  const candidates = ['\nfunction ', '\nasync function '].map(marker => source.indexOf(marker, start + 1)).filter(index => index !== -1);
  return source.slice(start, Math.min(...candidates));
}
test('group context loaders return empty without touching private storage', async () => {
  const context = vm.createContext({ supabase: { from() { throw new Error('private read'); } } });
  for (const name of ['loadCognitiveContext','loadCoreContext','loadSubjectSpaceContext','enqueueCognitiveInterpretation']) vm.runInContext(extract(name), context);
  assert.equal((await context.loadCognitiveContext('A', false)).prompt, '');
  assert.equal((await context.loadCoreContext('A', { allowPrivate: false })).prompt, '');
  assert.equal((await context.loadSubjectSpaceContext('A', false)).prompt, '');
  assert.equal(await context.enqueueCognitiveInterpretation({ event: { chat_scope: 'group' } }), null);
});
