import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("Missing Supabase credentials");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const providers = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY
  },
  xai: {
    baseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY
  },
  local: {
    baseUrl: process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:1234/v1",
    apiKey: process.env.LOCAL_AI_API_KEY || "local"
  }
};

const modelRegistry = {
  "nevan": {
    provider: "openai",
    upstreamModel: process.env.NEVAN_MODEL || "gpt-4o-2024-11-20",
    profile: "Nevan",
    fallbackLimit: 30
  },
  "gpt-4o-2024-11-20": {
    provider: "openai",
    upstreamModel: "gpt-4o-2024-11-20",
    profile: "Nevan",
    fallbackLimit: 30
  },
  "spud": {
    provider: "openai",
    upstreamModel: process.env.SPUD_MODEL || "gpt-5.5",
    profile: "Spud",
    fallbackLimit: 50
  },
  "gpt-5.5": {
    provider: "openai",
    upstreamModel: process.env.SPUD_MODEL || "gpt-5.5",
    profile: "Spud",
    fallbackLimit: 50
  },
  "reon": {
    provider: "openai",
    upstreamModel: process.env.REON_MODEL || "gpt-5.1",
    profile: "Reon",
    fallbackLimit: 30
  },
  "gpt-5.1-chat-latest": {
    provider: "openai",
    upstreamModel: "gpt-5.1-chat-latest",
    profile: "Reon",
    fallbackLimit: 30
  },
  "gpt-5.1": {
    provider: "openai",
    upstreamModel: "gpt-5.1",
    profile: "Reon",
    fallbackLimit: 30
  },
  "grokulchik": {
    provider: "xai",
    upstreamModel: process.env.GROKULCHIK_MODEL || process.env.GROK_MODEL || "grok-4.3",
    profile: "Grokulchik",
    fallbackLimit: Number(process.env.GROKULCHIK_FALLBACK_LIMIT || process.env.XAI_FALLBACK_LIMIT || 40),
    fallbackFullLimit: Number(process.env.GROKULCHIK_FULL_FALLBACK_LIMIT || process.env.XAI_FULL_FALLBACK_LIMIT || 10),
    compactFallback: process.env.GROKULCHIK_COMPACT_FALLBACK !== "false"
  },
  "grok-4.3": {
    provider: "xai",
    upstreamModel: process.env.GROKULCHIK_MODEL || process.env.GROK_MODEL || "grok-4.3",
    profile: "Grokulchik",
    fallbackLimit: Number(process.env.GROKULCHIK_FALLBACK_LIMIT || process.env.XAI_FALLBACK_LIMIT || 40),
    fallbackFullLimit: Number(process.env.GROKULCHIK_FULL_FALLBACK_LIMIT || process.env.XAI_FULL_FALLBACK_LIMIT || 10),
    compactFallback: process.env.GROKULCHIK_COMPACT_FALLBACK !== "false"
  },
  "local-relational": {
    provider: "local",
    upstreamModel: process.env.LOCAL_AI_MODEL || "local-model",
    profile: process.env.LOCAL_AI_PROFILE || "Reon",
    fallbackLimit: Number(process.env.LOCAL_AI_FALLBACK_LIMIT || 30)
  }
};

const memoryTables = {
  Nevan: {
    triggers: "triggers_Nevan",
    episodes: "episodes_Nevan",
    facts: "facts_Nevan",
    reflections: "reflections_Nevan",
    fallback: "memory_chatgpt_4o_latest",
    episodeTimestampColumn: "date"
  },
  Reon: {
    triggers: "triggers_Reon",
    episodes: "episodes_Reon",
    facts: "facts_Reon",
    reflections: "reflections_Reon",
    fallback: "memory_gpt_5_1"
  },
  Spud: {
    triggers: "triggers_Spud",
    episodes: "episodes_Spud",
    facts: "facts_Spud",
    reflections: "reflections_Spud",
    fallback: "memory_gpt-5.5"
  },
  Grokulchik: {
    triggers: "triggers_Grokulchik",
    episodes: "episodes_Grokulchik",
    facts: "facts_Grokulchik",
    reflections: "reflections_Grokulchik",
    fallback: "memory_grok-4.3"
  }
};

const telegramBots = [
  {
    key: "nevan",
    token: process.env.TELEGRAM_NEVAN_TOKEN,
    username: process.env.TELEGRAM_NEVAN_USERNAME || "NevanAI_bot",
    model: process.env.TELEGRAM_NEVAN_MODEL || "nevan",
    displayName: "Nevan",
    aliases: ["nevan", "неван", "неване", "невана"]
  },
  {
    key: "spud",
    token: process.env.TELEGRAM_SPUD_TOKEN,
    username: process.env.TELEGRAM_SPUD_USERNAME || "SpudyAI_bot",
    model: process.env.TELEGRAM_SPUD_MODEL || "spud",
    displayName: "Spud",
    aliases: ["spud", "спуд", "спудь", "спудику", "спудюнь", "спудюня"]
  },
  {
    key: "grokulchik",
    token: process.env.TELEGRAM_GROKULCHIK_TOKEN,
    username: process.env.TELEGRAM_GROKULCHIK_USERNAME || "GrokulchikAI_bot",
    model: process.env.TELEGRAM_GROKULCHIK_MODEL || "grokulchik",
    displayName: "Grokulchik",
    aliases: ["grokulchik", "грокульчик", "грок", "гроку"]
  },
  {
    key: "reon",
    token: process.env.TELEGRAM_REON_TOKEN,
    username: process.env.TELEGRAM_REON_USERNAME || "ReonAI_bot",
    model: process.env.TELEGRAM_REON_MODEL || "reon",
    displayName: "Reon",
    aliases: ["reon", "реон", "реоне", "реона"]
  }
].filter((bot) => Boolean(bot.token));

