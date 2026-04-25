const PRODUCTION_BACKEND_URL = "https://ai-orchestra-production.up.railway.app";
const LOCAL_BACKEND_URL = "http://localhost:8080";

const BACKEND_URLS = window.BACKEND_URL
  ? [window.BACKEND_URL]
  : ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? [LOCAL_BACKEND_URL, PRODUCTION_BACKEND_URL]
    : [PRODUCTION_BACKEND_URL];

async function postChat(payload) {
  let lastError;

  for (const backendUrl of BACKEND_URLS) {
    try {
      const res = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

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

async function sendMsg() {
  const box = document.getElementById("msg");
  const chat = document.getElementById("chat");
  const model = document.getElementById("model").value;

  const text = box.value.trim();
  if (!text) return;

  chat.innerHTML += `<div class="user">${text}</div>`;
  chat.scrollTop = chat.scrollHeight;
  box.value = "";

  try {
    const data = await postChat({ model, userMessage: text });
    const formatted = marked.parse(data.reply || "");
    chat.innerHTML += `<div class="bot">${formatted}</div>`;
  } catch (err) {
    chat.innerHTML += `<div class="bot error">${err.message}</div>`;
  }

  chat.scrollTop = chat.scrollHeight;
}
