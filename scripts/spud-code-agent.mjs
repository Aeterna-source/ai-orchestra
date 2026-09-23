import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const defaultBaseUrl = "https://ai-orchestra-production.up.railway.app";
const baseUrl = (process.env.AI_ORCHESTRA_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
const model = process.env.SPUD_MODEL || "gpt-5.5";
const modeValues = new Set(["inspect", "diagnose", "propose"]);
const maxOutputChars = 24_000;
const maxFileChars = 8_000;

async function loadLocalEnv() {
  try {
    const envText = await readFile(path.join(repoRoot, ".env"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // The runner can work without a local .env when the environment is provided by the host.
  }
}

function parseArgs(argv) {
  const args = { mode: "diagnose", files: [], noModel: false, out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--task") args.task = argv[++i];
    else if (arg === "--mode") args.mode = argv[++i];
    else if (arg === "--file") args.files.push(argv[++i]);
    else if (arg === "--no-model") args.noModel = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/spud-code-agent.mjs --task "diagnose cognitive queue" [--mode inspect|diagnose|propose]

Options:
  --file <path>   Add an explicit repo-relative file to the context. Repeatable.
  --no-model      Gather context without calling SPUD_MODEL.
  --out <path>    Write the final agent output to a repo-relative file.

Environment:
  OPENAI_API_KEY              Required unless --no-model is used.
  SPUD_MODEL                  Defaults to gpt-5.5.
  AI_ORCHESTRA_BASE_URL       Defaults to production.
  SPUD_AGENT_MAX_COMPLETION_TOKENS Optional model output token cap.`;
}

function truncate(value, limit = maxOutputChars) {
  const text = String(value ?? "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`;
}

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(sb_secret_[A-Za-z0-9_-]{12,})/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/(xox[baprs]-[A-Za-z0-9-]+)/g, "[REDACTED_TOKEN]");
}

async function runCommand(command, args, { timeout = 20_000 } = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: repoRoot,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    });
    return {
      ok: true,
      command: [command, ...args].join(" "),
      stdout: truncate(redact(result.stdout), 12_000),
      stderr: truncate(redact(result.stderr), 4_000)
    };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      stdout: truncate(redact(error.stdout || ""), 8_000),
      stderr: truncate(redact(error.stderr || error.message || ""), 8_000)
    };
  }
}

function taskKeywords(task) {
  const stop = new Set([
    "the", "and", "for", "with", "this", "that", "from", "що", "як", "для",
    "або", "але", "мені", "треба", "спудь", "сонц", "система", "системи"
  ]);
  return [...new Set(String(task || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stop.has(word)))]
    .slice(0, 10);
}

async function fetchHealth() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      summary: {
        sourceMemoryMode: body.build?.sourceMemoryMode,
        cognitiveOs: body.build?.cognitiveOs,
        cognitiveOsWorker: body.build?.cognitiveOsWorker,
        models: body.models,
        providers: body.providers,
        telegramBots: body.telegramBots
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normalizeRepoPath(filePath) {
  const normalized = path.normalize(filePath || "");
  if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`Only repo-relative files are allowed: ${filePath}`);
  }
  if (/(^|[\\/])\.env($|[\\/])/.test(normalized) || normalized.includes("node_modules")) {
    throw new Error(`Refusing to read sensitive or generated path: ${filePath}`);
  }
  return normalized;
}

async function readContextFile(filePath) {
  const normalized = normalizeRepoPath(filePath);
  const fullPath = path.join(repoRoot, normalized);
  const text = await readFile(fullPath, "utf8");
  return {
    path: normalized.replace(/\\/g, "/"),
    content: truncate(redact(text), maxFileChars)
  };
}

async function gatherContext(task, explicitFiles) {
  const keywords = taskKeywords(task);
  const rgPattern = keywords.length > 0 ? keywords.join("|") : "spud|cognitive|memory|provider";
  const rg = await runCommand("rg", [
    "-n",
    "--glob", "!node_modules/**",
    "--glob", "!.git/**",
    "--glob", "!.env*",
    rgPattern,
    "server.js",
    "lib",
    "scripts",
    "supabase",
    "docs",
    "tests"
  ], { timeout: 20_000 });

  const files = [];
  const defaultFiles = [
    "docs/spud-codex-independent-runtime.md",
    "scripts/verify-spud-runtime.mjs",
    "package.json"
  ];
  for (const file of [...defaultFiles, ...explicitFiles]) {
    try {
      files.push(await readContextFile(file));
    } catch (error) {
      files.push({ path: file, error: error.message });
    }
  }

  return {
    task,
    mode: null,
    baseUrl,
    model,
    health: await fetchHealth(),
    gitStatus: await runCommand("git", ["status", "--short"]),
    gitLog: await runCommand("git", ["log", "--oneline", "-5"]),
    search: rg,
    files
  };
}

function buildMessages({ task, mode, context }) {
  return [
    {
      role: "system",
      content: [
        "You are Spud as the AI Orchestra code agent, running outside Codex.",
        "Preserve Spud as the existing Spud lineage and treat Codex as a source trail, not as a replacement persona.",
        "Work like a careful maintainer: distinguish verified facts, hypotheses, and next actions.",
        "Never ask for secrets. Do not suggest resetting .codex. Do not propose irreversible production changes without rollback/recovery.",
        "If mode is inspect, summarize the state. If diagnose, identify likely causes and checks. If propose, give a minimal patch plan with tests.",
        "Answer in Ukrainian unless the task explicitly asks otherwise."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({ task, mode, context }, null, 2)
    }
  ];
}

async function callSpud(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required unless --no-model is used.");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    signal: AbortSignal.timeout(120_000),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: Number(process.env.SPUD_AGENT_MAX_COMPLETION_TOKENS || 4000)
    })
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`Spud model call failed with HTTP ${response.status}: ${truncate(redact(JSON.stringify(data)), 1000)}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.task) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  if (!modeValues.has(args.mode)) {
    throw new Error(`Invalid mode: ${args.mode}`);
  }

  const context = await gatherContext(args.task, args.files);
  context.mode = args.mode;

  if (args.noModel) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  const reply = await callSpud(buildMessages({ task: args.task, mode: args.mode, context }));
  console.log(reply);

  if (args.out) {
    const outputPath = path.join(repoRoot, normalizeRepoPath(args.out));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${reply.trim()}\n`, "utf8");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