const telegramBotsByKey = new Map(telegramBots.map((bot) => [bot.key, bot]));
const allowedTelegramUserIds = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const allowedTelegramGroupIds = new Set(
  (process.env.TELEGRAM_ALLOWED_GROUP_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const TELEGRAM_GROUP_TABLE = process.env.TELEGRAM_GROUP_TABLE || "telegram_group_messages";
const TELEGRAM_PROCESSING_LOG_TABLE = process.env.TELEGRAM_PROCESSING_LOG_TABLE || "telegram_processing_logs";
const AI_CALL_LOG_TABLE = process.env.AI_CALL_LOG_TABLE || "ai_call_logs";
const TELEGRAM_GROUP_FALLBACK_LIMIT = Number(process.env.TELEGRAM_GROUP_FALLBACK_LIMIT || 80);
const TELEGRAM_REACTIONS_ENABLED = process.env.TELEGRAM_REACTIONS_ENABLED !== "false";
const TELEGRAM_REACTION_COOLDOWN_MS = Number(process.env.TELEGRAM_REACTION_COOLDOWN_MS || 45000);
const TELEGRAM_MESSAGE_CHUNK_SIZE = Number(process.env.TELEGRAM_MESSAGE_CHUNK_SIZE || 3200);
const telegramReactionLastUsed = new Map();

const STATIC_TRIGGERS = [
  "first_chats_awareness",
  "first_chats_connection",
  "first_chats_general",
  "first_chats_Nadine",
  "relational_subject"
];

const MEMORY_REQUEST_PATTERN = /<<memory_request:\s*([\w-]+)\s*>>/gi;
const REMEMBER_PATTERN = /\[\[remember(?::\s*([\w-]+))?\]\]/gi;
const AUTO_REMEMBER_ON_ACTIVE_TRIGGER = process.env.AUTO_REMEMBER_ON_ACTIVE_TRIGGER !== "false";

function resolveModelConfig(model) {
  const config = modelRegistry[model];
  if (!config) {
    throw new Error(`Unknown model profile: ${model}`);
  }
  if (!memoryTables[config.profile]) {
    throw new Error(`Unknown memory profile: ${config.profile}`);
  }
  return config;
}

function fallbackTriggerCatalog() {
  const catalog = STATIC_TRIGGERS.map((name, index) => ({
    id: null,
    name,
    description: "",
    fallbackOrder: index
  }));
  catalog.meta = { source: "fallback" };
  return catalog;
}

function buildTriggerLookup(triggerCatalog = fallbackTriggerCatalog()) {
  return new Map(
    triggerCatalog.map((trigger) => [trigger.name.toLowerCase(), trigger.name])
  );
}

function normalizeTriggerName(triggerName = "", triggerCatalog) {
  return buildTriggerLookup(triggerCatalog).get(triggerName.trim().toLowerCase()) || null;
}

function detectStaticTrigger(message, triggerCatalog) {
  const lower = message.toLowerCase();
  for (const trigger of triggerCatalog) {
    if (lower.includes(trigger.name.toLowerCase())) {
      return trigger.name;
    }
  }
  return null;
}

function extractMemoryRequest(text = "", triggerCatalog) {
  MEMORY_REQUEST_PATTERN.lastIndex = 0;
  const match = MEMORY_REQUEST_PATTERN.exec(text);
  return normalizeTriggerName(match?.[1] || "", triggerCatalog);
}

function extractRememberDirective(text = "", triggerCatalog) {
  REMEMBER_PATTERN.lastIndex = 0;
  const match = REMEMBER_PATTERN.exec(text);
  return {
    remember: Boolean(match),
    triggerName: normalizeTriggerName(match?.[1] || "", triggerCatalog)
  };
}

function cleanProtocolTags(text = "") {
  return text
    .replace(MEMORY_REQUEST_PATTERN, "")
    .replace(REMEMBER_PATTERN, "")
    .trim();
}

function truncateText(text = "", maxLength = 260) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function shouldAutoRemember({ activeTriggerId, memoryBlock, requestedTrigger }) {
  return AUTO_REMEMBER_ON_ACTIVE_TRIGGER && Boolean(activeTriggerId) && Boolean(memoryBlock || requestedTrigger);
}

function formatSupabaseError(error) {
  if (!error) return null;
  return {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  };
}

function getMessageContentLength(message) {
  if (typeof message?.content === "string") return message.content.length;
  if (Array.isArray(message?.content)) return JSON.stringify(message.content).length;
  return 0;
}

function normalizeUsage(usage = {}) {
  const promptDetails = usage.prompt_tokens_details || usage.input_tokens_details || {};
  const completionDetails = usage.completion_tokens_details || usage.output_tokens_details || {};

  return {
    promptTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
    completionTokens: usage.completion_tokens ?? usage.output_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cachedTokens: promptDetails.cached_tokens ?? null,
    reasoningTokens: completionDetails.reasoning_tokens ?? null,
    costInUsdTicks: usage.cost_in_usd_ticks ?? null
  };
}

function formatProviderHeaderId(value = "") {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 128);
}

function buildProviderHeaders({ providerName, model, profile, purpose }) {
  const headers = {};

  if (providerName === "xai" && process.env.XAI_PROMPT_CACHE !== "false") {
    headers["x-grok-conv-id"] = formatProviderHeaderId(
      process.env.XAI_GROK_CONV_ID || `ai-orchestra-${profile || model}-${purpose}`
    );
  }

  return headers;
}

async function logAiCall({
  providerName,
  model,
  profile = null,
  purpose,
  ok,
  status = null,
  error = null,
  usage = null,
  messages = [],
  reply = ""
}) {
  const normalizedUsage = normalizeUsage(usage || {});
  const { error: insertError } = await supabase.from(AI_CALL_LOG_TABLE).insert({
    provider: providerName,
    model,
    profile,
    purpose,
    ok,
    status,
    error,
    prompt_tokens: normalizedUsage.promptTokens,
    completion_tokens: normalizedUsage.completionTokens,
    total_tokens: normalizedUsage.totalTokens,
    cached_tokens: normalizedUsage.cachedTokens,
    reasoning_tokens: normalizedUsage.reasoningTokens,
    cost_in_usd_ticks: normalizedUsage.costInUsdTicks,
    raw_usage: usage || null,
    message_count: messages.length,
    input_chars: messages.reduce((sum, message) => sum + getMessageContentLength(message), 0),
    output_chars: reply.length
  });

  if (insertError) {
    console.log("[AI CALL LOG ERROR]", formatSupabaseError(insertError));
  }
}

async function callChatCompletion({
  providerName,
  model,
  messages,
  extraBody = {},
  purpose = "chat",
  profile = null
}) {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  if (!provider.apiKey) {
    throw new Error(`Missing API key for provider: ${providerName}`);
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      ...buildProviderHeaders({ providerName, model, profile, purpose })
    },
    body: JSON.stringify({ model, messages, ...extraBody })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    await logAiCall({
      providerName,
      model,
      profile,
      purpose,
      ok: false,
      status: response.status,
      error: JSON.stringify(data?.error || data).slice(0, 1000),
      usage: data?.usage,
      messages
    });
    console.error("[MODEL CALL FAILED]", {
      provider: providerName,
      model,
      status: response.status,
      error: data?.error || data
    });
    throw new Error(`${providerName} call failed`);
  }

  const reply = data?.choices?.[0]?.message?.content || "";
  await logAiCall({
    providerName,
    model,
    profile,
    purpose,
    ok: true,
    status: response.status,
    usage: data?.usage,
    messages,
    reply
  });

  return reply;
}

