// ===============================
// CONFIG
// ===============================

const BLOCKS       = 32;
const DEFAULT_BACKEND_BASE = "http://localhost:8000";
const PATCH_SIZE   = 16;
const MARKER_BYTE  = 0xAC;       // 8-bit marker: 1010 1100 — must match Python

const VIS_BLOCK_SIZE = 8;  // px per watermark bit
const VIS_COLS       = 8;
const VIS_ROWS       = 4;
const VIS_BORDER     = 2;


// ===============================
// 1. PRNG + canvas helper
// ===============================

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}


// ===============================
// 2. Block order (Fisher-Yates shuffle)
// ===============================

function generateBlockOrder(numBlocks, seed) {
  const rand = mulberry32(seed);
  const arr  = Array.from({ length: numBlocks }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

async function getSettings() {
  const res = await sendRuntimeMessage({ type: "wc:getSettings" });
  if (!res?.ok || !res.settings) {
    throw new Error("Could not load extension settings");
  }
  return res.settings;
}

function normalizeBaseUrl(url) {
  return (url || DEFAULT_BACKEND_BASE).replace(/\/+$/, "");
}

async function fetchSeedPayload(imageId) {
  const settings = await getSettings();
  if (!settings.autoDecode) return null;
  const baseUrl = normalizeBaseUrl(settings.backendBaseUrl);

  const res = await sendRuntimeMessage({
    type: "wc:fetchJson",
    method: "GET",
    url: `${baseUrl}/api/images/${imageId}/key`,
    includeAuth: true,
    cache: "no-store",
  });

  if (!res?.ok) throw new Error(res?.error || "Key request failed");
  if (res.status !== 200 || !Number.isInteger(res.data?.seed)) return null;
  return { seed: res.data.seed, blocks: Number(res.data.blocks) || BLOCKS, baseUrl };
}

async function fetchProtectedImageBytes(baseUrl, imageId) {
  const res = await sendRuntimeMessage({
    type: "wc:fetchArrayBuffer",
    method: "GET",
    url: `${baseUrl}/api/images/${imageId}/file?ts=${Date.now()}`,
    includeAuth: true,
    cache: "no-store",
  });

  if (!res?.ok) throw new Error(res?.error || "File request failed");
  if (res.status !== 200) return null;
  return normalizeArrayBuffer(res.arrayBuffer) || base64ToArrayBuffer(res.base64);
}

function normalizeArrayBuffer(value) {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value).buffer;
  if (typeof value === "object" && Array.isArray(value.data)) {
    return Uint8Array.from(value.data).buffer;
  }
  return null;
}

function base64ToArrayBuffer(base64) {
  if (!base64 || typeof base64 !== "string") return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decodeImageBytesToDrawable(imageBytes) {
  const blob = new Blob([imageBytes], { type: "image/jpeg" });
  try {
    return await createImageBitmap(blob);
  } catch (_) {
    return await new Promise((resolve, reject) => {
      const tmp = new Image();
      const blobUrl = URL.createObjectURL(blob);
      tmp.onload = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(tmp);
      };
      tmp.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error("The source image could not be decoded."));
      };
      tmp.src = blobUrl;
    });
  }
}

async function fetchBitmapForDetection(img) {
  const imageUrl = img.currentSrc || img.src;
  if (!imageUrl) return null;
  const isLocalFile = imageUrl.startsWith("file:");

  // For file:// pages, avoid fetch() entirely; use the loaded element directly.
  // This works when "Allow access to file URLs" is enabled for the extension.
  if (isLocalFile) {
    try {
      return await createImageBitmap(img);
    } catch (_) {
      // Fall through to other strategies.
    }
  }

  // Prefer extension-context fetch via background to avoid page CORS limitations.
  try {
    const res = await sendRuntimeMessage({
      type: "wc:fetchArrayBuffer",
      method: "GET",
      url: imageUrl,
      includeAuth: false,
      cache: "no-store",
    });
    if (res?.ok && res.status >= 200 && res.status < 300) {
      const bytes = normalizeArrayBuffer(res.arrayBuffer) || base64ToArrayBuffer(res.base64);
      if (bytes) return await createImageBitmap(new Blob([bytes]));
    }
  } catch (_) {
    // Fallback below.
  }

  // Fallback to page-context fetch for cases where host permissions are unavailable.
  try {
    const fetchResp = await fetch(imageUrl, { cache: "no-store" });
    if (!fetchResp.ok) return null;
    return await createImageBitmap(await fetchResp.blob());
  } catch (_) {
    return null;
  }
}


// ===============================
// 3. Separable DCT-2D with precomputed tables
//    O(N³) separable vs O(N⁴) naive — ~8× faster for N=16
// ===============================

