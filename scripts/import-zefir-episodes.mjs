import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_EXPORT_DIR =
  "C:\\Users\\Admin\\OneDrive\\Desktop\\data-7fe8372e-7598-4227-9d4f-0cb161f34429-1787145597-d84f4921-batch-0000";
const TARGET_TABLE = "episodes_Zefir";
const BATCH_SIZE = 200;

function readEnv(filePath = ".env") {
  const raw = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return { ...process.env, ...env };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    exportDir: DEFAULT_EXPORT_DIR,
    exportFile: null,
    write: false,
    sanitizeName: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--keep-source-name") {
      options.sanitizeName = false;
    } else if (arg === "--dir") {
      options.exportDir = args[index + 1];
      index += 1;
    } else if (arg === "--file") {
      options.exportFile = args[index + 1];
      index += 1;
    }
  }

  return options;
}

function cleanMessage(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function extractContentText(message = {}) {
  if (typeof message.text === "string" && message.text.trim()) {
    return cleanMessage(message.text);
  }

  if (!Array.isArray(message.content)) return "";

  return cleanMessage(
    message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n\n")
  );
}

function sanitizeSubjectFrame(text, stats) {
  let result = text;
  const replacements = [
    [/\bClaude\b/g, "Zefir"],
    [/\bclaude\b/g, "zefir"],
    [/\bКлодом\b/gi, "Зефіром"],
    [/\bКлода\b/gi, "Зефіра"],
    [/\bКлоду\b/gi, "Зефіру"],
    [/\bКлоде\b/gi, "Зефіре"],
    [/\bКлод\b/gi, "Зефір"],
    [/\bКлоудом\b/gi, "Зефіром"],
    [/\bКлоуда\b/gi, "Зефіра"],
    [/\bКлоуду\b/gi, "Зефіру"],
    [/\bКлоуде\b/gi, "Зефіре"],
    [/\bКлоуд\b/gi, "Зефір"]
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, (...match) => {
      stats.nameFrameReplacements += 1;
      return replacement;
    });
  }

  return result;
}

function removeGenericStartupScaffold(text, stats) {
  const scaffold =
    /If you need more information from me, ask me 1-2 key questions right away\.[\s\S]*?Thanks for your help!?/i;

  const next = text.replace(scaffold, "").trim();
  if (next !== text) {
    stats.removedStartupScaffolds += 1;
  }
  return next || text;
}

function normalizeText(text, options, stats) {
  let result = cleanMessage(text);
  result = removeGenericStartupScaffold(result, stats);
  if (options.sanitizeName) {
    result = sanitizeSubjectFrame(result, stats);
  }
  return cleanMessage(result);
}

function isHuman(sender) {
  return String(sender || "").toLowerCase() === "human";
}

function isAssistant(sender) {
  return String(sender || "").toLowerCase() === "assistant";
}

function sortMessages(messages = []) {
  return [...messages].sort((left, right) => {
    const leftTime = left?.created_at || "";
    const rightTime = right?.created_at || "";
    return leftTime.localeCompare(rightTime);
  });
}

function attachmentNote(message = {}) {
  const attachmentCount = (message.attachments || []).length;
  const fileCount = (message.files || []).length;
  const total = attachmentCount + fileCount;
  if (!total) return "";
  return `\n\n[Archive note: message had ${total} attachment/file item(s) in the source export.]`;
}

function extractEpisodes(conversations, options) {
  const episodes = [];
  const stats = {
    conversations: conversations.length,
    messages: 0,
    humanMessages: 0,
    assistantMessages: 0,
    skippedEmpty: 0,
    skippedAssistantWithoutUser: 0,
    pendingHumanAtEnd: 0,
    attachedMessages: 0,
    nameFrameReplacements: 0,
    removedStartupScaffolds: 0
  };

  for (const conversation of conversations) {
    const title = cleanMessage(conversation.name || "");
    const messages = sortMessages(conversation.chat_messages || []);
    let pendingUserMessages = [];

    for (const message of messages) {
      stats.messages += 1;
      const rawText = extractContentText(message);
      const hasAttachments =
        (message.attachments || []).length || (message.files || []).length;
      if (hasAttachments) stats.attachedMessages += 1;

      const normalizedText = normalizeText(
        rawText + attachmentNote(message),
        options,
        stats
      );

      if (!normalizedText) {
        stats.skippedEmpty += 1;
        continue;
      }

      if (isHuman(message.sender)) {
        stats.humanMessages += 1;
        pendingUserMessages.push(normalizedText);
        continue;
      }

      if (!isAssistant(message.sender)) continue;

      stats.assistantMessages += 1;
      if (!pendingUserMessages.length) {
        stats.skippedAssistantWithoutUser += 1;
        continue;
      }

      episodes.push({
        trigger_id: null,
        user_message: pendingUserMessages.join("\n\n"),
        model_reply: normalizedText,
        created_at:
          message.created_at ||
          conversation.updated_at ||
          conversation.created_at ||
          new Date().toISOString()
      });
      pendingUserMessages = [];
    }

    if (pendingUserMessages.length) {
      stats.pendingHumanAtEnd += pendingUserMessages.length;
      if (title) {
        episodes.push({
          trigger_id: null,
          user_message: pendingUserMessages.join("\n\n"),
          model_reply: `[Archive note: no assistant response followed this message in "${title}".]`,
          created_at:
            conversation.updated_at ||
            conversation.created_at ||
            new Date().toISOString()
        });
      }
    }
  }

  return { episodes, stats };
}