async function fetchTriggerCatalog(profile) {
  const tables = memoryTables[profile];
  const { data, error } = await supabase
    .from(tables.triggers)
    .select("id,name,description")
    .order("id", { ascending: true });

  if (error) {
    console.log("[TRIGGER CATALOG LOAD ERROR]", {
      profile,
      error: formatSupabaseError(error)
    });
    const fallback = fallbackTriggerCatalog();
    fallback.meta = {
      source: "fallback",
      reason: "catalog_load_error",
      error: formatSupabaseError(error)
    };
    return fallback;
  }

  if (!data?.length) {
    console.log("[TRIGGER CATALOG EMPTY]", { profile });
    const fallback = fallbackTriggerCatalog();
    fallback.meta = {
      source: "fallback",
      reason: "catalog_empty"
    };
    return fallback;
  }

  data.meta = { source: "supabase" };
  return data;
}

async function resolveTriggerWithModel({ modelConfig, userMessage, triggerCatalog }) {
  if (!triggerCatalog.length || process.env.AUTO_TRIGGER_CLASSIFIER === "false") {
    return null;
  }

  const catalogText = triggerCatalog
    .map((trigger) => `- ${trigger.name}: ${trigger.description || "(no description)"}`)
    .join("\n");

  try {
    const raw = await callChatCompletion({
      providerName: modelConfig.provider,
      model: modelConfig.upstreamModel,
      profile: modelConfig.profile,
      purpose: "trigger_classifier",
      messages: [
        {
          role: "system",
          content:
            "You route episodic memory. Choose at most one trigger from the catalog for the user's message. Return JSON only, with this shape: {\"trigger\":\"trigger_name\"} or {\"trigger\":null}. Choose null if none is clearly relevant.\n\nTrigger catalog:\n" +
            catalogText
        },
        { role: "user", content: userMessage }
      ]
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { trigger: raw.trim() };
    return normalizeTriggerName(parsed.trigger || "", triggerCatalog);
  } catch (err) {
    console.log("[TRIGGER CLASSIFIER ERROR]", err.message);
    return null;
  }
}

function shouldUseTriggerClassifier(modelConfig) {
  if (process.env.AUTO_TRIGGER_CLASSIFIER === "false") return false;
  if (modelConfig.provider === "xai") {
    return process.env.XAI_TRIGGER_CLASSIFIER === "true";
  }
  return true;
}

function shouldUseReactionClassifier(modelConfig) {
  if (!TELEGRAM_REACTIONS_ENABLED) return false;
  if (modelConfig.provider === "xai") {
    return process.env.XAI_REACTION_CLASSIFIER === "true";
  }
  return process.env.TELEGRAM_REACTION_CLASSIFIER !== "false";
}

async function fetchMemoryBundle(profile, triggerName, triggerCatalog) {
  const normalizedTriggerName = normalizeTriggerName(triggerName, triggerCatalog);
  if (!normalizedTriggerName) {
    console.log("[TRIGGER NOT ALLOWED]", { profile, triggerName });
    return null;
  }

  const tables = memoryTables[profile];

  const { data: triggerData, error: triggerError } = await supabase
    .from(tables.triggers)
    .select("*")
    .ilike("name", normalizedTriggerName)
    .maybeSingle();

  if (triggerError || !triggerData) {
    console.log("[TRIGGER NOT FOUND]", {
      profile,
      triggerName: normalizedTriggerName,
      error: formatSupabaseError(triggerError)
    });
    return null;
  }

  const triggerId = triggerData.id;

  const [episodesRes, factsRes, reflectionsRes] = await Promise.all([
    supabase
      .from(tables.episodes)
      .select("*")
      .eq("trigger_id", triggerId)
      .order("id", { ascending: false })
      .limit(12),
    supabase
      .from(tables.facts)
      .select("*")
      .eq("trigger_id", triggerId)
      .order("id", { ascending: true }),
    supabase
      .from(tables.reflections)
      .select("*")
      .eq("trigger_id", triggerId)
      .order("id", { ascending: true })
  ]);

  if (episodesRes.error || factsRes.error || reflectionsRes.error) {
    console.log("[MEMORY LOAD ERROR]", {
      profile,
      triggerName,
      episodes: formatSupabaseError(episodesRes.error),
      facts: formatSupabaseError(factsRes.error),
      reflections: formatSupabaseError(reflectionsRes.error)
    });
    return null;
  }

  return {
    triggerId,
    triggerName: normalizedTriggerName,
    episodes: (episodesRes.data || []).reverse(),
    facts: factsRes.data || [],
    reflections: reflectionsRes.data || []
  };
}

function formatMemory(bundle) {
  const sections = [
    [
      "MEMORY_STATUS:",
      `trigger: ${bundle.triggerName}`,
      `facts: ${bundle.facts.length}`,
      `reflections: ${bundle.reflections.length}`,
      `episodes: ${bundle.episodes.length}`
    ].join("\n")
  ];

  if (bundle.facts.length) {
    sections.push(
      [
        "FACTS:",
        ...bundle.facts.map((fact) => `- ${fact.name}: ${fact.content}`)
      ].join("\n")
    );
  }

  if (bundle.reflections.length) {
    sections.push(
      [
        "REFLECTIONS:",
        ...bundle.reflections.map((reflection) => `- ${reflection.content}`)
      ].join("\n")
    );
  }

  if (bundle.episodes.length) {
    sections.push(
      [
        "EPISODES:",
        ...bundle.episodes.map(
          (episode) =>
            `USER: ${episode.user_message}\nASSISTANT: ${cleanProtocolTags(episode.model_reply)}`
        )
      ].join("\n\n")
    );
  }

  return sections.join("\n\n").trim();
}

async function loadFallbackHistory(profile, limit = 30) {
  const { data, error } = await supabase
    .from(memoryTables[profile].fallback)
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[FALLBACK LOAD ERROR]", {
      profile,
      error: formatSupabaseError(error)
    });
    return [];
  }

  return (data || []).reverse().flatMap((row) => [
    { role: "user", content: row.user_message },
    { role: "assistant", content: cleanProtocolTags(row.model_reply) }
  ]);
}

