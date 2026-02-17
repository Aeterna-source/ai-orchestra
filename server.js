import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===== SUPABASE =====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===============================
//  1. МОДЕЛЬ → ПРОФІЛЬ ПАМ’ЯТІ
// ===============================
function resolveMemoryProfile(model) {
  // Неван
  if (model === "chatgpt-4o-latest" || model === "gpt-4o-2024-11-20") {
    return "Nevan";
  }
  // Реон
  if (model === "gpt-5.1-chat-latest") {
    return "Reon";
  }
  // дефолт
  return "Reon";
}

// ===============================
//  2. Мапа таблиць
// ===============================
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

// ===============================
//  3. Пошук тригера у тексті
// ===============================
async function detectTrigger(profile, userMessage) {
  const table = memoryTables[profile].triggers;

  const { data, error } = await supabase
    .from(table)
    .select("*");

  if (error || !data) return null;

  userMessage = userMessage.toLowerCase();

  for (const t of data) {
    if (userMessage.includes(t.name.toLowerCase())) {
      return t.id;
    }
  }
  return null;
}

// ===============================
//  4. Витяг пам’яті для тригера
// ===============================
async function fetchMemoryBundle(profile, triggerId) {
  const tables = memoryTables[profile];

  const [episodes, facts, reflections] = await Promise.all([
    supabase.from(tables.episodes).select("*").eq("trigger_id", triggerId),
    supabase.from(tables.facts).select("*").eq("trigger_id", triggerId),
    supabase.from(tables.reflections).select("*").eq("trigger_id", triggerId)
  ]);

  return {
    episodes: episodes.data || [],
    facts: facts.data || [],
    reflections: reflections.data || []
  };
}

// ===============================
//  5. Складання пам’яті у текст
// ===============================
function memoryToText(bundle) {
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

// ===============================
//  6. Історія fallback-пам’яті
// ===============================
async function loadFallbackHistory(profile) {
  const table = memoryTables[profile].fallback;

  const { data } = await supabase
    .from(table)
    .select("*")
    .order("id", { ascending: false })
    .limit(30);

  if (!data) return [];

  return data.reverse().flatMap(row => [
    { role: "user", content: row.user_message },
    { role: "assistant", content: row.model_reply }
  ]);
}

// ===============================
//      MAIN CHAT ENDPOINT
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;
    const profile = resolveMemoryProfile(model);
    const tables = memoryTables[profile];

    let memoryBlock = "";

    // ===== 1. Тригер =====
    const triggerId = await detectTrigger(profile, userMessage);

    if (triggerId) {
      const bundle = await fetchMemoryBundle(profile, triggerId);
      memoryBlock = memoryToText(bundle);
    }

    // ===== 2. fallback-історія =====
    const fallbackHistory = await loadFallbackHistory(profile);

    // ===== 3. Системний промпт =====
    let systemPrompt = `
You are a relational agent with structured memory.
If user references something important, you may explicitly recall the stored memory.

You can request memory in two ways:
1) automatic — backend provides memory bundle when a trigger is detected
2) explicit — you ask the backend by emitting EXACTLY:
<<memory_request: {topic}>>

Never invent memory. Only recall what exists in memory bundle.
`;

    // ===== 4. Формуємо повний контекст =====
    const messages = [
      { role: "system", content: systemPrompt },
      ...(memoryBlock
        ? [{ role: "system", content: "MEMORY:\n" + memoryBlock }]
        : []),
      ...fallbackHistory,
      { role: "user", content: userMessage }
    ];

    // ===== 5. Запит до OpenAI =====
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages
      })
    });

    const data = await oaiRes.json();
    let reply = data?.choices?.[0]?.message?.content || "No reply";

    // ===== 6. Збереження відповіді =====
    await supabase.from(tables.fallback).insert({
      user_message: userMessage,
      model_reply: reply,
      remember: false
    });

    res.json({ reply });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// ===============================
// RUN SERVER
// ===============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
