const DEFAULTS = {
  backendBaseUrl: "https://sxt8piagkk.ap-southeast-2.awsapprunner.com",
  accessToken: "",
  email: "",
  autoDecode: true,
};

// ── DOM refs ──────────────────────────────────────────────
const els = {
  viewAuth:          document.getElementById("view-auth"),
  viewLoggedIn:      document.getElementById("view-loggedin"),
  sessionName:       document.getElementById("sessionName"),
  sessionEmail:      document.getElementById("sessionEmail"),
  autoDecode:        document.getElementById("autoDecode"),
  signOutBtn:        document.getElementById("signOutBtn"),
  // logged-in advanced
  backendBaseUrl:    document.getElementById("backendBaseUrl"),
  saveBtn:           document.getElementById("saveBtn"),
  // auth view
  pairCode:          document.getElementById("pairCode"),
  pairBtn:           document.getElementById("pairBtn"),
  email:             document.getElementById("email"),
  password:          document.getElementById("password"),
  signInBtn:         document.getElementById("signInBtn"),
  saveBtn2:          document.getElementById("saveBtn2"),
  backendBaseUrlAuth: document.getElementById("backendBaseUrlAuth"),
  status:            document.getElementById("status"),
};

// ── Status ───────────────────────────────────────────────
function setStatus(text, type) {
  els.status.textContent = text;
  els.status.className = type || "";
  if (!text) return;
  setTimeout(() => {
    if (els.status.textContent === text) {
      els.status.textContent = "";
      els.status.className = "";
    }
  }, 2200);
}

