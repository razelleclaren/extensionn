// content.js — stable version: deep shadow traversal + wait-for-spinner logic
console.log("[Firefly Batch] content.js loaded");

chrome.storage.local.set({ 
    log: [],
    progress: "Idle..."
});

/* ----------------- Helpers ----------------- */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// generic waitFor condition with timeout
function waitFor(conditionFn, { interval = 300, timeout = 120000 } = {}) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const t = setInterval(() => {
            try {
                if (conditionFn()) {
                    clearInterval(t);
                    resolve(true);
                } else if (Date.now() - start > timeout) {
                    clearInterval(t);
                    reject(new Error("timeout"));
                }
            } catch (e) {
                clearInterval(t);
                reject(e);
            }
        }, interval);
    });
}

/* ------------- Deep shadow DOM traversal ------------- */
/*
Attempts to follow the path you provided (firefly-video-generation -> ... -> firefly-textfield#prompt-input -> textarea)
If structure changes slightly, we try a few fallback ways.
*/
function getDeepTextarea() {
    try {
        // Stepwise traversal following your XPath-like structure
        const gen = document.querySelector("firefly-video-generation") || document.querySelector("#root firefly-video-generation");
        if (!gen) return null;
        const r1 = gen.shadowRoot;
        if (!r1) return null;

        const tab = r1.querySelector("firefly-video-generation-generate-tab-contents");
        if (!tab) {
            // fallback: search inside root shadow for prompt-intro/prompt-panel
            const maybePromptPanel = r1.querySelector("firefly-video-generation-prompt-intro, firefly-video-generation-prompt-panel");
            if (maybePromptPanel && maybePromptPanel.shadowRoot) {
                // try to find firefly-textfield deeper
                const foundTF = maybePromptPanel.shadowRoot.querySelector("firefly-textfield#prompt-input, firefly-textfield");
                if (foundTF && foundTF.shadowRoot) {
                    return foundTF.shadowRoot.querySelector("textarea") || null;
                }
            }
            return null;
        }

        const r2 = tab.shadowRoot;
        if (!r2) return null;

        const panel = r2.querySelector("firefly-video-generation-prompt-panel, firefly-video-generation-prompt-intro");
        if (!panel || !panel.shadowRoot) return null;
        const r3 = panel.shadowRoot;

        // try firefly-prompt -> firefly-textfield
        const promptWrapper = r3.querySelector("firefly-prompt, #firefly-prompt-container, #prompt");
        if (!promptWrapper) {
            // fallback: find any firefly-textfield under r3
            const anyTF = r3.querySelector("firefly-textfield#prompt-input, firefly-textfield");
            if (anyTF && anyTF.shadowRoot) return anyTF.shadowRoot.querySelector("textarea") || null;
            return null;
        }

        const r4 = promptWrapper.shadowRoot || promptWrapper; // if slot replaced, fallback
        // find textfield inside
        const textfield = (r4.querySelector) ? (r4.querySelector("firefly-textfield#prompt-input, firefly-textfield")) : null;
        if (!textfield) {
            // fallback: maybe textarea directly inside container
            const directTA = r4.querySelector && r4.querySelector("textarea");
            return directTA || null;
        }

        const r5 = textfield.shadowRoot;
        if (!r5) return null;

        const textarea = r5.querySelector("textarea");
        return textarea || null;

    } catch (err) {
        console.error("[Firefly Batch] getDeepTextarea error:", err);
        return null;
    }
}

/* ------------- Send progress of the prompt ------------- */
function sendProgress(data) {
    // 1) realtime broadcast supaya popup (jika sedang terbuka) menerima update segera
    try {
        chrome.runtime.sendMessage({ action: "progress", ...data });
    } catch (e) {
        console.warn("[Firefly Batch] sendProgress: runtime.sendMessage failed", e);
    }

    // 2) tell background to persist the message into storage.log
    try {
        chrome.runtime.sendMessage({ type: "ADD_LOG", data });
    } catch (e) {
        console.warn("[Firefly Batch] sendProgress: ADD_LOG failed", e);
    }
}





