import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ==== CORS (повна підтримка) ====
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// ==== FIX: відповідаємо на preflight OPTIONS ====
app.options("/api/chat", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

// ==== Supabase ====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ==== Test routes ====
app.get("/", (req, res) => {
  res.send("AI Orchestra backend is running");
});

app.get("/test", (req, res) => {
  res.send("Backend OK");
});

// ==== MAIN API ====
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;

    console.log("Received:", model, userMessage);

    // ==== CALL OPENAI ====
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await oaiRes.json();
    console.log("OpenAI response:", data);

    const reply = data?.choices?.[0]?.message?.content || "No reply";

    // ==== SAVE TO SUPABASE ====
    await supabase.from("memory_" + model).insert({
      user_message: userMessage,
      model_reply: reply,
    });

    res.json({ reply });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// ==== RAILWAY PORT ====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port " + PORT));
