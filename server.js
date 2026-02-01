import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ==== Supabase ====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =========================================
//        TABLE SELECTION LOGIC (FIXED)
// =========================================
function resolveTable(model) {
  // 🔥 ОБИДВА 4o — спільна памʼять
  if (model === "chatgpt-4o-latest" || model === "gpt-4o-2024-11-20") {
    return "memory_chatgpt_4o_latest";
  }

  // 🔥 Усі інші моделі — окремі
  return "memory_" + model.replace(/[.\-]/g, "_");
}

// ==== Test route ====
app.get("/", (req, res) => {
  res.send("AI Orchestra backend is running");
});

//
// ===============================
//       GET MEMORY ON DEMAND
// ===============================
app.post("/api/memory", async (req, res) => {
  try {
    const { model, action, limit = 30 } = req.body;

    const table = resolveTable(model);

    if (action === "get") {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("id", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return res.json({ history: data || [] });
    }

    if (action === "clear") {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq("id", 0);
      if (error) throw error;

      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

//
// ===============================
//         MEMORY SEARCH API
// ===============================
app.post("/api/memory/search", async (req, res) => {
  try {
    const { model, query } = req.body;

    if (!query || !model) {
      return res.status(400).json({ error: "query and model required" });
    }

    const table = resolveTable(model);

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .or(`user_message.ilike.%${query}%,model_reply.ilike.%${query}%`);

    if (error) throw error;

    res.json({ results: data || [] });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

//
// ===============================
//             CHAT
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;
    const table = resolveTable(model);

    // === /search ===
    if (userMessage.startsWith("/search ")) {
      const query = userMessage.replace("/search ", "").trim();

      const { data, error } = await supabase
        .from(table)
        .select("*")
        .or(`user_message.ilike.%${query}%,model_reply.ilike.%${query}%`)
        .order("id", { ascending: false })
        .limit(20);

      if (error) throw error;

      return res.json({
        reply: data.length ? JSON.stringify(data, null, 2) : "Нічого не знайдено."
      });
    }

    // === SYSTEM PROMPT ===
    const systemPrompt = `
You may mark important information for long-term memory.

Use ONLY this exact marker at the END of a reply:
[[remember]]

Mark things like:
• stable preferences
• biography facts the user explicitly shares
• long-term personal details
• meaningful emotional boundaries
• important semantic and conceptual lines

DO NOT mark:
• temporary emotions
• random events
• anything not useful long-term

Place [[remember]] strictly at the end when needed.
    `;

    // === Load last 30 messages ===
    const { data: history } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: false })
      .limit(30);

    const historyMessages = history
      ? history.reverse().flatMap(row => [
          { role: "user", content: row.user_message },
          { role: "assistant", content: row.model_reply }
        ])
      : [];

    const messages = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userMessage }
    ];

    // === OpenAI request ===
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

    //
    // ===== REMEMBER LOGIC =====
    //
    const rememberPatterns = [
      "\\[\\[remember\\]\\]",
      "<remember>",
      "\\(remember\\)",
      "\\{remember\\}",
      "remember_flag"
    ];

    const pattern = new RegExp(rememberPatterns.join("|"), "i");
    let rememberFlag = pattern.test(reply);

    reply = reply.replace(pattern, "").trim();

    // === Save to DB ===
    await supabase.from(table).insert({
      user_message: userMessage,
      model_reply: reply,
      remember: rememberFlag
    });

    res.json({ reply });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// ==== RUN SERVER ====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
