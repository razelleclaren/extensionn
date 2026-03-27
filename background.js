// ---- background.js ----
let batchState = {
  prompt: "",
  progress: "Idle...",
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "DOWNLOAD_VIDEO") {
        chrome.downloads.download({
            url: msg.url,
            filename: msg.filename,
            saveAs: false
        });
        sendResponse({ ok: true });
        return true;
    }

  // Persist SET_STATE (tetap ada)
  if (msg.type === "SET_STATE") {
    batchState = { ...batchState, ...msg.data };
    chrome.storage.local.set(batchState);
    sendResponse({ ok: true });
    return true;
  }

  // GET_STATE -> baca dari storage agar up-to-date jika ada restart
  if (msg.type === "GET_STATE") {
    chrome.storage.local.get(["prompt", "progress", "log"], (data) => {
      // jika storage kosong fallback ke batchState
      const state = {
        prompt: data.prompt ?? batchState.prompt,
        progress: data.progress ?? batchState.progress,
        log: data.log ?? []
      };
      sendResponse(state);
    });
    return true; // keep channel open for async sendResponse
  }


// ADD_LOG -> append message to log[] in storage
if (msg.type === "ADD_LOG" && msg.data) {

  // --- FIX: HINDARI START-PROMPT DOUBLE ---
  if (!window._lastStart) window._lastStart = "";
  if (msg.data.type === "start-prompt") {
    const key = msg.data.prompt + "_" + msg.data.index;
    if (window._lastStart === key) {
      sendResponse({ ok: true });
      return true;
    }
    window._lastStart = key;
  }
  // -----------------------------------------

  chrome.storage.local.get(["log"], (res) => {
    const current = Array.isArray(res.log) ? res.log : [];

    const idx = msg.data.index || 0;
    const total = msg.data.total || "";
    const promptText = msg.data.prompt || msg.data.message || "";

    let entry = "";

    if (msg.data.type === "start-prompt") {
      entry = `▶️ ${idx}/${total} — ${promptText}`;
    } else if (msg.data.type === "prompt-done") {
      entry = `✅ Finished ${idx}/${total}`;
    } else if (msg.data.type === "all-done") {
      entry = `🎉 All ${total} prompts completed`;
    } else {
      entry = `${promptText}`;
    }

    current.push(entry);

    chrome.storage.local.set({
      log: current,
      progress: entry,
      prompt: promptText
    });
  });

  sendResponse({ ok: true });
  return true;
}



  // DOWNLOAD action (jika ada)
  if (msg.action === "DOWNLOAD" && msg.url) {
    chrome.downloads.download({ url: msg.url });
    sendResponse({ ok: true });
    return true;
  }
});