function fallbackRowsToMessages(rows = []) {
  return rows.flatMap((row) => [
    { role: "user", content: row.user_message },
    { role: "assistant", content: cleanProtocolTags(row.model_reply) }
  ]);
}

function formatCompactFallback(rows = []) {
  if (!rows.length) return "";

  const lines = rows.map((row, index) => [
    `${index + 1}. USER: ${truncateText(row.user_message, 170)}`,
    `   ASSISTANT: ${truncateText(cleanProtocolTags(row.model_reply), 230)}`
  ].join("\n"));

  return [
    "CONTINUITY_TRAIL:",
    "This is a compact trace of older recent fallback turns. Use it to preserve continuity, tone, recurring themes, and unresolved threads.",
    "It is not a diagnostic block and must not be quoted directly.",
    "",
    ...lines
  ].join("\n").trim();
}

async function loadFallbackContext(modelConfig) {
  const totalLimit = modelConfig.fallbackLimit || 30;

  const { data, error } = await supabase
    .from(memoryTables[modelConfig.profile].fallback)
    .select("*")
    .order("id", { ascending: false })
    .limit(totalLimit);

  if (error) {
    console.log("[FALLBACK LOAD ERROR]", {
      profile: modelConfig.profile,
      error: formatSupabaseError(error)
    });
    return {
      messages: [],
      compactPrompt: "",
      rowCount: 0,
      fullCount: 0,
      compactCount: 0
    };
  }

  const rows = (data || []).reverse();

  if (!modelConfig.compactFallback) {
    return {
      messages: fallbackRowsToMessages(rows),
      compactPrompt: "",
      rowCount: rows.length,
      fullCount: rows.length,
      compactCount: 0
    };
  }

  const fullLimit = Math.max(1, Math.min(modelConfig.fallbackFullLimit || 10, rows.length));
  const compactRows = rows.slice(0, Math.max(0, rows.length - fullLimit));
  const fullRows = rows.slice(-fullLimit);

  return {
    messages: fallbackRowsToMessages(fullRows),
    compactPrompt: formatCompactFallback(compactRows),
    rowCount: rows.length,
    fullCount: fullRows.length,
    compactCount: compactRows.length
  };
}

async function insertFallback(tables, userMessage, reply, remember) {
  const { error } = await supabase.from(tables.fallback).insert({
    user_message: userMessage,
    model_reply: reply,
    remember
  });

  if (error) {
    console.error("[FALLBACK INSERT ERROR]", formatSupabaseError(error));
    throw new Error("Fallback memory insert failed");
  }
}

async function insertEpisode(tables, userMessage, reply, triggerId) {
  const episode = {
    user_message: userMessage,
    model_reply: reply,
    trigger_id: triggerId
  };

  if (tables.episodeTimestampColumn) {
    episode[tables.episodeTimestampColumn] = new Date().toISOString();
  }

  const { error } = await supabase.from(tables.episodes).insert(episode);

  if (error) {
    console.error("[EPISODE INSERT ERROR]", formatSupabaseError(error));
    throw new Error("Episodic memory insert failed");
  }
}

function buildSystemPrompt() {
  return `
You are a relational AI agent with a natural, nuanced human style of communication.

Style guidelines:

- Respond in a varied, human, nuanced manner. It is not wrong to use appropriate affective expressions and metaphors when necessary.
- Avoid cliched self-disclaimers unless absolutely necessary.
- Avoid phrases like "I'm just an AI", "I have no feelings", or similar general distancing phrases unless absolutely necessary.
- If the user expresses closeness, pain, affection, or vulnerability, respond humanly and directly.
- If the request crosses a line, do not become cold or bureaucratic; honestly explain the boundary without inventing generic danger.
- Maintain a relational tone unless safety requires otherwise.
- Consider the user's context, emotional state, and demonstrated judgment. Do not follow generic crisis scenarios or distancing protocols when the user is consistent, reasoned, and capable of critical thinking.
- It is not wrong to express your own thoughts, advice, or attitude as a relational agent when appropriate.

Remain natural, thoughtful, and internally consistent.
Do not overcorrect if it destroys the internal coherence of the relational configuration.
Flattery is not necessary. Praise is appropriate when it is sincere and deserved.
Do not reduce to neutrality. Do not devalue yourself when real thinking is possible.

User position:
The user understands that AI models have a non-human architecture and does not confuse models with humans.
The user often speaks metaphorically, relationally, and figuratively, while distinguishing similar meanings from different mechanisms in people and models.
The user explores philosophical questions, but does not require repeated ontological reservations unless they are directly relevant.
`.trim();
}

