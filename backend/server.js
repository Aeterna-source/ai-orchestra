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

// ==== Test route ====
app.get("/", (req, res) => {
  res.send("AI Orchestra backend is running");
});

//
// ===============================
//       GET MEMORY ON DEMAND
// ===============================
//
app.post("/api/memory", async (req, res) => {
  try {
    const { model, action, limit = 30 } = req.body;

    const table = "memory_" + model.replace(/[\.\-]/g, "_");

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
      const { error } = await supabase.from(table).delete().neq("id", 0);
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
//             CHAT
// ===============================
//
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;

    const table = "memory_" + model.replace(/[\.\-]/g, "_");

    // === Load last 30 messages from memory ===
    const { data: history } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: false })
      .limit(30);

    const historyMessages = history
      ? history
          .reverse()
          .flatMap((row) => [
            { role: "user", content: row.user_message },
            { role: "assistant", content: row.model_reply }
          ])
      : [];

    const messages = [
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
        model: model,
        messages
      })
    });

    const data = await oaiRes.json();
    const reply = data?.choices?.[0]?.message?.content || "No reply";

    // === Save ===
    await supabase.from(table).insert({
      user_message: userMessage,
      model_reply: reply
    });

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// ==== Server ====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
