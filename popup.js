// === popup.js ===
window.addEventListener("DOMContentLoaded", () => {
    const runBtn = document.getElementById("run");
    const progressBox = document.getElementById("progress-log");
    const promptInput = document.getElementById("prompts"); // ID di HTML adalah 'prompts'
    const progressText = document.getElementById("progress");
    const autoDownloadCheck = document.getElementById("autoDownload");

    // 1. LOAD DATA DARI STORAGE SAAT POPUP DIBUKA
// === LOAD SAVED STATE ON POPUP OPEN ===
chrome.storage.local.get(["log", "prompt", "progress", "autoDownload"], (data) => {
    // Bersihkan UI sebelum mengisi ulang
    progressBox.innerHTML = "";

    if (data.log && Array.isArray(data.log)) {
        data.log.forEach(raw => {
            // HAPUS atau KOMENTARI filter di bawah ini agar log muncul:
            // if (/start-prompt/i.test(raw)) return; 
            // if (/prompt-done/i.test(raw)) return;

            const div = document.createElement("div");
            div.textContent = raw;
            progressBox.appendChild(div);
        });
        progressBox.scrollTop = progressBox.scrollHeight;
    }

    // Pastikan ID elemen sesuai dengan yang ada di popup.html
    if (document.getElementById("prompts")) {
        document.getElementById("prompts").value = data.prompt || "";
    }
    if (document.getElementById("progress")) {
        document.getElementById("progress").innerText = data.progress || "Idle...";
    }
    if (document.getElementById("autoDownload")) {
        document.getElementById("autoDownload").checked = data.autoDownload || false;
    }
});

    // 2. FUNGSI UNTUK MENAMBAH LOG KE UI SAJA
    function appendLogToUI(msg) {
        const line = document.createElement("div");
        line.textContent = msg;
        progressBox.appendChild(line);
        progressBox.scrollTop = progressBox.scrollHeight;
    }

    // 3. EVENT TOMBOL RUN
    runBtn.addEventListener("click", () => {
        const txt = promptInput.value.trim();
        if (!txt) {
            alert("No prompts provided.");
            return;
        }

        const prompts = txt.split("\n").map(x => x.trim()).filter(x => x);
        const autoDownload = autoDownloadCheck.checked;

        // Reset log di storage dan UI untuk batch baru
        chrome.storage.local.set({ log: [], prompt: txt, autoDownload: autoDownload }, () => {
            progressBox.innerHTML = "";
            appendLogToUI("🚀 Starting batch…");
        });

        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "runBatch", prompts, autoDownload }
            );
        });
    });

    // 4. TERIMA PESAN PROGRESS (Sinkronisasi dengan UI saat popup terbuka)
  // === RECEIVE LIVE PROGRESS FROM content.js / background.js ===
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action !== "progress") return;

    let line = "";
    if (msg.type === "start-prompt") {
        line = `▶️ ${msg.index}/${msg.total} — ${msg.prompt}`;
    } else if (msg.type === "prompt-done") {
        line = `✅ Finished ${msg.index}/${msg.total}`;
    } else if (msg.type === "all-done") {
        line = `🎉 All prompts completed!`;
    }

    if (line) {
        // Tampilkan ke UI saja, jangan panggil logProgress yang menyimpan ke storage lagi
        const div = document.createElement("div");
        div.textContent = line;
        progressBox.appendChild(div);
        progressBox.scrollTop = progressBox.scrollHeight;
        
        if (document.getElementById("progress")) {
            document.getElementById("progress").innerText = line;
        }
    }
});
});