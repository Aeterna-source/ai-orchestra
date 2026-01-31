import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase init
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// DeepSeek call (ручна реалізація через fetch)
async function callDeepSeek(messages) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages
    })
  });

  const json = await res.json();
  return json.choices[0].message.content;
}

// ========== ROUTE: chat ============
app.post("/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;

    let fullReply = "";

    // -------- OPENAI (4o / 5.1) --------
    if (model === "4o" || model === "gpt4o-latest") {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: userMessage }]
      });
      fullReply = response.choices[0].message.content;

      await supabase.from("memory_4o").insert({
        user_message: userMessage,
        model_reply: fullReply
      });
    }

    if (model === "5.1") {
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [{ role: "user", content: userMessage }]
      });
      fullReply = response.choices[0].message.content;

      await supabase.from("memory_51").insert({
        user_message: userMessage,
        model_reply: fullReply
      });
    }

    // -------- DeepSeek --------
    if (model === "deepseek") {
      fullReply = await callDeepSeek([{ role: "user", content: userMessage }]);

      await supabase.from("memory_deepseek").insert({
        user_message: userMessage,
        model_reply: fullReply
      });
    }

    return res.json({ reply: fullReply });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

// ========== START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