/* ------------- Generate button detection ------------- */
function findGenerateButton() {
    try {
        const root = document.querySelector("#root > sp-theme > span > div > div > div > firefly-video-generation");
        if (!root) return null;
        const r1 = root.shadowRoot;

        const tab = r1.querySelector("div > firefly-video-generation-generate-tab-contents");
        if (!tab) return null;
        const r2 = tab.shadowRoot;

        const panel = r2.querySelector("div > div > div > firefly-video-generation-prompt-panel");
        if (!panel) return null;
        const r3 = panel.shadowRoot;

        const genBtnHost = r3.querySelector("#prompt > div.primary-action-slot > firefly-video-generation-generate-button");
        if (!genBtnHost) return null;
        const r4 = genBtnHost.shadowRoot;

        const btn = r4.querySelector("#generate-button");
        if (btn) {
            console.log("[Firefly Batch] Generate Button FOUND!");
            return btn;
        }

        return null;

    } catch (err) {
        console.error("[Firefly Batch] ERROR locating generate button:", err);
        return null;
    }
}

function clickGenerateButton(btn) {
    if (!btn) return false;

    try {
        btn.click();
        console.log("[Firefly Batch] Generate clicked via .click()");
        return true;
    } catch (e) {
        console.warn("[Firefly Batch] Default click failed, using event dispatch");

        ["pointerdown", "mousedown", "mouseup", "click"].forEach(evt =>
            btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }))
        );

        return true;
    }
}



/* ------------- Loading / spinner detection ------------- */
function isGenerationLoading() {
    try {
        // common Firefly/Spectrum progress indicator tag
        if (document.querySelector("sp-progress-circle, firefly-progress-circle, spectrum-circular-progress")) return true;

        // any element with attribute aria-busy or aria-live indicating 'Generating'
        const busy = document.querySelector("[aria-busy='true'], [data-generating='true']");
        if (busy) return true;

        // if generate button exists but is disabled -> likely loading
        const btn = findGenerateButton();
        if (btn && btn.disabled) return true;

        // check for visible text like "Generating" / "Rendering"
        const textual = Array.from(document.querySelectorAll("div, span, p")).some(el => {
            const t = (el.innerText || "").toLowerCase();
            return t.includes("generating") || t.includes("rendering") || t.includes("processing");
        });
        if (textual) return true;

        // check preview area for progress or for absence/presence of final video
        const previewHasVideo = !!document.querySelector("video, img[data-testid='preview-video']");
        // If preview doesn't have result yet, might be loading — but we avoid false positives by not relying only on this.
        // prefer explicit indicators above.

        return false;
    } catch (e) {
        console.warn("[Firefly Batch] isGenerationLoading error:", e);
        return false;
    }
}

/* ------------- Apakah button sudah enable ------------- */
function isGenerateButtonEnabled() {
    const btn = findGenerateButton();
    if (!btn) return false;

    // Disabled via attribute
    if (btn.disabled) return false;

    // Disabled via aria
    if (btn.getAttribute("aria-disabled") === "true") return false;

    // Disabled via CSS class
    const cls = btn.classList.toString().toLowerCase();
    if (cls.includes("disabled")) return false;

    return true;
}

function waitForGenerateButtonEnabled() {
    console.log("[Firefly Batch] Waiting for Generate button to be enabled...");
    return waitFor(() => isGenerateButtonEnabled(), {
        interval: 300,
        timeout: 120000, // 2 minutes
    });
}

/* ------------- Helper: Cari Video di dalam Shadow DOM ------------- */
function findVideoDeep(root = document) {
    // 1. Coba cari langsung di root saat ini
    let video = root.querySelector("video");
    if (video && video.src && video.src.startsWith("http")) {
        return video;
    }

    // 2. Jika tidak ketemu, cari di dalam semua elemen yang punya shadowRoot
    const elements = root.querySelectorAll("*");
    for (const el of elements) {
        if (el.shadowRoot) {
            const found = findVideoDeep(el.shadowRoot);
            if (found) return found;
        }
    }
    return null;
}

async function autoDownloadLatestVideo(index) {
    console.log("[Firefly] Auto-download triggered for prompt", index);

  let videoEl = null;

    try {
        // Tunggu maksimal 10 detik sampai elemen video muncul dan punya src valid
        await waitFor(() => {
                const v = findVideoDeep(document);
                if (v && v.src && v.src.length > 0) {
                    videoEl = v;
                    return true;
                }
                return false;
            }, { interval: 500, timeout: 10000 });
            
        } catch (e) {
            console.warn("[Firefly] Gagal menemukan elemen video setelah menunggu:", e);
            return; // Keluar jika timeout
        }

        if (!videoEl) {
            console.error("[Firefly] Video element not found via Deep Search.");
            return;
        }

        const src = videoEl.src;
    console.log("[Firefly] Found video URL:", src);
    chrome.runtime.sendMessage({
        type: "DOWNLOAD_VIDEO",
        url: src,
        filename: `firefly_video_${index}.mp4`
    });
}




