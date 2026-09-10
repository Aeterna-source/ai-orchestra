import test from 'node:test';
import assert from 'node:assert/strict';
import { requestManifest } from '../lib/request-manifest.js';
test('manifest fingerprints exact provider payload without storing conversation text', () => {
  const messages = [{role:'user',content:'private phrase'}];
  const body = {model:'test',messages,max_tokens:42};
  const first = requestManifest(body,messages,'/chat');
  assert.equal(JSON.stringify(first).includes('private phrase'),false);
  assert.notEqual(first.requestHash,requestManifest({...body,max_tokens:43},messages,'/chat').requestHash);
  assert.equal(first.parameters.max_tokens,42);
});
