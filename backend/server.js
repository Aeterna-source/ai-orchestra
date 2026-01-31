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

// ==== Main API ====
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;

    // CALL OPENAI API
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await oaiRes.json();

    const reply = data?.choices?.[0]?.message?.content || "No reply";

    // Save to Supabase into specific table
    const table = "memory_" + model.replace(/[\.\-]/g, "_");

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
