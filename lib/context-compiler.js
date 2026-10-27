const words = text => new Set(String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
const cost = message => typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length;

// Extractive compaction: preserve complete lines and their provenance, never
// ask another model to replace primary evidence with an untraceable paraphrase.
export function compactEvidence(text, budget, query = '') {
  if (text.length <= budget) return text;
  const terms = words(query);
  const lines = text.split('\n').map((line, index) => ({ line, index,
    score: [...terms].filter(term => line.toLowerCase().includes(term)).length }));
  const selected = [];
  let used = 40;
  for (const row of lines.sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (!row.line.trim() || used + row.line.length + 1 > budget) continue;
    selected.push(row); used += row.line.length + 1;
  }
  return selected.sort((a, b) => a.index - b.index).map(row => row.line).join('\n') + '\n[Some context omitted by budget]';
}

export function compileContext(messages, capabilities, focus = []) {
  const lastUser = messages.findLastIndex(message => message.role === 'user');
  const query = [...focus, typeof messages[lastUser]?.content === 'string' ? messages[lastUser].content : ''].join(' ');
  const terms = words(query);
  let systemIndex = 0;
  const blocks = messages.map((message, index) => {
    if (message.role !== 'system') return { message, index };
    const meta = message.contextBlock || {};
    const ordinal = systemIndex++;
    const requested = /^REQUESTED_(CORE|SOURCE_MEMORY|MEMORY|SUBJECT_SPACE):/.test(message.content);
    const id = meta.id || (ordinal === 0 ? 'identity' : ordinal === 1 ? 'protocol' : requested ? `requested-${index}` : `context-${index}`);
    const required = meta.required ?? (['identity', 'protocol', 'core', 'runtime'].includes(id) || /^REQUESTED_CORE:/.test(message.content));
    const score = (meta.priority || (requested ? 50 : 0)) + [...terms].filter(term => String(message.content).toLowerCase().includes(term)).length;
    return { message, index, id, required, score };
  });
  const selected = [], dropped = [], compressed = [];
  let available = capabilities.systemChars;
  const system = blocks.filter(block => block.id);
  // Required identity/protocol/core/runtime blocks remain whole. If they cannot
  // fit, fail explicitly instead of silently changing the subject's contract.
  for (const block of system.filter(block => block.required)) {
    available -= cost(block.message);
    selected.push(block);
  }
  if (available < 0) throw new Error('Required identity/core/runtime context exceeds configured system budget');
  for (const block of system.filter(block => !block.required).sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (cost(block.message) <= available) {
      selected.push(block); available -= cost(block.message);
    } else if (available >= 300 && typeof block.message.content === 'string') {
      const content = compactEvidence(block.message.content, available, query);
      if (content.length <= available && content !== '\n[Some context omitted by budget]') {
        selected.push({ ...block, message: { ...block.message, content } });
        compressed.push(block.id); available -= content.length;
      } else dropped.push(block.id);
    } else dropped.push(block.id);
  }
  // Retain the current multimodal input and service-followup tail verbatim.
  const tail = blocks.filter(block => !block.id && block.index >= lastUser);
  let historyBudget = capabilities.historyChars, count = 0;
  const history = [];
  for (const block of blocks.filter(block => !block.id && block.index < lastUser).reverse()) {
    const size = cost(block.message);
    if (size > historyBudget || count >= capabilities.historyMessages) break;
    history.push(block); count++; historyBudget -= size;
  }
  while (history.at(-1)?.message.role === 'assistant') history.pop();
  const clean = message => { const { contextBlock, ...wire } = message; return wire; };
  let output = [...selected, ...history, ...tail].sort((a, b) => a.index - b.index).map(block => clean(block.message));
  if (capabilities.singleSystem) output = [
    { role: 'system', content: selected.sort((a, b) => a.index - b.index).map(block => `[${block.id}]\n${block.message.content}`).join('\n\n') },
    ...output.filter(message => message.role !== 'system')
  ];
  return { messages: output, debug: { strategy: capabilities.strategy,
    selected: selected.map(block => block.id), dropped, compressed,
    historyMessages: history.length, budgetUnit: 'characters', systemChars: capabilities.systemChars - available } };
}
