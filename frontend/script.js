const BACKEND_URL =
  window.BACKEND_URL ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8080"
    : "https://ai-orchestra-production.up.railway.app");

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
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, userMessage: text })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Backend request failed");
    }

    const formatted = marked.parse(data.reply || "");
    chat.innerHTML += `<div class="bot">${formatted}</div>`;
  } catch (err) {
    chat.innerHTML += `<div class="bot error">${err.message}</div>`;
  }

  chat.scrollTop = chat.scrollHeight;
}
