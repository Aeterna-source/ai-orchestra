import test from 'node:test';
import assert from 'node:assert/strict';
import { validInterpretation } from '../lib/interpretation-schema.js';
test('structurally invalid JSON cannot be treated as interpreted memory', () => {
  for (const value of [null, [], {}, {significance:2}, {significance:0.5,memory_atoms:'text'}, {significance:0.5,intention:[]}, {significance:0.5,state_vectors:[null]}]) assert.equal(validInterpretation(value),false);
  assert.equal(validInterpretation({significance:0.5,memory_atoms:[],transfer_notes:['note']}),true);
});
