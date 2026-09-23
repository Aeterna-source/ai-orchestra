const baseUrl = (process.env.AI_ORCHESTRA_BASE_URL || "https://ai-orchestra-production.up.railway.app").replace(/\/$/, "");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const response = await fetch(`${baseUrl}/api/health`);
assertCondition(response.ok, `Health check failed with HTTP ${response.status}`);

const health = await response.json();
const models = new Set(health.models || []);
const openai = health.providers?.openai;
const spudBot = (health.telegramBots || []).find((bot) => bot.key === "spud");
const build = health.build || {};

const checks = [
  ["model key `spud` is exposed", models.has("spud")],
  ["model key `gpt-5.5` is exposed", models.has("gpt-5.5")],
  ["OpenAI provider is configured", Boolean(openai?.configured)],
  ["Spud Telegram bot is configured", Boolean(spudBot)],
  ["Spud Telegram bot routes to `spud`", spudBot?.model === "spud"],
  ["source memory mode is live", build.sourceMemoryMode === "live"],
  ["cognitive OS is enabled", build.cognitiveOs === true],
  ["cognitive OS worker is enabled", build.cognitiveOsWorker === true]
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "ok" : "fail"} - ${label}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  throw new Error(`Spud runtime check failed: ${failed} failing check(s)`);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  spud: {
    modelKey: "spud",
    upstreamKeyExposed: models.has("gpt-5.5"),
    telegramUsername: spudBot?.username || null,
    telegramModel: spudBot?.model || null
  },
  runtime: {
    sourceMemoryMode: build.sourceMemoryMode,
    cognitiveOs: build.cognitiveOs,
    cognitiveOsWorker: build.cognitiveOsWorker
  }
}, null, 2));
