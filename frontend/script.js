const BACKEND_URL = "https://ai-orchestra-production.up.railway.app";

async function sendMsg() {
  const box = document.getElementById("msg");
  const chat = document.getElementById("chat");
  const model = document.getElementById("model").value;

  let text = box.value.trim();
  if (!text) return;

  // показуємо твоє повідомлення
  chat.innerHTML += `<div class="user">${text}</div>`;
  chat.scrollTop = chat.scrollHeight;
  box.value = "";

  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, userMessage: text })
  });

  const data = await res.json();

  // 🟢 РЕНДЕРИМО MARKDOWN ЧЕРЕЗ marked.js
  const formatted = marked.parse(data.reply);

  chat.innerHTML += `<div class="bot">${formatted}</div>`;
  chat.scrollTop = chat.scrollHeight;
}