// ── Runtime message helper ────────────────────────────────
function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// ── Fetch profile from backend ────────────────────────────
async function fetchAndStoreProfile(backendBaseUrl, accessToken) {
  try {
    const res = await sendRuntimeMessage({
      type: "wc:fetchJson",
      method: "GET",
      url: `${backendBaseUrl}/api/me`,
      includeAuth: false,
      headers: { "Authorization": `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res?.ok && res.data?.email) {
      await chrome.storage.local.set({
        email: res.data.email,
        firstName: res.data.first_name || "",
      });
      return { email: res.data.email, firstName: res.data.first_name || "" };
    }
  } catch (_) {}
  return null;
}

// ── View switcher ─────────────────────────────────────────
function showLoggedIn(email, firstName, autoDecode) {
  els.viewAuth.classList.add("hidden");
  els.viewLoggedIn.classList.add("active");
  const name = firstName ? `Hi, ${firstName}` : (email || "Logged in");
  els.sessionName.textContent = name;
  els.sessionEmail.textContent = email || "";
  els.autoDecode.checked = Boolean(autoDecode);
}

function showLoggedOut(backendBaseUrl) {
  els.viewLoggedIn.classList.remove("active");
  els.viewAuth.classList.remove("hidden");
  if (backendBaseUrl) {
    els.backendBaseUrlAuth.value = backendBaseUrl;
  }
}

// ── Load & render ─────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.local.get({ ...DEFAULTS, firstName: "" });
  const backendUrl = s.backendBaseUrl || DEFAULTS.backendBaseUrl;

  if (s.backendBaseUrl && els.backendBaseUrl) {
    els.backendBaseUrl.value = backendUrl;
  }

  if (s.accessToken) {
    showLoggedIn(s.email, s.firstName, s.autoDecode);
  } else {
    showLoggedOut(backendUrl);
  }
}

// ── Helpers ───────────────────────────────────────────────
function getBackendUrl() {
  // prefer logged-in advanced field, fall back to auth view field
  const loggedInField = els.backendBaseUrl?.value?.trim().replace(/\/+$/, "");
  const authField = els.backendBaseUrlAuth?.value?.trim().replace(/\/+$/, "");
  return loggedInField || authField || DEFAULTS.backendBaseUrl;
}

// ── Sign in ───────────────────────────────────────────────
async function signIn() {
  const backendBaseUrl = getBackendUrl();
  const email = els.email.value.trim();
  const password = els.password.value;

  if (!email || !password) {
    setStatus("Email and password are required.", "err");
    return;
  }

  els.signInBtn.disabled = true;
  els.signInBtn.textContent = "Signing in...";

  try {
    const res = await sendRuntimeMessage({
      type: "wc:fetchJson",
      method: "POST",
      url: `${backendBaseUrl}/api/auth/login`,
      includeAuth: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    if (!res?.ok) throw new Error(res?.error || "Request failed");
    if (res.status !== 200 || !res.data?.access_token) {
      throw new Error(res.data?.detail || `Login failed (${res.status})`);
    }

    const token = res.data.access_token;
    await chrome.storage.local.set({ backendBaseUrl, accessToken: token, autoDecode: true, email });

    const profile = await fetchAndStoreProfile(backendBaseUrl, token);
    els.password.value = "";
    showLoggedIn(profile?.email || email, profile?.firstName || "", true);
    setStatus("Signed in.", "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Sign-in failed.", "err");
  } finally {
    els.signInBtn.disabled = false;
    els.signInBtn.textContent = "Sign In";
  }
}

// ── Pair with code ────────────────────────────────────────
async function pairWithCode() {
  const backendBaseUrl = getBackendUrl();
  const code = els.pairCode.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!code) {
    setStatus("Pair code is required.", "err");
    return;
  }

  els.pairBtn.disabled = true;
  els.pairBtn.textContent = "Pairing...";

  try {
    const res = await sendRuntimeMessage({
      type: "wc:fetchJson",
      method: "POST",
      url: `${backendBaseUrl}/api/plugin/link/exchange`,
      includeAuth: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });

    if (!res?.ok) throw new Error(res?.error || "Request failed");
    if (res.status !== 200 || !res.data?.access_token) {
      throw new Error(res.data?.detail || `Pairing failed (${res.status})`);
    }

    const token = res.data.access_token;
    await chrome.storage.local.set({ backendBaseUrl, accessToken: token, autoDecode: true });

    const profile = await fetchAndStoreProfile(backendBaseUrl, token);
    els.pairCode.value = "";
    showLoggedIn(profile?.email || "", profile?.firstName || "", true);
    setStatus("Paired.", "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Pairing failed.", "err");
  } finally {
    els.pairBtn.disabled = false;
    els.pairBtn.textContent = "Pair →";
  }
}

// ── Sign out ──────────────────────────────────────────────
async function signOut() {
  const s = await chrome.storage.local.get(["backendBaseUrl"]);
  await chrome.storage.local.set({ accessToken: "", email: "" });
  showLoggedOut(s.backendBaseUrl || DEFAULTS.backendBaseUrl);
  setStatus("Signed out.", "ok");
}

// ── Save (backend URL + autoDecode) ───────────────────────
async function saveSettings() {
  const backendBaseUrl = getBackendUrl();
  const autoDecode = els.autoDecode?.checked ?? true;
  await chrome.storage.local.set({ backendBaseUrl, autoDecode });
  setStatus("Saved.", "ok");
}

// ── Save from auth view ───────────────────────────────────
async function saveAuthSettings() {
  const backendBaseUrl = els.backendBaseUrlAuth.value.trim().replace(/\/+$/, "");
  if (!backendBaseUrl) { setStatus("URL is required.", "err"); return; }
  await chrome.storage.local.set({ backendBaseUrl });
  setStatus("Saved.", "ok");
}

// ── Auto-decode toggle (logged-in view) ───────────────────
els.autoDecode?.addEventListener("change", () => {
  chrome.storage.local.set({ autoDecode: els.autoDecode.checked });
});

// ── Event listeners ───────────────────────────────────────
els.signInBtn?.addEventListener("click", signIn);
els.pairBtn?.addEventListener("click", pairWithCode);
els.signOutBtn?.addEventListener("click", signOut);
els.saveBtn?.addEventListener("click", saveSettings);
els.saveBtn2?.addEventListener("click", saveAuthSettings);

loadSettings();