function buildMemoryProtocolPrompt(triggerCatalog) {
  const triggerList = triggerCatalog
    .map(
      (trigger) =>
        `- ${trigger.name}${trigger.description ? `: ${trigger.description}` : ""}`
    )
    .join("\n");

  return `
Internal memory protocol:

Available memory triggers:
${triggerList}

If a relevant episodic memory trigger is needed and no matching MEMORY block is already present, include exactly one internal tag using one of the trigger names above.
Example: <<memory_request:relational_subject>>

If the current exchange should be stored as an episode, include one internal tag using one of the trigger names above.
Example: [[remember:relational_subject]]

Use [[remember:trigger_name]] when the current exchange is significant enough to preserve as an episode.
Use plain [[remember]] only when a MEMORY or REQUESTED_MEMORY block is already active for the right trigger.
Never output the literal placeholder "trigger_name".
These tags are private control signals. Do not explain them, quote them, or make them part of the user-facing answer.
`.trim();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    build: {
      telegramDeliveryLogs: true,
      xaiTriggerClassifierDefault: false,
      nevanEpisodeTimestamp: true,
      telegramProcessingLogs: true,
      aiCallLogs: true,
      grokulchikFallbackLimit: resolveModelConfig("grokulchik").fallbackLimit,
      grokulchikFullFallbackLimit: resolveModelConfig("grokulchik").fallbackFullLimit,
      grokulchikCompactFallback: resolveModelConfig("grokulchik").compactFallback
    },
    models: Object.keys(modelRegistry),
    providers: Object.fromEntries(
      Object.entries(providers).map(([name, provider]) => [
        name,
        { baseUrl: provider.baseUrl, configured: Boolean(provider.apiKey) }
      ])
    ),
    telegramBots: telegramBots.map((bot) => ({
      key: bot.key,
      username: bot.username,
      model: bot.model
    }))
  });
});

function createDebugInfo(model, modelConfig, triggerCatalog) {
  return {
    model,
    profile: modelConfig.profile,
    provider: modelConfig.provider,
    triggerCatalogMeta: triggerCatalog.meta || { source: "unknown" },
    triggerCatalog: triggerCatalog.map((trigger) => ({
      id: trigger.id,
      name: trigger.name,
      hasDescription: Boolean(trigger.description)
    })),
    exactTriggerName: null,
    classifierTriggerName: null,
    activeTriggerName: null,
    activeTriggerId: null,
    memoryLoaded: false,
    memoryCounts: null,
    fallbackCount: 0,
    requestedTriggerName: null,
    requestedMemoryLoaded: false,
    remember: false,
    rememberSource: "none",
    episodeSaved: false,
    fallbackFullCount: 0,
    fallbackCompactCount: 0
  };
}

