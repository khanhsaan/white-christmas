// ===============================
// CONFIG
// ===============================

const BLOCKS       = 32;
const SCRAMBLE_SEED = 435681395; // SHA-256("demo-key-123") % 2^32 — must match Python
const PATCH_SIZE   = 16;
const MARKER_BYTE  = 0xAC;       // 8-bit marker: 1010 1100 — must match Python
const SERVER_BASE  = "http://localhost:5001";
const VIEWER_ID    = "viewer-demo"; // set this to the authenticated viewer id

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

// Precomputed default order for the hardcoded seed.
// Pass a different blockOrder to descramble() for per-image SK-derived seeds.
const DEFAULT_BLOCK_ORDER = generateBlockOrder(BLOCKS * BLOCKS, SCRAMBLE_SEED);

async function fetchBlockOrder(imageId) {
  try {
    const url = `${SERVER_BASE}/unscramble/${imageId}?viewer_id=${encodeURIComponent(VIEWER_ID)}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`unscramble ${resp.status}`);

    const payload = await resp.json();
    if (!Number.isInteger(payload.scramble_seed)) throw new Error("Missing scramble_seed");

    const mode = payload.mode || "unknown";
    console.log(`[SAI] Seed mode=${mode} image=${imageId}`);
    return generateBlockOrder(BLOCKS * BLOCKS, payload.scramble_seed);
  } catch (err) {
    console.warn(`[SAI] Seed fetch failed for image ${imageId}; using legacy default.`, err?.message ?? err);
    return DEFAULT_BLOCK_ORDER;
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

async function descramble(img, imageId, blockOrder = DEFAULT_BLOCK_ORDER) {
  const { naturalWidth: w, naturalHeight: h } = img;

  const resp = await fetch(`${SERVER_BASE}/image/${imageId}?ts=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Server ${resp.status} for image ${imageId}`);
  const serverBitmap = await createImageBitmap(await resp.blob());

  // Scale server image to the element's displayed dimensions
  const scaled    = makeCanvas(w, h);
  scaled.getContext("2d").drawImage(serverBitmap, 0, 0, w, h);

  // Use integer block sizes matching Python's (h // blocks) to avoid per-block drift.
  // The border remainder (w % BLOCKS pixels) stays black, same as Python's np.zeros_like.
  const out    = makeCanvas(w, h);
  const outCtx = out.getContext("2d");
  const bw     = Math.floor(w / BLOCKS);
  const bh     = Math.floor(h / BLOCKS);

  for (let orig = 0; orig < blockOrder.length; orig++) {
    const scr = blockOrder[orig];
    outCtx.drawImage(
      scaled,
      (scr  % BLOCKS) * bw, Math.floor(scr  / BLOCKS) * bh, bw, bh,
      (orig % BLOCKS) * bw, Math.floor(orig / BLOCKS) * bh, bw, bh,
    );
  }

  const newURL = out.convertToBlob
    ? URL.createObjectURL(await out.convertToBlob({ type: "image/jpeg", quality: 0.95 }))
    : out.toDataURL("image/jpeg", 0.95);

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
    const fetchResp = await fetch(img.src);
    if (!fetchResp.ok) return;
    const bitmap = await createImageBitmap(await fetchResp.blob());

    const imageId = extractIdVisible(bitmap) ?? extractIdDct(bitmap);
    if (imageId == null) return;

    console.log("[SAI] ✓ Protected image detected — ID:", imageId, "src:", img.src.slice(0, 80));
    const blockOrder = await fetchBlockOrder(imageId);
    await descramble(img, imageId, blockOrder);

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

document.querySelectorAll("img").forEach(processImage);

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