const DCT_ALPHA = Float64Array.from(
  { length: PATCH_SIZE },
  (_, k) => (k === 0 ? Math.sqrt(1 / PATCH_SIZE) : Math.sqrt(2 / PATCH_SIZE))
);

const DCT_COS = Array.from({ length: PATCH_SIZE }, (_, k) =>
  Float64Array.from({ length: PATCH_SIZE }, (_, n) =>
    Math.cos((Math.PI * (2 * n + 1) * k) / (2 * PATCH_SIZE))
  )
);

function dct1D(input) {
  const N   = input.length;
  const out = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) sum += input[n] * DCT_COS[k][n];
    out[k] = DCT_ALPHA[k] * sum;
  }
  return out;
}

function dct2D(matrix) {
  const N      = matrix.length;
  const rowDct = matrix.map(row => dct1D(row));

  const out = Array.from({ length: N }, () => new Float64Array(N));
  const col = new Float64Array(N);
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) col[r] = rowDct[r][c];
    const colResult = dct1D(col);
    for (let r = 0; r < N; r++) out[r][c] = colResult[r];
  }
  return out;
}

// Bit-pair layout must match Python get_dct_pairs()
const BIT_PAIRS = Array.from({ length: 32 }, (_, i) => {
  const u = 2 + (i % 8);
  const v = 2 + 2 * Math.floor(i / 8);
  return [[u, v], [u, v + 1]];
});


// ===============================
// 4. Shared bit decoder
// ===============================

function decodeBits(bits) {
  let marker = 0;
  for (let i = 0; i < 8; i++) marker = (marker << 1) | bits[i];
  if (marker !== MARKER_BYTE) return null;

  let id24 = 0;
  for (let i = 8; i < 32; i++) id24 = (id24 << 1) | bits[i];
  return id24;
}


// ===============================
// 5A. Extract ID from visible watermark (primary — survives FB re-encoding)
// ===============================

function extractIdVisible(bitmap) {
  const { width, height } = bitmap;
  const wmW = VIS_COLS * VIS_BLOCK_SIZE + 2 * VIS_BORDER;
  const wmH = VIS_ROWS * VIS_BLOCK_SIZE + 2 * VIS_BORDER;
  if (width < wmW + 20 || height < wmH + 20) return null;

  // Crop only the watermark region into a small canvas — avoids full-size allocation
  const canvas = makeCanvas(wmW, wmH);
  const ctx    = canvas.getContext("2d");
  ctx.drawImage(bitmap, width - wmW - 10, 10, wmW, wmH, 0, 0, wmW, wmH);
  const { data } = ctx.getImageData(0, 0, wmW, wmH);

  const bits = Array.from({ length: 32 }, (_, i) => {
    const row = Math.floor(i / VIS_COLS);
    const col = i % VIS_COLS;
    const y   = Math.floor(VIS_BORDER + row * VIS_BLOCK_SIZE + VIS_BLOCK_SIZE / 2);
    const x   = Math.floor(VIS_BORDER + col * VIS_BLOCK_SIZE + VIS_BLOCK_SIZE / 2);
    const p   = (y * wmW + x) * 4;
    return (data[p] + data[p + 1] + data[p + 2]) / 3 > 128 ? 1 : 0;
  });

  return decodeBits(bits);
}


// ===============================
// 5B. Extract ID from DCT patch (fallback)
// ===============================

function extractIdDct(bitmap) {
  if (bitmap.width < PATCH_SIZE || bitmap.height < PATCH_SIZE) return null;

  // Crop only the top-left PATCH_SIZE × PATCH_SIZE — avoids full-size allocation
  const canvas = makeCanvas(PATCH_SIZE, PATCH_SIZE);
  const ctx    = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, PATCH_SIZE, PATCH_SIZE, 0, 0, PATCH_SIZE, PATCH_SIZE);
  const { data } = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE);

  let p = 0;
  const M = Array.from({ length: PATCH_SIZE }, () =>
    Array.from({ length: PATCH_SIZE }, () => {
      const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      p += 4;
      return gray;
    })
  );

  const D    = dct2D(M);
  const bits = BIT_PAIRS.map(([[u1, v1], [u2, v2]]) => D[u1][v1] >= D[u2][v2] ? 1 : 0);
  return decodeBits(bits);
}


// ===============================
// 6. Descramble using server-sourced clean image
// ===============================

