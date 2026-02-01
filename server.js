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
// ========================================
//     GET MEMORY ON DEMAND
// ========================================
app.post("/api/memory", async (req, res) => {
  try {
    const { model, action, limit = 30 } = req.body;

    let table = resolveTable(model);

    if (action === "get") {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("id", { ascending: false })
        .limit