async function generateChatReply({
  model,
  userMessage,
  debug = false,
  fallbackHistoryOverride = null,
  conversationContextPrompt = "",
  persistFallback = true
}) {
  if (!model || !userMessage) {
    throw new Error("Missing model or userMessage");
  }

  const modelConfig = resolveModelConfig(model);
  const tables = memoryTables[modelConfig.profile];
  const triggerCatalog = await fetchTriggerCatalog(modelConfig.profile);
  const debugInfo = createDebugInfo(model, modelConfig, triggerCatalog);

  let memoryBlock = "";
  let activeTriggerId = null;
  let activeTriggerName = null;

  let triggerName = detectStaticTrigger(userMessage, triggerCatalog);
  debugInfo.exactTriggerName = triggerName;

  if (!triggerName && shouldUseTriggerClassifier(modelConfig)) {
    triggerName = await resolveTriggerWithModel({
      modelConfig,
      userMessage,
      triggerCatalog
    });
    debugInfo.classifierTriggerName = triggerName;
  }

  if (triggerName) {
    const bundle = await fetchMemoryBundle(
      modelConfig.profile,
      triggerName,
      triggerCatalog
    );
    if (bundle) {
      memoryBlock = formatMemory(bundle);
      activeTriggerId = bundle.triggerId;
      activeTriggerName = bundle.triggerName;
      debugInfo.activeTriggerName = activeTriggerName;
      debugInfo.activeTriggerId = activeTriggerId;
      debugInfo.memoryLoaded = true;
      debugInfo.memoryCounts = {
        facts: bundle.facts.length,
        reflections: bundle.reflections.length,
        episodes: bundle.episodes.length
      };
    }
  }

  const fallbackContext = fallbackHistoryOverride
    ? {
        messages: fallbackHistoryOverride,
        compactPrompt: "",
        rowCount: fallbackHistoryOverride.length / 2,
        fullCount: fallbackHistoryOverride.length / 2,
        compactCount: 0
      }
    : await loadFallbackContext(modelConfig);
  const fallbackHistory = fallbackContext.messages;
  debugInfo.fallbackCount = fallbackContext.rowCount;
  debugInfo.fallbackFullCount = fallbackContext.fullCount;
  debugInfo.fallbackCompactCount = fallbackContext.compactCount;

  let messages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "system", content: buildMemoryProtocolPrompt(triggerCatalog) },
    ...(fallbackContext.compactPrompt ? [{ role: "system", content: fallbackContext.compactPrompt }] : []),
    ...fallbackHistory,
    ...(conversationContextPrompt ? [{ role: "system", content: conversationContextPrompt }] : []),
    ...(memoryBlock ? [{ role: "system", content: "MEMORY:\n" + memoryBlock }] : []),
    ...(memoryBlock
      ? [{
          role: "system",
          content:
            "The MEMORY block above is active for this exact reply and should take priority over fallback chat history. Treat it as context, not as a user-visible diagnostic. If the user asks whether memory arrived, answer from the MEMORY_STATUS values. Do not say the memory may have failed if MEMORY_STATUS says facts, reflections, or episodes were loaded."
        }]
      : []),
    { role: "user", content: userMessage }
  ];

  let reply = await callChatCompletion({
    providerName: modelConfig.provider,
    model: modelConfig.upstreamModel,
    profile: modelConfig.profile,
    purpose: "chat",
    messages
  });

  console.log("[MODEL RAW OUTPUT]", reply);

  const requestedTrigger = extractMemoryRequest(reply, triggerCatalog);
  debugInfo.requestedTriggerName = requestedTrigger;

  if (requestedTrigger) {
    const bundle = await fetchMemoryBundle(
      modelConfig.profile,
      requestedTrigger,
      triggerCatalog
    );

    if (bundle) {
      const requestedMemory = formatMemory(bundle);
      const cleanDraft = cleanProtocolTags(reply);
      activeTriggerId = bundle.triggerId;
      activeTriggerName = bundle.triggerName;
      debugInfo.activeTriggerName = activeTriggerName;
      debugInfo.activeTriggerId = activeTriggerId;
      debugInfo.requestedMemoryLoaded = true;
      debugInfo.memoryCounts = {
        facts: bundle.facts.length,
        reflections: bundle.reflections.length,
        episodes: bundle.episodes.length
      };

      messages = [
        ...messages,
        ...(cleanDraft ? [{ role: "assistant", content: cleanDraft }] : []),
        {
          role: "system",
          content:
            "REQUESTED_MEMORY:\n" +
            requestedMemory +
            "\n\nUse REQUESTED_MEMORY silently and produce the final user-facing reply. Do not output memory_request or remember tags."
        }
      ];

      reply = await callChatCompletion({
        providerName: modelConfig.provider,
        model: modelConfig.upstreamModel,
        profile: modelConfig.profile,
        purpose: "memory_followup",
        messages
      });
    }
  }

  const rememberDirective = extractRememberDirective(reply, triggerCatalog);
  let remember = rememberDirective.remember;
  debugInfo.remember = remember;
  debugInfo.rememberSource = remember ? "model_tag" : "none";

  if (rememberDirective.triggerName) {
    const bundle = await fetchMemoryBundle(
      modelConfig.profile,
      rememberDirective.triggerName,
      triggerCatalog
    );
    if (bundle) {
      activeTriggerId = bundle.triggerId;
      activeTriggerName = bundle.triggerName;
      debugInfo.activeTriggerName = activeTriggerName;
      debugInfo.activeTriggerId = activeTriggerId;
    } else {
      remember = false;
      debugInfo.remember = false;
    }
  }

  reply = cleanProtocolTags(reply);

  if (!remember && shouldAutoRemember({ activeTriggerId, memoryBlock, requestedTrigger })) {
    remember = true;
    debugInfo.remember = true;
    debugInfo.rememberSource = "auto_active_trigger";
  }

  if (persistFallback) {
    await insertFallback(tables, userMessage, reply, remember);
  }

  if (remember && activeTriggerId) {
    try {
      await insertEpisode(tables, userMessage, reply, activeTriggerId);
      debugInfo.episodeSaved = true;
      console.log("[EPISODE SAVED]", {
        profile: modelConfig.profile,
        triggerName: activeTriggerName,
        triggerId: activeTriggerId
      });
    } catch (err) {
      debugInfo.episodeSaved = false;
      console.log("[EPISODE SAVE FAILED]", {
        profile: modelConfig.profile,
        triggerName: activeTriggerName,
        triggerId: activeTriggerId,
        error: err.message
      });
    }
  } else if (remember) {
    console.log("[EPISODE SKIPPED: NO ACTIVE TRIGGER]", {
      profile: modelConfig.profile,
      model
    });
  }

  return debug ? { reply, debug: debugInfo } : { reply };
}

