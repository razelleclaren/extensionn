let batchState = {
  prompt: "",
  progress: "Idle...",
};
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Persist SET_STATE (tetap ada)
  if (msg.type === "SET_STATE") {
    batchState = { ...batchState, ...msg.data };
    chrome.storage.local.set(batchState);
  }
    // GET_STATE -> baca dari storage agar up-to-date jika ada restart
  if (msg.type === "GET_STATE") {
    sendResponse(batchState);
  }
  if (msg.action === "DOWNLOAD") {
chrome.downloads.download({ url: msg.url });
}
});