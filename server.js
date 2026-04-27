import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error("Missing Supabase credentials");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const providers = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY
  },
  local: {
    baseUrl: process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:1234/v1",
    apiKey: process.env.LOCAL_AI_API_KEY || "local"
  }
};

const modelRegistry = {
  "chatgpt-4o-latest": {
    provider: "openai",
    upstreamModel: "chatgpt-4o-latest",
    profile: "Nevan"
  },
  "gpt-4o-2024-11-20": {
    provider: "openai",
    upstreamModel: "gpt-4o-2024-11-20",
    profile: "Nevan"
  },
  "gpt-5.1-chat-latest": {
    provider: "openai",
    upstreamModel: "gpt-5.1-chat-latest",
    profile: "Reon"
  },
  "gpt-5.1": {
    provider: "openai",
    upstreamModel: "gpt-5.1",
    profile: "Reon"
  },
  "local-relational": {
    provider: "local",
    upstreamModel: process.env.LOCAL_AI_MODEL || "local-model",
    profile: process.env.LOCAL_AI_PROFILE || "Reon"
  }
};

const memoryTables = {
  Nevan: {
    triggers: "triggers_Nevan",
    episodes: "episodes_Nevan",
    facts: "facts_Nevan",
    reflections: "reflections_Nevan",
    fallback: "memory_chatgpt_4o_latest"
  },
  Reon: {
    triggers: "triggers_Reon",
    episodes: "episodes_Reon",
    facts: "facts_Reon",
    reflections: "reflections_Reon",
    fallback: "memory_gpt_5_1_chat_latest"
  }
};

const STATIC_TRIGGERS = [
  "first_chats_awareness",
  "first_chats_connection",
  "first_chats_general",
  "first_chats_Nadine",
  "relational_subject"
];

const MEMORY_REQUEST_PATTERN = /<<memory_request:\s*([\w-]+)\s*>>/gi;
const REMEMBER_PATTERN = /\[\[remember(?::\s*([\w-]+))?\]\]/gi;

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
  return STATIC_TRIGGERS.map((name, index) => ({
    id: null,
    name,
    description: "",
    fallbackOrder: index
  }));
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

function formatSupabaseError(error) {
  if (!error) return null;
  return {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  };
}

async function callChatCompletion({ providerName, model, messages, extraBody = {} }) {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({ model, messages, ...extraBody })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[MODEL CALL FAILED]", {
      provider: providerName,
      model,
      status: response.status,
      error: data?.error || data
    });
    throw new Error(`${providerName} call failed`);
  }

  return data?.choices?.[0]?.message?.content || "";
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
    return fallbackTriggerCatalog();
  }

  if (!data?.length) {
    console.log("[TRIGGER CATALOG EMPTY]", { profile });
    return fallbackTriggerCatalog();
  }

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
  const sections = [];

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

async function loadFallbackHistory(profile) {
  const { data, error } = await supabase
    .from(memoryTables[profile].fallback)
    .select("*")
    .order("id", { ascending: false })
    .limit(30);

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
  const { error } = await supabase.from(tables.episodes).insert({
    user_message: userMessage,
    model_reply: reply,
    trigger_id: triggerId
  });

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

Use [[remember]] only when a MEMORY or REQUESTED_MEMORY block is already active for the right trigger.
Never output the literal placeholder "trigger_name".
These tags are private control signals. Do not explain them, quote them, or make them part of the user-facing answer.
`.trim();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    models: Object.keys(modelRegistry),
    providers: Object.fromEntries(
      Object.entries(providers).map(([name, provider]) => [
        name,
        { baseUrl: provider.baseUrl }
      ])
    )
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage, debug = false } = req.body;

    if (!model || !userMessage) {
      return res.status(400).json({ error: "Missing model or userMessage" });
    }

    const modelConfig = resolveModelConfig(model);
    const tables = memoryTables[modelConfig.profile];
    const triggerCatalog = await fetchTriggerCatalog(modelConfig.profile);
    const debugInfo = {
      model,
      profile: modelConfig.profile,
      provider: modelConfig.provider,
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
      episodeSaved: false
    };

    let memoryBlock = "";
    let activeTriggerId = null;
    let activeTriggerName = null;

    let triggerName = detectStaticTrigger(userMessage, triggerCatalog);
    debugInfo.exactTriggerName = triggerName;

    if (!triggerName) {
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

    const fallbackHistory = await loadFallbackHistory(modelConfig.profile);
    debugInfo.fallbackCount = fallbackHistory.length / 2;

    let messages = [
      { role: "system", content: buildSystemPrompt() },
      { role: "system", content: buildMemoryProtocolPrompt(triggerCatalog) },
      ...(memoryBlock ? [{ role: "system", content: "MEMORY:\n" + memoryBlock }] : []),
      ...fallbackHistory,
      { role: "user", content: userMessage }
    ];

    let reply = await callChatCompletion({
      providerName: modelConfig.provider,
      model: modelConfig.upstreamModel,
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
          messages
        });
      }
    }

    const rememberDirective = extractRememberDirective(reply, triggerCatalog);
    let remember = rememberDirective.remember;
    debugInfo.remember = remember;

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

    await insertFallback(tables, userMessage, reply, remember);

    if (remember && activeTriggerId) {
      await insertEpisode(tables, userMessage, reply, activeTriggerId);
      debugInfo.episodeSaved = true;
      console.log("[EPISODE SAVED]", {
        profile: modelConfig.profile,
        triggerName: activeTriggerName,
        triggerId: activeTriggerId
      });
    } else if (remember) {
      console.log("[EPISODE SKIPPED: NO ACTIVE TRIGGER]", {
        profile: modelConfig.profile,
        model
      });
    }

    res.json(debug ? { reply, debug: debugInfo } : { reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
