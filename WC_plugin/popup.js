const form = {
  backendBaseUrl: document.getElementById("backendBaseUrl"),
  accessToken: document.getElementById("accessToken"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  autoDecode: document.getElementById("autoDecode"),
  signInBtn: document.getElementById("signInBtn"),
  saveBtn: document.getElementById("saveBtn"),
  status: document.getElementById("status"),
};

const DEFAULTS = {
  backendBaseUrl: "http://localhost:8000",
  accessToken: "",
  autoDecode: true,
};

function setStatus(text) {
  form.status.textContent = text;
  if (!text) return;
  setTimeout(() => {
    if (form.status.textContent === text) form.status.textContent = "";
  }, 1800);
}

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

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  form.backendBaseUrl.value = settings.backendBaseUrl || DEFAULTS.backendBaseUrl;
  form.accessToken.value = settings.accessToken || "";
  form.autoDecode.checked = Boolean(settings.autoDecode);
}

async function saveSettings() {
  const backendBaseUrl = form.backendBaseUrl.value.trim().replace(/\/+$/, "");
  const accessToken = form.accessToken.value.trim();
  const autoDecode = form.autoDecode.checked;

  if (!backendBaseUrl) {
    setStatus("Backend URL is required.");
    return;
  }

  await chrome.storage.local.set({
    backendBaseUrl,
    accessToken,
    autoDecode,
  });
  setStatus("Saved.");
}

async function signIn() {
  const backendBaseUrl = form.backendBaseUrl.value.trim().replace(/\/+$/, "");
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!backendBaseUrl) {
    setStatus("Backend URL is required.");
    return;
  }
  if (!email || !password) {
    setStatus("Email and password are required.");
    return;
  }

  form.signInBtn.disabled = true;
  form.signInBtn.textContent = "Signing in...";

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
      const detail = res.data?.detail || `Login failed (${res.status})`;
      throw new Error(detail);
    }

    form.accessToken.value = res.data.access_token;
    await chrome.storage.local.set({
      backendBaseUrl,
      accessToken: res.data.access_token,
      autoDecode: form.autoDecode.checked,
    });

    form.password.value = "";
    setStatus("Signed in. Token saved.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Sign-in failed.");
  } finally {
    form.signInBtn.disabled = false;
    form.signInBtn.textContent = "Sign In";
  }
}

form.saveBtn.addEventListener("click", saveSettings);
form.signInBtn.addEventListener("click", signIn);
document.addEventListener("DOMContentLoaded", loadSettings);
loadSettings();
