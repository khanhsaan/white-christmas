const DEFAULT_SETTINGS = {
  backendBaseUrl: "https://sxt8piagkk.ap-southeast-2.awsapprunner.com",
  accessToken: "",
  autoDecode: true,
  debug: false,
};

async function getSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  // Always override stale localhost URL
  if (!merged.backendBaseUrl || merged.backendBaseUrl.includes("localhost")) {
    merged.backendBaseUrl = DEFAULT_SETTINGS.backendBaseUrl;
    chrome.storage.local.set({ backendBaseUrl: merged.backendBaseUrl });
  }
  return merged;
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set(next);
  return next;
}

function withAuth(headers, token) {
  const out = { ...(headers || {}) };
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

async function fetchBuffer(url, options = {}) {
  const response = await fetch(url, options);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  return {
    ok: response.ok,
    status: response.status,
    base64,
  };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.local.get(null);
  const merged = { ...DEFAULT_SETTINGS, ...existing };
  // Migrate stale localhost URL to production
  if (!merged.backendBaseUrl || merged.backendBaseUrl.includes("localhost")) {
    merged.backendBaseUrl = DEFAULT_SETTINGS.backendBaseUrl;
  }
  await chrome.storage.local.set(merged);

  // On fresh install, open the popup to prompt the user to sign in
  if (details.reason === "install" && !existing.accessToken) {
    chrome.action.openPopup().catch(() => {
      // openPopup requires a focused window; fall back to opening as a tab
      chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "wc:getSettings") {
        sendResponse({ ok: true, settings: await getSettings() });
        return;
      }

      if (message?.type === "wc:setSettings") {
        sendResponse({ ok: true, settings: await setSettings(message.patch || {}) });
        return;
      }

      if (message?.type === "wc:fetchJson") {
        const settings = await getSettings();
        const headers = message.includeAuth
          ? withAuth(message.headers, settings.accessToken)
          : (message.headers || {});
        const result = await fetchJson(message.url, {
          method: message.method || "GET",
          headers,
          body: message.body,
          cache: message.cache || "no-store",
        });
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message?.type === "wc:fetchArrayBuffer") {
        const settings = await getSettings();
        const headers = message.includeAuth
          ? withAuth(message.headers, settings.accessToken)
          : (message.headers || {});
        const result = await fetchBuffer(message.url, {
          method: message.method || "GET",
          headers,
          body: message.body,
          cache: message.cache || "no-store",
        });
        sendResponse({ ok: true, ...result });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});