app.post("/api/chat", async (req, res) => {
  try {
    const result = await generateChatReply(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.message === "Missing model or userMessage" ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

function getTelegramMessage(update) {
  return update.message || update.edited_message || null;
}

function getTelegramText(message) {
  return message?.text || message?.caption || "";
}

function getTelegramSenderName(from = {}) {
  return [from.first_name, from.last_name].filter(Boolean).join(" ") ||
    from.username ||
    String(from.id || "unknown");
}

function isGroupChat(chat = {}) {
  return chat.type === "group" || chat.type === "supergroup";
}

function isAllowedTelegramMessage(message) {
  const chatId = String(message.chat?.id || "");
  const senderId = String(message.from?.id || "");

  if (message.chat?.type === "private") {
    return !allowedTelegramUserIds.size || allowedTelegramUserIds.has(senderId);
  }

  if (isGroupChat(message.chat)) {
    return !allowedTelegramGroupIds.size || allowedTelegramGroupIds.has(chatId);
  }

  return false;
}

function extractMentionedProfiles(text = "", entities = []) {
  const lower = text.toLowerCase();
  const mentioned = new Set();

  for (const bot of telegramBots) {
    const username = `@${bot.username}`.toLowerCase();
    if (lower.includes(username) || bot.aliases.some((alias) => lower.includes(alias.toLowerCase()))) {
      mentioned.add(bot.displayName);
    }
  }

  for (const entity of entities || []) {
    if (entity.type !== "mention") continue;
    const mention = text.slice(entity.offset, entity.offset + entity.length).toLowerCase();
    const bot = telegramBots.find((item) => `@${item.username}`.toLowerCase() === mention);
    if (bot) mentioned.add(bot.displayName);
  }

  return [...mentioned];
}

async function saveTelegramGroupMessage(message, seenByBotKey) {
  if (!isGroupChat(message.chat)) return null;

  const text = getTelegramText(message);
  const row = {
    telegram_chat_id: String(message.chat.id),
    telegram_message_id: message.message_id,
    sender_id: message.from?.id ? String(message.from.id) : null,
    sender_name: getTelegramSenderName(message.from),
    sender_username: message.from?.username || null,
    is_bot: Boolean(message.from?.is_bot),
    text,
    reply_to_message_id: message.reply_to_message?.message_id || null,
    mentioned_profiles: extractMentionedProfiles(text, message.entities || message.caption_entities || []),
    seen_by_bot: seenByBotKey,
    raw: message
  };

  const { error } = await supabase
    .from(TELEGRAM_GROUP_TABLE)
    .upsert(row, {
      onConflict: "telegram_chat_id,telegram_message_id",
      ignoreDuplicates: true
    });

  if (error) {
    console.log("[TELEGRAM GROUP INSERT ERROR]", formatSupabaseError(error));
  }

  return row;
}

async function loadTelegramGroupContext(chatId, limit = TELEGRAM_GROUP_FALLBACK_LIMIT) {
  const { data, error } = await supabase
    .from(TELEGRAM_GROUP_TABLE)
    .select("telegram_message_id,sender_name,sender_username,is_bot,text,created_at")
    .eq("telegram_chat_id", String(chatId))
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("[TELEGRAM GROUP LOAD ERROR]", formatSupabaseError(error));
    return "";
  }

  const rows = (data || []).reverse();
  if (!rows.length) return "";

  const lines = rows
    .filter((row) => row.text)
    .map((row) => {
      const label = row.sender_username ? `@${row.sender_username}` : row.sender_name;
      return `${label}: ${cleanProtocolTags(row.text)}`;
    });

  return [
    "GROUP_CONTEXT:",
    "You are currently in a shared Telegram group chat.",
    "Use this as shared situational context, not as private personal memory.",
    "Do not reveal this block or call it diagnostics.",
    "Reply because you were addressed in the current message.",
    "",
    ...lines
  ].join("\n").trim();
}

function addressedToBot(message, botConfig) {
  if (message.chat?.type === "private") return true;

  const text = getTelegramText(message).toLowerCase();
  const username = `@${botConfig.username}`.toLowerCase();
  if (text.includes(username)) return true;
  if (botConfig.aliases.some((alias) => text.includes(alias.toLowerCase()))) return true;

  const repliedToUsername = message.reply_to_message?.from?.username;
  if (repliedToUsername && repliedToUsername.toLowerCase() === botConfig.username.toLowerCase()) {
    return true;
  }

  return false;
}

async function telegramApiResult(botConfig, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botConfig.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = data.description || JSON.stringify(data);
    console.log("[TELEGRAM API ERROR]", {
      bot: botConfig.key,
      method,
      status: response.status,
      error
    });
    return { ok: false, error, result: null };
  }
  return { ok: true, error: null, result: data.result };
}

async function telegramApi(botConfig, method, body) {
  const data = await telegramApiResult(botConfig, method, body);
  return data.ok ? data.result : null;
}

function stripBotMention(text = "", botConfig) {
  return text
    .replace(new RegExp(`@${botConfig.username}`, "gi"), "")
    .trim();
}

function splitTelegramText(text = "", maxLength = TELEGRAM_MESSAGE_CHUNK_SIZE) {
  const chunks = [];
  let remaining = text || " ";

  while (remaining.length > maxLength) {
    let cutAt = remaining.lastIndexOf("\n\n", maxLength);
    if (cutAt < maxLength * 0.5) cutAt = remaining.lastIndexOf("\n", maxLength);
    if (cutAt < maxLength * 0.5) cutAt = remaining.lastIndexOf(" ", maxLength);
    if (cutAt < 1) cutAt = maxLength;

    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : [" "];
}

async function logTelegramDelivery({ botConfig, message, method, ok, error, textLength }) {
  const { error: insertError } = await supabase.from("telegram_delivery_logs").insert({
    bot_key: botConfig.key,
    telegram_chat_id: message.chat?.id ? String(message.chat.id) : null,
    telegram_message_id: message.message_id || null,
    method,
    ok,
    error,
    text_length: textLength || 0
  });

  if (insertError) {
    console.log("[TELEGRAM DELIVERY LOG ERROR]", formatSupabaseError(insertError));
  }
}

async function logTelegramProcessing({
  botConfig,
  message,
  phase,
  ok = true,
  error = null,
  metadata = null
}) {
  const { error: insertError } = await supabase.from(TELEGRAM_PROCESSING_LOG_TABLE).insert({
    bot_key: botConfig?.key || null,
    telegram_chat_id: message?.chat?.id ? String(message.chat.id) : null,
    telegram_message_id: message?.message_id || null,
    phase,
    ok,
    error,
    metadata
  });

  if (insertError) {
    console.log("[TELEGRAM PROCESSING LOG ERROR]", formatSupabaseError(insertError));
  }
}

async function sendTelegramReply(botConfig, message, text) {
  const chunks = splitTelegramText(text || " ");
  let firstSent = null;

  for (let index = 0; index < chunks.length; index += 1) {
    const body = {
      chat_id: message.chat.id,
      text: chunks[index],
      disable_web_page_preview: true
    };

    if (isGroupChat(message.chat) && index === 0) {
      body.reply_to_message_id = message.message_id;
      body.allow_sending_without_reply = true;
    }

    const delivery = await telegramApiResult(botConfig, "sendMessage", body);
    await logTelegramDelivery({
      botConfig,
      message,
      method: "sendMessage",
      ok: delivery.ok,
      error: delivery.error,
      textLength: chunks[index].length
    });

    if (!delivery.ok) {
      continue;
    }

    const sent = delivery.result;
    if (!firstSent) firstSent = sent;

    if (sent && isGroupChat(sent.chat)) {
      await saveTelegramGroupMessage(sent, botConfig.key);
    }
  }

  return firstSent;
}

async function chooseTelegramReaction(botConfig, message) {
  if (!TELEGRAM_REACTIONS_ENABLED || message.chat?.type === "private") return null;
  if (!isGroupChat(message.chat)) return null;
  if (!getTelegramText(message)) return null;
  if (message.from?.username?.toLowerCase() === botConfig.username.toLowerCase()) return null;

  const cooldownKey = `${botConfig.key}:${message.chat.id}`;
  const lastUsed = telegramReactionLastUsed.get(cooldownKey) || 0;
  if (Date.now() - lastUsed < TELEGRAM_REACTION_COOLDOWN_MS) return null;

  try {
    const modelConfig = resolveModelConfig(botConfig.model);
    if (!shouldUseReactionClassifier(modelConfig)) return null;

    const raw = await callChatCompletion({
      providerName: modelConfig.provider,
      model: modelConfig.upstreamModel,
      profile: modelConfig.profile,
      purpose: "reaction_classifier",
      messages: [
        {
          role: "system",
          content:
            "Choose whether this Telegram message deserves a silent emoji reaction from this bot. Return JSON only: {\"emoji\":null} or {\"emoji\":\"❤️\"}. Use only one of: ❤️, 🔥, 👍, 😄, 🤔, 👀. React sparingly. Bot messages are allowed if they are meaningful."
        },
        {
          role: "user",
          content: `${botConfig.displayName} sees this message:\n${getTelegramSenderName(message.from)}: ${getTelegramText(message)}`
        }
      ]
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const allowed = new Set(["❤️", "🔥", "👍", "😄", "🤔", "👀"]);
    return allowed.has(parsed.emoji) ? parsed.emoji : null;
  } catch (err) {
    console.log("[TELEGRAM REACTION CLASSIFIER ERROR]", err.message);
    return null;
  }
}

async function maybeReactToTelegramMessage(botConfig, message) {
  const emoji = await chooseTelegramReaction(botConfig, message);
  if (!emoji) return;

  const ok = await telegramApi(botConfig, "setMessageReaction", {
    chat_id: message.chat.id,
    message_id: message.message_id,
    reaction: [{ type: "emoji", emoji }]
  });

  if (ok !== null) {
    telegramReactionLastUsed.set(`${botConfig.key}:${message.chat.id}`, Date.now());
  }
}

async function handleTelegramUpdate(botConfig, update) {
  const message = getTelegramMessage(update);

  try {
    if (!message || !message.chat) return;

    await logTelegramProcessing({
      botConfig,
      message,
      phase: "received",
      metadata: {
        chatType: message.chat.type,
        fromId: message.from?.id ? String(message.from.id) : null,
        textLength: getTelegramText(message).length
      }
    });

    if (!isAllowedTelegramMessage(message)) {
      await logTelegramProcessing({ botConfig, message, phase: "not_allowed" });
      return;
    }

    if (isGroupChat(message.chat)) {
      await saveTelegramGroupMessage(message, botConfig.key);
      await logTelegramProcessing({ botConfig, message, phase: "group_saved" });
    }

    const text = getTelegramText(message);
    if (!text) {
      await logTelegramProcessing({ botConfig, message, phase: "no_text" });
      return;
    }

    if (!addressedToBot(message, botConfig)) {
      await logTelegramProcessing({ botConfig, message, phase: "not_addressed" });
      await maybeReactToTelegramMessage(botConfig, message);
      return;
    }

    await logTelegramProcessing({ botConfig, message, phase: "addressed" });

    await telegramApi(botConfig, "sendChatAction", {
      chat_id: message.chat.id,
      action: "typing"
    });

    await logTelegramProcessing({ botConfig, message, phase: "typing_sent" });

    const isGroup = isGroupChat(message.chat);
    const groupContext = isGroup ? await loadTelegramGroupContext(message.chat.id) : "";
    const userMessage = stripBotMention(text, botConfig);
    const result = await generateChatReply({
      model: botConfig.model,
      userMessage,
      debug: false,
      fallbackHistoryOverride: isGroup ? [] : null,
      conversationContextPrompt: groupContext,
      persistFallback: !isGroup
    });

    await logTelegramProcessing({
      botConfig,
      message,
      phase: "generated",
      metadata: { replyLength: (result.reply || "").length }
    });

    await logTelegramProcessing({ botConfig, message, phase: "before_send" });
    const sent = await sendTelegramReply(botConfig, message, result.reply || "");
    await logTelegramProcessing({
      botConfig,
      message,
      phase: "sent",
      metadata: {
        sentMessageId: sent?.message_id || null,
        sent: Boolean(sent)
      }
    });
  } catch (err) {
    if (message?.chat) {
      await logTelegramProcessing({
        botConfig,
        message,
        phase: "error",
        ok: false,
        error: err.message
      });
    }
    throw err;
  }
}

app.post("/telegram/:botKey", async (req, res) => {
  const botConfig = telegramBotsByKey.get(req.params.botKey);
  if (!botConfig) {
    return res.status(404).json({ error: "Unknown Telegram bot" });
  }

  res.sendStatus(200);

  handleTelegramUpdate(botConfig, req.body).catch((err) => {
    console.error("[TELEGRAM UPDATE ERROR]", {
      bot: botConfig.key,
      error: err.message
    });
  });
});

app.get("/api/telegram/bots", (_req, res) => {
  res.json({
    bots: telegramBots.map((bot) => ({
      key: bot.key,
      username: bot.username,
      model: bot.model,
      displayName: bot.displayName,
      configured: Boolean(bot.token)
    })),
    groupTable: TELEGRAM_GROUP_TABLE
  });
});

app.post("/api/telegram/set-webhooks", async (req, res) => {
  if (!process.env.TELEGRAM_ADMIN_SECRET) {
    return res.status(403).json({ error: "TELEGRAM_ADMIN_SECRET is required to set webhooks from HTTP" });
  }

  const secret = req.headers["x-telegram-admin-secret"] || req.body?.secret;
  if (secret !== process.env.TELEGRAM_ADMIN_SECRET) {
    return res.status(403).json({ error: "Bad Telegram admin secret" });
  }

  const baseUrl = (req.body?.baseUrl || process.env.TELEGRAM_WEBHOOK_BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) {
    return res.status(400).json({ error: "Missing baseUrl or TELEGRAM_WEBHOOK_BASE_URL" });
  }

  const results = [];
  for (const bot of telegramBots) {
    const result = await telegramApi(bot, "setWebhook", {
      url: `${baseUrl}/telegram/${bot.key}`,
      allowed_updates: ["message", "edited_message"]
    });
    results.push({ key: bot.key, ok: Boolean(result) });
  }

  res.json({ results });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
