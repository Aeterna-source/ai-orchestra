const PRODUCTION_BACKEND_URL = "https://ai-orchestra-production.up.railway.app";
const LOCAL_BACKEND_URL = "http://localhost:8080";

const BACKEND_URLS = window.BACKEND_URL
  ? [window.BACKEND_URL]
  : ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? [LOCAL_BACKEND_URL, PRODUCTION_BACKEND_URL]
    : [PRODUCTION_BACKEND_URL];

const visualState = {
  profile: "System",
  continuity: 0.35,
  warmth: 0.35,
  stability: 0.35,
  driftRisk: 0.45,
  significance: 0.2,
  counts: {
    stateCards: 0,
    intentions: 0,
    openDrifts: 0,
    events: 0
  },
  valence: {},
  ready: false
};

const particles = [];
let animationStarted = false;

async function getJsonFromBackends(path, options = {}) {
  let lastError;

  for (const backendUrl of BACKEND_URLS) {
    try {
      const res = await fetch(`${backendUrl}${path}`, options);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Backend request failed at ${backendUrl}`);
      }

      return data;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Backend request failed");
}

async function postChat(payload) {
  return getJsonFromBackends("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function formatMemoryStatus(debug) {
  if (!debug) return "";

  const counts = debug.memoryCounts || {};
  const trigger = debug.activeTriggerName || debug.exactTriggerName || debug.classifierTriggerName;
  const source = debug.triggerCatalogMeta?.source || "unknown";
  const loaded = debug.memoryLoaded || debug.requestedMemoryLoaded;
  const state = loaded ? "memory loaded" : "memory not loaded";
  const details = [
    trigger ? `trigger: ${trigger}` : "trigger: none",
    `source: ${source}`,
    `facts: ${counts.facts ?? 0}`,
    `reflections: ${counts.reflections ?? 0}`,
    `episodes: ${counts.episodes ?? 0}`,
    `fallback: ${debug.fallbackCount ?? 0}`
  ];

  if (debug.remember) {
    const source = debug.rememberSource === "auto_active_trigger" ? "auto" : "model";
    details.push(debug.episodeSaved ? `saved episode (${source})` : `remember requested (${source})`);
  }

  return `
    <div class="memory-status ${loaded ? "loaded" : "empty"}">
      <span>${state}</span>
      <small>${details.map(escapeHtml).join(" · ")}</small>
    </div>
  `;
}

function scoreLabel(value) {
  return clamp01(value).toFixed(2);
}

function setStateMetrics() {
  const metrics = document.getElementById("stateMetrics");
  if (!metrics) return;

  const items = [
    ["continuity", scoreLabel(visualState.continuity)],
    ["warmth", scoreLabel(visualState.warmth)],
    ["stability", scoreLabel(visualState.stability)],
    ["drift risk", scoreLabel(visualState.driftRisk)],
    ["significance", scoreLabel(visualState.significance)],
    ["cards", visualState.counts.stateCards ?? 0],
    ["intentions", visualState.counts.intentions ?? 0],
    ["drifts", visualState.counts.openDrifts ?? 0],
    ["events", visualState.counts.events ?? 0]
  ];

  metrics.innerHTML = items
    .map(([label, value]) => `
      <div class="state-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
      </div>
    `)
    .join("");
}

function applyVisualizationData(data) {
  const snapshot = data.latestSnapshot || {};

  visualState.profile = data.profile || "System";
  visualState.continuity = clamp01(snapshot.continuity, 0.35);
  visualState.warmth = clamp01(snapshot.warmth, 0.35);
  visualState.stability = clamp01(snapshot.stability, 0.35);
  visualState.driftRisk = clamp01(snapshot.drift_risk, 0.45);
  visualState.significance = clamp01(snapshot.significance, 0.2);
  visualState.counts = data.counts || visualState.counts;
  visualState.valence = data.valence || {};
  visualState.ready = Boolean(snapshot.id);

  const title = document.getElementById("stateTitle");
  const updated = document.getElementById("stateUpdated");
  if (title) title.textContent = `${visualState.profile} state`;
  if (updated) {
    const time = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit"
    }) : "waiting";
    updated.textContent = visualState.ready ? `synced ${time}` : "no snapshots yet";
  }

  setStateMetrics();
  ensureParticles();
}

async function loadState() {
  const model = document.getElementById("model")?.value || "nevan";
  try {
    const data = await getJsonFromBackends(`/api/visualization/${encodeURIComponent(model)}`);
    applyVisualizationData(data);
  } catch (err) {
    const updated = document.getElementById("stateUpdated");
    if (updated) updated.textContent = "state offline";
  }
}

function targetParticleCount() {
  const counts = visualState.counts || {};
  const base = visualState.ready ? 130 : 90;
  const cards = Math.min(16, counts.stateCards || 0) * 8;
  const intentions = Math.min(8, counts.intentions || 0) * 18;
  const events = Math.min(60, counts.events || 0) * 1.2;
  const drift = Math.round(visualState.driftRisk * 36);
  return Math.round(Math.max(80, Math.min(360, base + cards + intentions + events + drift)));
}

function createParticle(canvas) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random());

  return {
    angle,
    radius,
    x: canvas.width * 0.5,
    y: canvas.height * 0.5,
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 0.9,
    size: 0.7 + Math.random() * 2.4,
    spin: (Math.random() - 0.5) * 0.9
  };
}

function ensureParticles() {
  const canvas = document.getElementById("stateCloud");
  if (!canvas) return;

  const target = targetParticleCount();
  while (particles.length < target) particles.push(createParticle(canvas));
  while (particles.length > target) particles.pop();
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function colorStops() {
  const warm = visualState.warmth;
  const stable = visualState.stability;
  const drift = visualState.driftRisk;
  const tender = (visualState.valence?.warm || 0) > 0 ? warm : warm * 0.55;
  const inspiration = Math.min(1, visualState.significance * 0.55 + (visualState.counts.intentions || 0) * 0.08);

  return [
    { color: [244, 188, 83], weight: 0.25 + warm * 0.85 },
    { color: [77, 194, 137], weight: 0.18 + inspiration },
    { color: [85, 166, 232], weight: 0.2 + stable * 0.75 },
    { color: [246, 119, 174], weight: 0.12 + tender * 0.55 },
    { color: [236, 72, 72], weight: 0.05 + drift * 1.1 }
  ];
}

function chooseColor(seed) {
  const stops = colorStops();
  const total = stops.reduce((sum, item) => sum + item.weight, 0);
  let cursor = (seed % 1) * total;

  for (const stop of stops) {
    cursor -= stop.weight;
    if (cursor <= 0) return stop.color;
  }

  return stops[0].color;
}

function drawStateCloud(time) {
  const canvas = document.getElementById("stateCloud");
  if (!canvas) return;

  resizeCanvas(canvas);
  ensureParticles();

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const minSide = Math.min(width, height);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050908";
  ctx.fillRect(0, 0, width, height);

  const continuity = visualState.continuity;
  const warmth = visualState.warmth;
  const stability = visualState.stability;
  const drift = visualState.driftRisk;
  const significance = visualState.significance;
  const pulse = 1 + Math.sin(time * 0.0018) * (0.05 + significance * 0.12);
  const fieldRadius = minSide * (0.22 + (1 - stability) * 0.18 + drift * 0.13) * pulse;
  const stretch = 1 + continuity * 0.55;
  const jitter = minSide * (0.01 + drift * 0.08 + (1 - stability) * 0.03);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];
    particle.angle += (0.0008 + continuity * 0.0012) * particle.speed + particle.spin * 0.0004;

    const wave = Math.sin(time * 0.001 * particle.speed + particle.phase);
    const radius = fieldRadius * (0.25 + particle.radius * 0.95 + wave * 0.045);
    const fragment = drift > 0.45 && index % 7 === 0 ? drift * minSide * 0.14 : 0;
    const targetX = centerX + Math.cos(particle.angle) * (radius * stretch + fragment);
    const targetY = centerY + Math.sin(particle.angle * (1.28 - stability * 0.18)) * radius * 0.66;
    const noiseX = Math.sin(time * 0.0014 + particle.phase * 1.7) * jitter;
    const noiseY = Math.cos(time * 0.0011 + particle.phase * 1.3) * jitter;

    particle.x += (targetX + noiseX - particle.x) * 0.045;
    particle.y += (targetY + noiseY - particle.y) * 0.045;

    const [r, g, b] = chooseColor((particle.phase / (Math.PI * 2)) + index * 0.017 + warmth * 0.11);
    const alpha = 0.18 + warmth * 0.22 + significance * 0.18 + Math.max(0, wave) * 0.15;
    const size = particle.size * (1 + significance * 0.8 + Math.max(0, wave) * 0.35);

    ctx.beginPath();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.48 + warmth * 0.22})`;
    ctx.shadowBlur = 11 + warmth * 12 + significance * 8;
    ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const aura = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, fieldRadius * 1.35);
  aura.addColorStop(0, `rgba(244, 188, 83, ${0.08 + warmth * 0.08})`);
  aura.addColorStop(0.45, `rgba(85, 166, 232, ${0.03 + continuity * 0.05})`);
  aura.addColorStop(1, "rgba(5, 9, 8, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  requestAnimationFrame(drawStateCloud);
}

function startVisualization() {
  if (animationStarted) return;
  animationStarted = true;
  setStateMetrics();
  ensureParticles();
  requestAnimationFrame(drawStateCloud);
}

async function sendMsg() {
  const box = document.getElementById("msg");
  const chat = document.getElementById("chat");
  const model = document.getElementById("model").value;

  const text = box.value.trim();
  if (!text) return;

  chat.innerHTML += `<div class="user">${escapeHtml(text)}</div>`;
  chat.scrollTop = chat.scrollHeight;
  box.value = "";

  try {
    const data = await postChat({ model, userMessage: text, debug: true });
    const formatted = marked.parse(data.reply || "");
    chat.innerHTML += `<div class="bot">${formatted}${formatMemoryStatus(data.debug)}</div>`;
    loadState();
    setTimeout(loadState, 4500);
    setTimeout(loadState, 14000);
  } catch (err) {
    chat.innerHTML += `<div class="bot error">${escapeHtml(err.message)}</div>`;
  }

  chat.scrollTop = chat.scrollHeight;
}

window.addEventListener("DOMContentLoaded", () => {
  const modelSelect = document.getElementById("model");
  modelSelect?.addEventListener("change", loadState);
  startVisualization();
  loadState();
});
