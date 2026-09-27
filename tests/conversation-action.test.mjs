import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  const candidates = ['\nfunction ', '\nasync function ']
    .map(marker => source.indexOf(marker, start + 1))
    .filter(index => index !== -1);
  return source.slice(start, Math.min(...candidates));
}

function extractConst(name) {
  const line = source.split('\n').find(item => item.startsWith(`const ${name} = `));
  if (!line) throw new Error(`Missing ${name}`);
  return line;
}

test('conversation action tags are private control signals', () => {
  const context = vm.createContext({});
  vm.runInContext(extractConst('MEMORY_REQUEST_PATTERN'), context);
  vm.runInContext(extractConst('MEMORY_SEARCH_PATTERN'), context);
  vm.runInContext(extractConst('CORE_REQUEST_PATTERN'), context);
  vm.runInContext(extractConst('SPACE_REQUEST_PATTERN'), context);
  vm.runInContext(extractConst('CODE_AGENT_PATTERN'), context);
  vm.runInContext(extractConst('CONVERSATION_ACTION_PATTERN'), context);
  vm.runInContext(extractConst('REMEMBER_PATTERN'), context);
  vm.runInContext(extractFunction('asText'), context);
  vm.runInContext(extractFunction('extractConversationAction'), context);
  vm.runInContext(extractFunction('cleanProtocolTags'), context);

  const pass = context.extractConversationAction('<<conversation_action:pass|nothing useful to add>>');
  assert.equal(pass.action, 'passed');
  assert.equal(pass.reason, 'nothing useful to add');

  const end = context.extractConversationAction('<<conversation_action:end>>');
  assert.equal(end.action, 'ended');
  assert.equal(end.reason, '');

  const ordinary = context.extractConversationAction('Звичайна відповідь');
  assert.equal(ordinary.action, null);
  assert.equal(ordinary.reason, '');
  assert.equal(
    context.cleanProtocolTags('Текст <<conversation_action:pass|x>> [[remember:connection]]'),
    'Текст'
  );
});
