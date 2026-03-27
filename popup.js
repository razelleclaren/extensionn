window.addEventListener("DOMContentLoaded", () => {

    const runBtn = document.getElementById("run");
    const progressBox = document.getElementById("progress-log");
    

    // === LOAD SAVED STATE ON POPUP OPEN ===
    chrome.storage.local.get(["log", "prompt", "progress"], (data) => {
        
        // Load saved log
        if (data.log && Array.isArray(data.log)) {
            data.log.forEach(raw => {

                // ❌ skip raw JSON logs like: "prompt-done #1 - { ... }"
                if (raw.includes("{") && raw.includes("}")) return;

                // ❌ skip raw “start-prompt #1 - xxx”
                if (/start-prompt/i.test(raw)) return;
                if (/prompt-done/i.test(raw)) return;
                if (/all-done/i.test(raw)) return;
                const div = document.createElement("div");
                div.textContent = raw;
                progressBox.appendChild(div);
            });
            progressBox.scrollTop = progressBox.scrollHeight;
        }

        // Load prompt & progress text
        document.getElementById("prompt").value = data.prompt || "";
        document.getElementById("progress").innerText = data.progress || "Idle...";
        document.getElementById("autoDownload").checked = data.autoDownload || false;

    });


    // === FUNCTION: ADD LOG + SAVE IT ===
    function logProgress(msg) {

        // display to popup
        const line = document.createElement("div");
        line.textContent = msg;
        progressBox.appendChild(line);
        progressBox.scrollTop = progressBox.scrollHeight;

        // save to storage
        chrome.storage.local.get(["log"], (data) => {
            const arr = data.log || [];
            arr.push(msg);
            chrome.storage.local.set({ log: arr });
        });

        // also store last progress text
        chrome.storage.local.set({ progress: msg });
    }


    // === RUN BATCH ===
    runBtn.addEventListener("click", () => {



        logProgress("🚀 Starting batch…");

        const txt = document.getElementById("prompts").value.trim();
        if (!txt) {
            alert("No prompts provided.");
            return;
        }

        const prompts = txt.split("\n").map(x => x.trim()).filter(x => x);

        const autoDownload = document.getElementById("autoDownload").checked;
        chrome.storage.local.set({ autoDownload });

        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "runBatch", prompts,autoDownload },
                () => {
                    logProgress("📨 Sent prompts to page…");
                }
            );
        });

        // Save prompt text user typed
        chrome.storage.local.set({ prompt: txt });
    });


    // === RECEIVE LIVE PROGRESS FROM content.js ===
    chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action !== "progress") return;

    let line = "";

    if (msg.type === "start-prompt") {
        line = `▶️ ${msg.index}/${msg.total} — ${msg.prompt}`;
    } 
    else if (msg.type === "prompt-done") {
        line = `✅ Finished ${msg.index}/${msg.total}`;
    } 
    else if (msg.type === "all-done") {
        line = `🎉 All prompts completed!`;
    } 
    else {
        // ignore unknown/technical logs
        return;
    }

    logProgress(line);
});


});