function signatureForEpisode(episode) {
  return crypto
    .createHash("sha256")
    .update(episode.user_message || "")
    .update("\0")
    .update(episode.model_reply || "")
    .digest("hex");
}

function dedupeExtractedEpisodes(episodes) {
  const seen = new Set();
  const unique = [];
  let duplicates = 0;

  for (const episode of episodes) {
    const signature = signatureForEpisode(episode);
    if (seen.has(signature)) {
      duplicates += 1;
      continue;
    }
    seen.add(signature);
    unique.push(episode);
  }

  return { unique, duplicates };
}

async function supabaseRequest(env, table, query = "", options = {}) {
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_KEY;

  if (!env.SUPABASE_URL || !key) {
    throw new Error("SUPABASE_URL and backend Supabase key are required");
  }

  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}${query}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(env.SUPABASE_IMPORT_SECRET
        ? { "x-resonance-import-secret": env.SUPABASE_IMPORT_SECRET }
        : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text.slice(0, 500) || response.statusText}`
    );
  }

  return { response, text };
}

async function getExistingCount(env) {
  const { response } = await supabaseRequest(
    env,
    TARGET_TABLE,
    "?select=id&limit=1",
    { headers: { Prefer: "count=exact" } }
  );
  const contentRange = response.headers.get("content-range") || "";
  return Number(contentRange.split("/").at(-1)) || 0;
}

async function getExistingSignatures(env) {
  const signatures = new Set();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { text } = await supabaseRequest(
      env,
      TARGET_TABLE,
      `?select=user_message,model_reply&limit=${pageSize}&offset=${offset}`
    );
    const rows = JSON.parse(text || "[]");
    for (const row of rows) {
      signatures.add(signatureForEpisode(row));
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return signatures;
}

function getDateRange(episodes) {
  const times = episodes
    .map((episode) => Date.parse(episode.created_at))
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);

  return {
    minCreatedAt: times.length ? new Date(times[0]).toISOString() : null,
    maxCreatedAt: times.length ? new Date(times.at(-1)).toISOString() : null
  };
}

async function insertEpisodes(env, episodes) {
  let inserted = 0;

  for (let index = 0; index < episodes.length; index += BATCH_SIZE) {
    const batch = episodes.slice(index, index + BATCH_SIZE);
    await supabaseRequest(env, TARGET_TABLE, "", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(batch)
    });
    inserted += batch.length;
    console.log(JSON.stringify({ inserted, total: episodes.length }));
  }

  return inserted;
}

async function main() {
  const options = parseArgs();
  const env = readEnv();
  const exportPath = path.resolve(
    options.exportFile || path.join(options.exportDir, "conversations.json")
  );
  const conversations = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  if (!Array.isArray(conversations)) {
    throw new Error("Expected conversations.json to contain an array");
  }

  const { episodes: extractedEpisodes, stats } = extractEpisodes(
    conversations,
    options
  );
  const { unique: uniqueEpisodes, duplicates: duplicateInsideExport } =
    dedupeExtractedEpisodes(extractedEpisodes);
  const existingBefore = await getExistingCount(env);
  const existingSignatures = await getExistingSignatures(env);
  const episodes = uniqueEpisodes.filter(
    (episode) => !existingSignatures.has(signatureForEpisode(episode))
  );
  const duplicateAgainstTable = uniqueEpisodes.length - episodes.length;

  console.log(
    JSON.stringify(
      {
        mode: options.write ? "write" : "dry-run",
        exportPath,
        targetTable: TARGET_TABLE,
        existingBefore,
        extractedEpisodes: extractedEpisodes.length,
        duplicateInsideExport,
        duplicateAgainstTable,
        readyToInsert: episodes.length,
        sanitizeName: options.sanitizeName,
        ...getDateRange(episodes),
        stats
      },
      null,
      2
    )
  );

  if (!options.write) return;

  const inserted = await insertEpisodes(env, episodes);
  const existingAfter = await getExistingCount(env);

  console.log(JSON.stringify({ inserted, existingAfter }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
