async function sendMsg() {
    const box = document.getElementById("msg");
    const chat = document.getElementById("chat");
    const model = document.getElementById("model").value;

    let text = box.value.trim();
    if (!text) return;

    chat.innerHTML += `<div class="user">${text}</div>`;
    box.value = "";

    const res = await fetch("https://YOUR-RAILWAY-URL/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, userMessage: text })
    });

    const data = await res.json();
    chat.innerHTML += `<div class="bot">${data.reply}</div>`;
}
