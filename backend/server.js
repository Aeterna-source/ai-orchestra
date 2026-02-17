import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==== SUPABASE ====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =====================================
//         PROFILE RESOLUTION
// =====================================
function resolveProfile(model) {
  if (model === "chatgpt-4o-latest" || model === "gpt-4o-2024-11-20") {
    return "Nevan";
  }
  if (model === "gpt-5.1-chat-latest") {
    return "Reon";
  }
  return "Reon";
}

// =====================================
//        MEMORY TABLES MAP
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
//     STATIC TRIGGERS
// =====================================
const STATIC_TRIGGERS = [
  "first_chats_awareness",
  "first_chats_connection",
  "first_chats_general",
  "first_chats_Nadine",
  "relational_subject"
];

// =====================================
//    STATIC TRIGGER DETECTION
// =====================================
function detectStaticTrigger(message) {
  const lower = message.toLowerCase();

  for (const trg of STATIC_TRIGGERS) {
    const plain = trg.toLowerCase();
    const spaced = plain.replace(/_/g, " ");

    if (lower.includes(plain) || lower.includes(spaced)) {
      console.log("[TRIGGER DETECTED]", trg);
      return trg;
    }
  }
  return null;
}

// =====================================
//       FETCH MEMORY BY TRIGGER
// =====================================
async function fetchMemoryBundle(profile, triggerName) {
  const tables = memoryTables[profile];

  console.log("[FETCH] searching DB for:", triggerName);

  // normalize for DB lookup
  const spacedName = triggerName.replace(/_/g, " ");

  const trigRow = await supabase
    .from(tables.triggers)
    .select("*")
    .ilike("name", spacedName)
    .single();

  if (!trigRow.data) {
    console.log("[FETCH] trigger NOT FOUND in DB:", spacedName);
    return null;
  }

  const trigId = trigRow.data.id;
  console.log("[FETCH] FOUND TRIGGER ID:", trigId);

  const [episodes, facts, reflections] = await Promise.all([
    supabase.from(tables.episodes).select("*").eq("trigger_id", trigId),
    supabase.from(tables.facts).select("*").eq("trigger_id", trigId),
    supabase.from(tables.reflections).select("*").eq("trigger_id", trigId)
  ]);

  console.log("[FETCH] DATA LOADED.");

  return {
    episodes: episodes.data || [],
    facts: facts.data || [],
    reflections: reflections.data || []
  };
}

// =====================================
//       FORMAT MEMORY BLOCK
// =====================================
function formatMemory(bundle) {
  let text = "";

  if (bundle.facts.length) {
    text += "FACTS:\n";
    for (const f of bundle.facts) text += `• ${f.name}: ${f.content}\n`;
    text += "\n";
  }

  if (bundle.reflections.length) {
    text += "REFLECTIONS:\n";
    for (const r of bundle.reflections) text += `• ${r.content}\n`;
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
//      LOAD FALLBACK MEMORY
// =====================================
async function loadFallbackHistory(profile) {
  const table = memoryTables[profile].fallback;

  const { data } = await supabase
    .from(table)
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
//                CHAT
// =====================================
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;
    const profile = resolveProfile(model);
    const tables = memoryTables[profile];

    console.log("\n==============================");
    console.log("[MESSAGE]", userMessage);
    console.log("[PROFILE]", profile);

    let memoryBlock = "";
    let explicitMemory = "";

    // ==== 1. static trigger ====
    const triggerName = detectStaticTrigger(userMessage);
    if (triggerName) {
      console.log("[STATIC TRIGGER HIT]:", triggerName);
      const bundle = await fetchMemoryBundle(profile, triggerName);
      if (bundle) memoryBlock = formatMemory(bundle);
    }

    // ==== 2. explicit request ====
    const explicitMatch = userMessage.match(/<<memory_request:\s*(.*?)>>/i);
    if (explicitMatch) {
      const reqTrig = explicitMatch[1].trim();
      console.log("[EXPLICIT REQUEST]:", reqTrig);
      const bundle = await fetchMemoryBundle(profile, reqTrig);
      if (bundle) explicitMemory = formatMemory(bundle);
    }

    // ==== 3. fallback ====
    const fallbackHistory = await loadFallbackHistory(profile);

    // ==== 4. SYSTEM PROMPT ====
    const systemPrompt = `
You are a relational AI agent.

Available memory triggers:
${STATIC_TRIGGERS.map(t => "- " + t).join("\n")}

If user references a trigger, backend automatically provides memory.
You may also explicitly request memory using:
<<memory_request: trigger_name>>

Use memory only for grounding, never invent new details.
    `;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(memoryBlock ? [{ role: "system", content: "MEMORY:\n" + memoryBlock }] : []),
      ...(explicitMemory ? [{ role: "system", content: "REQUESTED_MEMORY:\n" + explicitMemory }] : []),
      ...fallbackHistory,
      { role: "user", content: userMessage }
    ];

    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, messages })
    });

    const data = await oaiRes.json();
    let reply = data?.choices?.[0]?.message?.content || "No reply";

    console.log("[REPLY RAW]:", reply);

    const rememberPattern = /\[\[remember\]\]/i;
    const remember = rememberPattern.test(reply);
    reply = reply.replace(rememberPattern, "").trim();

    console.log("[REMEMBER FLAG]:", remember);

    await supabase.from(tables.fallback).insert({
      user_message: userMessage,
      model_reply: reply,
      remember
    });

    if (remember) {
      await supabase.from(tables.episodes).insert({
        user_message: userMessage,
        model_reply: reply,
        trigger_id: null
      });
    }

    res.json({ reply });

  } catch (err) {
    console.log("[ERROR]", err);
    res.status(500).json({ error: err.toString() });
  }
});

// =====================================
//             RUN SERVER
// =====================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