async function descramble(img, imageId, blockOrder, baseUrl, blocks = BLOCKS) {
  const protectedBuffer = await fetchProtectedImageBytes(baseUrl, imageId);
  if (!protectedBuffer) throw new Error("Could not load protected image bytes.");
  const serverDrawable = await decodeImageBytesToDrawable(protectedBuffer);

  const srcW = serverDrawable.width || img.naturalWidth;
  const srcH = serverDrawable.height || img.naturalHeight;
  const size = Math.floor(Math.min(srcW, srcH) / blocks) * blocks;
  if (!size) throw new Error("Image is too small for decode grid.");

  // Match backend decode preprocessing: resize to square divisible by block count.
  const scaled = makeCanvas(size, size);
  const scaledCtx = scaled.getContext("2d");
  scaledCtx.imageSmoothingEnabled = true;
  scaledCtx.drawImage(serverDrawable, 0, 0, size, size);

  const out    = makeCanvas(size, size);
  const outCtx = out.getContext("2d");
  outCtx.imageSmoothingEnabled = false;
  const bw     = Math.floor(size / blocks);
  const bh     = bw;

  for (let orig = 0; orig < blockOrder.length; orig++) {
    const scr = blockOrder[orig];
    outCtx.drawImage(
      scaled,
      (scr  % blocks) * bw, Math.floor(scr  / blocks) * bh, bw, bh,
      (orig % blocks) * bw, Math.floor(orig / blocks) * bh, bw, bh,
    );
  }

  const newURL = out.convertToBlob
    ? URL.createObjectURL(await out.convertToBlob({ type: "image/png" }))
    : out.toDataURL("image/png");

  // Revoke the old blob URL if we created it, to free memory
  if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);

  img.src = newURL;
  img.dataset.unscrambled = "true";
  console.log("[SAI] ✓ Descrambled image ID", imageId);
}


// ===============================
// 7. Process a single image
// ===============================

const inFlight = new Set(); // prevents duplicate parallel processing of the same element

function waitForLoad(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    img.addEventListener("load",  resolve, { once: true });
    img.addEventListener("error", reject,  { once: true });
  });
}

async function processImage(img) {
  if (!img?.src)                                         return;
  if (img.dataset.unscrambled === "true")                return;
  if (img.src.startsWith("data:") || img.src.startsWith("blob:")) return;
  if (inFlight.has(img))                                 return;

  inFlight.add(img);
  try {
    await waitForLoad(img);

    // Re-check src after load — it may have changed or become a blob
    if (!img.src || img.src.startsWith("data:") || img.src.startsWith("blob:")) return;

    // Single fetch shared by both extractors
    const bitmap = await fetchBitmapForDetection(img);
    if (!bitmap) return;

    const imageId = extractIdVisible(bitmap) ?? extractIdDct(bitmap);
    if (imageId == null) return;

    console.log("[SAI] ✓ Protected image detected — ID:", imageId, "src:", img.src.slice(0, 80));
    const seedPayload = await fetchSeedPayload(imageId);
    if (!seedPayload) return;
    const blockOrder = generateBlockOrder(seedPayload.blocks * seedPayload.blocks, seedPayload.seed);
    await descramble(img, imageId, blockOrder, seedPayload.baseUrl, seedPayload.blocks);

  } catch (err) {
    // Silently drop load/CORS failures for non-protected images;
    // only log genuine plugin errors (not the image's own load error Event)
    if (!(err instanceof Event)) console.warn("[SAI]", err.message ?? err);
  } finally {
    inFlight.delete(img);
  }
}


// ===============================
// 8. Initial scan + MutationObserver
// ===============================

console.log("[SAI] Protected Image Unscrambler loaded");

function scanAllImages() {
  document.querySelectorAll("img").forEach(processImage);
}

function ensureImageElementForImageDocument() {
  const isImageDocument = document.contentType?.startsWith("image/");
  if (!isImageDocument) return;
  if (document.querySelector("img")) return;

  const img = document.createElement("img");
  img.src = window.location.href;
  img.style.maxWidth = "100vw";
  img.style.maxHeight = "100vh";
  img.style.width = "auto";
  img.style.height = "auto";
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  document.body.style.display = "grid";
  document.body.style.placeItems = "center";
  document.body.style.background = "#111";
  document.body.appendChild(img);
}

ensureImageElementForImageDocument();
scanAllImages();

new MutationObserver(mutations => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.tagName === "IMG") {
        processImage(node);
      } else {
        node.querySelectorAll?.("img").forEach(processImage);
      }
    }
  }
}).observe(document.documentElement ?? document.body, { childList: true, subtree: true });

// Some sites and local image documents populate/replace image elements after idle.
window.addEventListener("load", scanAllImages, { once: true });
setTimeout(scanAllImages, 300);
setTimeout(scanAllImages, 1200);
