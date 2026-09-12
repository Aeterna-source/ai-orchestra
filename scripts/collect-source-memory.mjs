import { existsSync, readFileSync } from "node:fs";
import { collectSourceMemory } from "../lib/source-memory.js";

function loadLocalEnv(path = ".env") {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] != null) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const memoryTables = {
  Nevan: {
    triggers: "triggers_Nevan",
    episodes: "episodes_Nevan",
    facts: "facts_Nevan",
    reflections: "reflections_Nevan"
  },
  Reon: {
    triggers: "triggers_Reon",
    episodes: "episodes_Reon",
    facts: "facts_Reon",
    reflections: "reflections_Reon"
  },
  Spud: {
    triggers: "triggers_Spud",
    episodes: "episodes_Spud",
    facts: "facts_Spud",
    reflections: "reflections_Spud"
  },
  Grokulchik: {
    triggers: "triggers_Grokulchik",
    episodes: "episodes_Grokulchik",
    facts: "facts_Grokulchik",
    reflections: "reflections_Grokulchik"
  },
  Miro: {
    triggers: "triggers_Grokulchik",
    episodes: "episodes_Grokulchik",
    facts: "facts_Grokulchik",
    reflections: "reflections_Grokulchik"
  },
  Zefir: {
    triggers: "triggers_Zefir",
    episodes: "episodes_Zefir",
    facts: "facts_Zefir",
    reflections: "reflections_Zefir"
  }
};

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node --env-file=.env scripts/collect-source-memory.mjs --profile Miro --query \"autonomy connection\"",
    "",
    "Options:",
    "  --profile <name>       Nevan, Reon, Spud, Grokulchik, Miro, or Zefir",
    "  --query <text>         Search words for episodes, Core, facts, and reflections",
    "  --trigger <name>       Optional active trigger name",
    "  --limit <number>       Returned records, default 9",
    "  --budget <number>      JSON budget, default 9000",
    "  --candidate-limit <n>  Rows read per source table, default 160",
    "  --redact               Hide source text in output"
  ].join("\n");
}

const args = readArgs(process.argv.slice(2));
if (args.help || !args.profile || !args.query) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

loadLocalEnv();

const tables = memoryTables[args.profile];
if (!tables) {
  console.error(`Unknown profile: ${args.profile}`);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value).replace(/"/g, '\\"'));
}

function createRestDb(url, key) {
  const base = url.replace(/\/+$/, "");
  return {
    from(table) {
      const state = {
        table,
        select: "*",
        filters: [],
        order: null,
        limit: null
      };
      const chain = {
        select(columns) { state.select = columns || "*"; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        order(column, options = {}) {
          state.order = `${column}.${options.ascending ? "asc" : "desc"}`;
          return this;
        },
        limit(value) { state.limit = Number(value); return this; },
        async then(resolve, reject) {
          const params = new URLSearchParams();
          params.set("select", state.select);
          for (const [column, value] of state.filters) {
            params.set(column, `eq.${encodeFilterValue(value)}`);
          }
          if (state.order) params.set("order", state.order);
          if (Number.isFinite(state.limit)) params.set("limit", String(state.limit));

          try {
            const response = await fetch(`${base}/rest/v1/${encodeURIComponent(state.table)}?${params}`, {
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                Accept: "application/json"
              }
            });
            const text = await response.text();
            const data = text ? JSON.parse(text) : [];
            if (!response.ok) {
              return resolve({ error: { status: response.status, message: data?.message || "rest-read-failed" }, data: null });
            }
            return resolve({ error: null, data });
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        }
      };
      return chain;
    }
  };
}

const db = createRestDb(supabaseUrl, supabaseKey);
const result = await collectSourceMemory(db, {
  profile: args.profile,
  tables,
  source: "telegram",
  chatScope: "private",
  telegram: {
    chatId: args.chat_id || args["chat-id"] || "local-script",
    senderId: args.sender_id || args["sender-id"] || "local-script"
  },
  query: args.query,
  trigger: args.trigger || "",
  mode: "live",
  limit: Number(args.limit || 9),
  budget: Number(args.budget || 9000),
  candidateLimit: Number(args["candidate-limit"] || process.env.SOURCE_MEMORY_CANDIDATE_LIMIT || 160)
});

const output = {
  profile: args.profile,
  query: args.query,
  trigger: args.trigger || null,
  status: result.status,
  errors: result.errors,
  records: args.redact
    ? result.records.map(({ text, ...record }) => ({ ...record, textCharacters: text.length }))
    : result.records,
  promptCharacters: result.prompt.length
};

console.log(JSON.stringify(output, null, 2));
