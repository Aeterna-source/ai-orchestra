import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// =====================================
// ENV VALIDATION
// =====================================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error("Missing Supabase credentials");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

// =====================================
// SUPABASE
// =====================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =====================================
// PROFILE RESOLUTION
// =====================================
function resolveProfile(model) {
  if (model === "chatgpt-4o-latest" || model === "gpt-4o-2024-11-20") {
    return "Nevan";
  }
  if (model === "gpt-5.1-chat-latest") {
    return "Reon";
  }
  throw new Error(`Unknown model profile: ${model}`);
}

// =====================================
// MEMORY TABLES
// =====================================
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

// =====================================
// STATIC TRIGGERS (WHITELIST)
// =====================================
const STATIC_TRIGGERS = [
  "first_chats_awareness",
  "first_chats_connection",
  "first_chats_general",
  "first_chats_Nadine",
  "relational_subject"
];

const ALLOWED_TRIGGERS = new Set(STATIC_TRIGGERS);

// =====================================
// TRIGGER DETECTION
// =====================================
function detectStaticTrigger(message) {
  const lower = message.toLowerCase();
  for (const trg of STATIC_TRIGGERS) {
    if (lower.includes(trg.toLowerCase())) {
      return trg;
    }
  }
  return null;
}

// =====================================
// FETCH MEMORY
// =====================================
async function fetchMemoryBundle(profile, triggerName) {
  const tables = memoryTables[profile];

  const { data: trigData, error: trigError } = await supabase
    .from(tables.triggers)
    .select("*")
    .eq("name", triggerName)
    .single();

  if (trigError || !trigData) {
    console.log("[TRIGGER NOT FOUND]", triggerName);
    return null;
  }

  const trigId = trigData.id;

  const [episodesRes, factsRes, reflectionsRes] = await Promise.all([
    supabase.from(tables.episodes).select("*").eq("trigger_id", trigId),
    supabase.from(tables.facts).select("*").eq("trigger_id", trigId),
    supabase.from(tables.reflections).select("*").eq("trigger_id", trigId)
  ]);

  if (episodesRes.error || factsRes.error || reflectionsRes.error) {
    console.log("[MEMORY LOAD ERROR]");
    return null;
  }

  return {
    triggerId: trigId,
    episodes: episodesRes.data || [],
    facts: factsRes.data || [],
    reflections: reflectionsRes.data || []
  };
}

// =====================================
// FORMAT MEMORY
// =====================================
function formatMemory(bundle) {
  let text = "";

  if (bundle.facts.length) {
    text += "FACTS:\n";
    for (const f of bundle.facts)
      text += `• ${f.name}: ${f.content}\n`;
    text += "\n";
  }

  if (bundle.reflections.length) {
    text += "REFLECTIONS:\n";
    for (const r of bundle.reflections)
      text += `• ${r.content}\n`;
    text += "\n";
  }

  if (bundle.episodes.length) {
    text += "EPISODES:\n";
    for (const e of bundle.episodes) {
      text += `USER: ${e.user_message}\nASSISTANT: ${e.model_reply}\n\n`;
    }
  }

  return text.trim();
}

// =====================================
// FALLBACK MEMORY
// =====================================
async function loadFallbackHistory(profile) {
  const { data } = await supabase
    .from(memoryTables[profile].fallback)
    .select("*")
    .order("id", { ascending: false })
    .limit(20);

  if (!data) return [];

  return data.reverse().flatMap(row => [
    { role: "user", content: row.user_message },
    { role: "assistant", content: row.model_reply }
  ]);
}

// =====================================
// CHAT ENDPOINT
// =====================================
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;

    if (!model || !userMessage) {
      return res.status(400).json({ error: "Missing model or userMessage" });
    }

    const profile = resolveProfile(model);
    const tables = memoryTables[profile];

    let memoryBlock = "";
    let activeTriggerId = null;
    let memoryLoopUsed = false;

    // USER TRIGGER
    const triggerName = detectStaticTrigger(userMessage);
    if (triggerName) {
      const bundle = await fetchMemoryBundle(profile, triggerName);
      if (bundle) {
        memoryBlock = formatMemory(bundle);
        activeTriggerId = bundle.triggerId;
      }
    }

    const fallbackHistory = await loadFallbackHistory(profile);

    const systemPrompt = `
You are a relational AI agent.

If you need additional context, you may request memory.

To request memory, respond ONLY with:
<<memory_request: trigger_name>>

Available triggers:
${STATIC_TRIGGERS.join(", ")}

Rules:
- Only use trigger names from the list.
- Output ONLY the tag when requesting memory.
- Do not add explanations when requesting memory.
`;

    let messages = [
      { role: "system", content: systemPrompt },
      ...(memoryBlock ? [{ role: "system", content: "MEMORY:\n" + memoryBlock }] : []),
      ...fallbackHistory,
      { role: "user", content: userMessage }
    ];

    // FIRST CALL
    let oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages })
    });

    let data = await oaiRes.json();
    if (!oaiRes.ok) {
      return res.status(500).json({ error: "OpenAI failed" });
    }

    let reply = data?.choices?.[0]?.message?.content || "";

    console.log("[MODEL RAW OUTPUT]", reply);

    // MODEL MEMORY LOOP
    const memoryRequestMatch = reply.match(/<<memory_request:\s*([\w\-]+)\s*>>/i);

    if (memoryRequestMatch && !memoryLoopUsed) {
      memoryLoopUsed = true;

      const requestedTrigger = memoryRequestMatch[1].trim();

      if (ALLOWED_TRIGGERS.has(requestedTrigger)) {
        const bundle = await fetchMemoryBundle(profile, requestedTrigger);

        if (bundle) {
          const requestedMemory = formatMemory(bundle);
          activeTriggerId = bundle.triggerId;

          messages = [
            ...messages,
            { role: "assistant", content: reply },
            { role: "system", content: "REQUESTED_MEMORY:\n" + requestedMemory }
          ];

          const secondRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({ model, messages })
          });

          const secondData = await secondRes.json();
          if (!secondRes.ok) {
            return res.status(500).json({ error: "Second OpenAI call failed" });
          }

          reply = secondData?.choices?.[0]?.message?.content || reply;
        }
      }
    }

    // REMEMBER FLAG
    const rememberPattern = /\[\[remember\]\]/i;
    const remember = rememberPattern.test(reply);
    reply = reply.replace(rememberPattern, "").trim();

    await supabase.from(tables.fallback).insert({
      user_message: userMessage,
      model_reply: reply,
      remember
    });

    if (remember) {
      await supabase.from(tables.episodes).insert({
        user_message: userMessage,
        model_reply: reply,
        trigger_id: activeTriggerId
      });
    }

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