/* ------------- Main batch flow ------------- */
async function runBatch(prompts) {
    console.log("[Firefly Batch] Starting batch...");
    console.log("[Firefly Batch] Prompts:", prompts);

    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`[Firefly Batch] (${i+1}/${prompts.length}) preparing:`, prompt);
        sendProgress({
            type: "start-prompt",
            index: i + 1,
            total: prompts.length,
            prompt: prompt
        });

        // find textarea by deep traversal (with timeout)
        let textarea = getDeepTextarea();
        if (!textarea) {
            // wait up to 10s for textarea to appear
            try {
                await waitFor(() => !!getDeepTextarea(), { interval: 300, timeout: 10000 });
                textarea = getDeepTextarea();
            } catch (e) {
                console.error("[Firefly Batch] ERROR: textarea not found, skipping prompt:", prompt);
                continue;
            }
        }

        // set prompt
        textarea.focus?.();
        textarea.value = prompt;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[Firefly Batch] Prompt injected.");

        // small pause to allow UI to update
        await delay(300);

        // find and click Generate
        const genBtn = findGenerateButton();
        if (!genBtn) {
            console.error("[Firefly Batch] ERROR: Generate button not found, aborting.");
            return;
        }

        // If button is inside shadowRoot, click it by calling .click()
        try {
            clickGenerateButton(genBtn);
            console.log("[Firefly Batch] Generate clicked.");
        } catch (e) {
            // fallback: dispatch mouse events
            genBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            genBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            genBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            console.log("[Firefly Batch] Generate clicked via events.");
        }

        // WAIT until generation finishes:
        // Wait for either spinner to appear and then disappear, or wait until spinner not present.
        try {
            // If it immediately reports loading, wait for it to finish.
            // First wait for loading to start (max short time), then wait for it to stop.
            const started = await Promise.race([
                (async () => { await waitFor(() => isGenerationLoading(), { interval: 250, timeout: 8000 }); return true; })(),
                (async () => { await delay(400); return false; })() // if no loading within 400ms, continue to longer wait
            ]);

            if (started) {
                console.log("[Firefly Batch] Detected generation started. Waiting for finish...");
                // wait until no longer loading
                await waitFor(() => !isGenerationLoading(), { interval: 500, timeout: 180000 });
            } else {
                // If no explicit spinner detected, still wait a conservative amount (short)
                await delay(2500);
            }

            console.log("[Firefly Batch] Generation finished for prompt", i+1);
                        if (window.__AUTO_DOWNLOAD__) {
                try {
                    await autoDownloadLatestVideo(i+1);
                } catch (err) {
                    console.warn("Auto-download failed:", err);
                }
                }
                sendProgress({
                    type: "prompt-done",
                    index: i + 1,
                    total: prompts.length
                });


            await waitForGenerateButtonEnabled();
            console.log("[Firefly Batch] Generate button is now enabled. Continuing...");
        } catch (err) {
            console.warn("[Firefly Batch] Timeout or error while waiting for generation. Moving on. Err:", err);
        }

        // short pause before next prompt to let UI settle
        await delay(700);
    }

    console.log("[Firefly Batch] All prompts processed.");
    sendProgress({
    type: "all-done",
    total: prompts.length
    });
}

/* ------------- Message listener ------------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === "runBatch" && Array.isArray(msg.prompts)) {
        // run but don't block the channel
        //kode autodownload
        window.__AUTO_DOWNLOAD__ = msg.autoDownload || false;
        chrome.runtime.sendMessage({
        type: "SET_STATE",
        data: { progress: "🚀 Starting batch…" }
        });
        console.log("[Firefly Batch] Batch started via popup…");

        runBatch(msg.prompts).catch(e => console.error("[Firefly Batch] runBatch error:", e));
        sendResponse({ status: "started" });
        return true;
    }
});


