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

// ===== Helper: sanitize model name =====
function cleanModelName(model) {
  return model.replace(/[^a-zA-Z0-9_]/g, "_");
}

// ===== Automatically create table if missing =====
async function ensureTableExists(table) {
  const sql = `
    create table if not exists ${table} (
      id bigint generated always as identity primary key,
      user_message text,
      model_reply text,
      created_at timestamp with time zone default now()
    );
  `;

  await supabase.rpc("exec_sql", { query: sql })
    .catch(() => {}); // ignore errors if RPC not enabled
}

// ===== Routes =====
app.get("/", (req, res) => {
  res.send("AI Orchestra backend is running");
});

app.get("/test", (req, res) => {
  res.send("Backend OK");
});

// ===== MAIN CHAT API =====
app.post("/api/chat", async (req, res) => {
  try {
    const { model, userMessage } = req.body;

    if (!model) return res.status(400).json({ error: "Model missing" });
    if (!userMessage) return res.status(400).json({ error: "Message missing" });

    const safeModel = cleanModelName(model);
    const tableName = "memory_" + safeModel;

    await ensureTableExists(tableName);

    // ==== CALL OPENAI API ====
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
    const reply = data?.choices?.[0]?.message?.content || "No reply";

    // ===== SAVE MEMORY =====
    await supabase.from(tableName).insert({
      user_message: userMessage,
      model_reply: reply
    });

    res.json({ reply });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});


// ==== PORT ====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port " + PORT));
