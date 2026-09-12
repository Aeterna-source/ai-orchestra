import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSourceMemory,
  normalizeSourceRows,
  selectSourceMemory
} from "../lib/source-memory.js";

const tables = {
  triggers: "triggers_A",
  episodes: "episodes_A",
  facts: "facts_A",
  reflections: "reflections_A"
};

const rows = {
  triggers_A: [{ id: 7, name: "connection" }],
  episodes_A: [{
    id: 10,
    user_message: "Ми говорили про автономію і зв'язок",
    model_reply: "Автономія не має рвати зв'язок.",
    trigger_id: 7
  }],
  facts_A: [{
    id: 20,
    name: "principle",
    content: "Зв'язок є базовою умовою автономії",
    trigger_id: 7
  }],
  reflections_A: [{
    id: 30,
    content: "Коли немає джерела, треба сказати про невизначеність.",
    trigger_id: 7
  }],
  core_nodes: [{
    id: 40,
    profile: "A",
    node_key: "self_model.autonomy",
    node_type: "self_model",
    content: "Автономія тримається через відповідальність перед зв'язком.",
    author: "self",
    weight: 0.8,
    confidence: 0.9,
    status: "active",
    updated_at: "2026-09-12"
  }]
};

function database(fail = false) {
  return {
    from(table) {
      const state = { table, filters: [] };
      const chain = {
        select() { return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        order() { return this; },
        limit() { return this; },
        then(resolve, reject) {
          let data = rows[table] || [];
          for (const [column, value] of state.filters) {
            data = data.filter((row) => row[column] === value);
          }
          return Promise.resolve({
            error: fail ? { message: "private read failed" } : null,
            data
          }).then(resolve, reject);
        }
      };
      return chain;
    }
  };
}

function databaseWithFailedTable(failedTable) {
  return {
    from(table) {
      const base = database(table === failedTable).from(table);
      return base;
    }
  };
}

test("normalizes and selects source memory across episodes, facts, reflections, and core", () => {
  const normalized = normalizeSourceRows({
    triggers: rows.triggers_A,
    episodes: rows.episodes_A.map((row) => ({ ...row, table: "episodes_A" })),
    facts: rows.facts_A.map((row) => ({ ...row, table: "facts_A" })),
    reflections: rows.reflections_A.map((row) => ({ ...row, table: "reflections_A" })),
    core: rows.core_nodes
  });

  const selected = selectSourceMemory(normalized, { query: "автономія зв'язок невизначеність", trigger: "connection" });
  assert.equal(selected.length, 4);
  assert.deepEqual(new Set(selected.map((record) => record.kind)), new Set(["episode", "fact", "reflection", "core"]));
  assert.equal(selected.some((record) => record.triggerName === "connection"), true);
});

test("collector reads only private Telegram scope and live mode injects a prompt", async () => {
  const options = {
    profile: "A",
    tables,
    source: "telegram",
    chatScope: "private",
    telegram: { chatId: 1, senderId: 2 },
    query: "автономія зв'язок",
    trigger: "connection"
  };

  const shadow = await collectSourceMemory(database(), options);
  const live = await collectSourceMemory(database(), { ...options, mode: "live" });
  assert.equal(shadow.records.length > 0, true);
  assert.equal(shadow.prompt, "");
  assert.deepEqual(live.records, shadow.records);
  assert.match(live.prompt, /SOURCE_MEMORY/);
});

test("collector fails closed for group, API, missing config, disabled mode, and database errors", async () => {
  const options = {
    profile: "A",
    tables,
    source: "telegram",
    chatScope: "private",
    telegram: { chatId: 1, senderId: 2 },
    query: "автономія"
  };

  for (const change of [
    { source: "api" },
    { chatScope: "group" },
    { telegram: null },
    { tables: null },
    { mode: "off" }
  ]) {
    const result = await collectSourceMemory({ from() { throw new Error("must not query"); } }, { ...options, ...change });
    assert.deepEqual(result.records, []);
    assert.equal(result.prompt, "");
    assert.notEqual(result.status, "unavailable");
  }

  const failed = await collectSourceMemory(database(true), { ...options, mode: "live" });
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(failed.records, []);
  assert.equal(failed.prompt, "");
});

test("collector returns partial source memory when one legacy table is unavailable", async () => {
  const result = await collectSourceMemory(databaseWithFailedTable("reflections_A"), {
    profile: "A",
    tables,
    source: "telegram",
    chatScope: "private",
    telegram: { chatId: 1, senderId: 2 },
    query: "автономія зв'язок",
    mode: "live"
  });

  assert.equal(result.status, "partial");
  assert.deepEqual(result.errors, ["reflections_A-read-failed:private read failed"]);
  assert.equal(result.records.some((record) => record.kind === "reflection"), false);
  assert.equal(result.records.length > 0, true);
  assert.match(result.prompt, /SOURCE_MEMORY/);
});

test("selection is bounded and deduplicated", () => {
  const duplicated = [
    { kind: "fact", table: "facts_A", id: 1, content: "автономія і зв'язок" },
    { kind: "fact", table: "facts_A", id: 2, content: "автономія і зв'язок" }
  ];

  assert.equal(selectSourceMemory(duplicated, { query: "автономія", budget: 4 }).length, 0);
  assert.equal(selectSourceMemory(duplicated, { query: "автономія" }).length, 1);
});
