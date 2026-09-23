import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

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
    // Environment can be provided by the host.
  }
}

function parseArgs(argv) {
  const args = {
    once: false,
    intervalMs: Number(process.env.SPUD_WORKER_POLL_INTERVAL_MS || 15000),
    workerId: process.env.SPUD_WORKER_ID || `spud-worker-${process.pid}`
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--once") args.once = true;
    else if (arg === "--interval-ms") args.intervalMs = Number(argv[++i]);
    else if (arg === "--worker-id") args.workerId = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/spud-code-worker.mjs [--once] [--interval-ms 15000] [--worker-id spud-local]

Environment:
  TELEGRAM_ADMIN_SECRET or COGNITIVE_ADMIN_SECRET
  OPENAI_API_KEY
  SPUD_MODEL
  AI_ORCHESTRA_BASE_URL`;
}

function truncate(text = "", maxLength = 1200) {
  const value = String(text || "");
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}...`;
}

function adminHeaders() {
  const secret = process.env.COGNITIVE_ADMIN_SECRET || process.env.TELEGRAM_ADMIN_SECRET;
  if (!secret) throw new Error("Worker requires COGNITIVE_ADMIN_SECRET or TELEGRAM_ADMIN_SECRET.");
  return {
    "Content-Type": "application/json",
    "X-Telegram-Admin-Secret": secret
  };
}

async function postJson(pathname, body) {
  const baseUrl = (process.env.AI_ORCHESTRA_BASE_URL || "https://ai-orchestra-production.up.railway.app").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${pathname}: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  return data;
}

async function runSpudAgent(job) {
  const outputDir = path.join(repoRoot, "agent-runs");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `spud-job-${job.id}.md`);
  const relativeOutputPath = path.relative(repoRoot, outputPath).replace(/\\/g, "/");

  const args = [
    "scripts/spud-code-agent.mjs",
    "--task", job.task,
    "--mode", job.mode,
    "--out", relativeOutputPath
  ];
  const startedAt = new Date().toISOString();
  const nodePath = process.env.SPUD_NODE_PATH || process.execPath;
  const command = `${JSON.stringify(nodePath)} ${args.map((part) => JSON.stringify(part)).join(" ")}`;

  try {
    const child = await execFileAsync(nodePath, args, {
      cwd: repoRoot,
      timeout: Number(process.env.SPUD_WORKER_JOB_TIMEOUT_MS || 180000),
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        AI_ORCHESTRA_BASE_URL: process.env.AI_ORCHESTRA_BASE_URL || "https://ai-orchestra-production.up.railway.app"
      }
    });
    return {
      ok: true,
      command,
      mode: job.mode,
      task: job.task,
      outputPath: relativeOutputPath,
      summary: truncate(child.stdout, 1000),
      stdout: truncate(child.stdout, 12000),
      stderr: truncate(child.stderr, 4000),
      startedAt,
      finishedAt: new Date().toISOString()
    };
  } catch (error) {
    await writeFile(outputPath, [
      `# Spud code worker job ${job.id} failed`,
      "",
      `Task: ${job.task}`,
      `Mode: ${job.mode}`,
      "",
      "## Error",
      "",
      "```text",
      error.message || String(error),
      "```",
      "",
      "## Stdout",
      "",
      "```text",
      error.stdout || "",
      "```",
      "",
      "## Stderr",
      "",
      "```text",
      error.stderr || "",
      "```",
      ""
    ].join("\n"), "utf8");
    return {
      ok: false,
      command,
      mode: job.mode,
      task: job.task,
      outputPath: relativeOutputPath,
      summary: truncate(error.message || String(error), 1000),
      stdout: truncate(error.stdout || "", 12000),
      stderr: truncate(error.stderr || error.message || "", 4000),
      startedAt,
      finishedAt: new Date().toISOString()
    };
  }
}

async function workOnce(workerId) {
  const claim = await postJson("/api/spud/code-agent/jobs/claim", { workerId });
  const job = claim.job;
  if (!job) return false;
  console.log(`claimed job ${job.id}: ${job.mode} ${job.task}`);
  const result = await runSpudAgent(job);
  await postJson(`/api/spud/code-agent/jobs/${job.id}/complete`, {
    workerId,
    ok: result.ok,
    result,
    error: result.ok ? "" : result.summary
  });
  console.log(`completed job ${job.id}: ${result.ok ? "ok" : "failed"}`);
  return true;
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  do {
    try {
      const hadJob = await workOnce(args.workerId);
      if (args.once) break;
      if (!hadJob) await new Promise((resolve) => setTimeout(resolve, args.intervalMs));
    } catch (error) {
      console.error(error.message);
      if (args.once) process.exit(1);
      await new Promise((resolve) => setTimeout(resolve, args.intervalMs));
    }
  } while (true);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
