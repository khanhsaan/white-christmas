// ===============================
// CONFIG — SCRAMBLE + DCT-ID
// ===============================

const BLOCKS = 32;
const SCRAMBLE_SEED = 435681395; // must match Python key "demo-key-123"
const PATCH_SIZE = 16;
const MARKER_BYTE = 0xAC;        // must match Python
const SERVER_BASE = "http://localhost:5001"; // Flask server

// Visible watermark config
const VIS_BLOCK_SIZE = 8;  // 8x8 pixels per bit
const VIS_COLS = 8;
const VIS_ROWS = 4;
const VIS_BORDER = 2;


// ===============================
// 1. RNG + helper canvas
// ===============================
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}


// ===============================
// 2. Block order (scramble mode)
// ===============================
function generateBlockOrder(numBlocks, seed) {
  const rand = mulberry32(seed);
  const arr = [];
  for (let i = 0; i < numBlocks; i++) arr.push(i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const BLOCK_ORDER = generateBlockOrder(BLOCKS * BLOCKS, SCRAMBLE_SEED);


// ===============================
// 3. DCT 2D (PATCH_SIZE x PATCH_SIZE)
// ===============================
function dct2D(matrix) {
  const N = matrix.length;
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  const alpha = (k) => (k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N));

  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum +=
            matrix[x][y] *
            Math.cos((Math.PI * (2 * x + 1) * u) / (2 * N)) *
            Math.cos((Math.PI * (2 * y + 1) * v) / (2 * N));
        }
      }
      out[u][v] = alpha(u) * alpha(v) * sum;
    }
  }
  return out;
}

// bit-pair layout must match Python get_dct_pairs()
function getDctPairs() {
  const pairs = [];
  for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
    const row = Math.floor(bitIndex / 8);
    const col = bitIndex % 8;

    const u1 = 2 + col;
    const v1 = 2 + 2 * row;
    const u2 = u1;
    const v2 = v1 + 1;

    pairs.push([[u1, v1], [u2, v2]]);
  }
  return pairs;
}
const BIT_PAIRS = getDctPairs();


// ===============================
// 4A. Extract ID from visible watermark (primary method for FB)
// ===============================
async function extractImageIdFromVisibleWatermark(img) {
  try {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    
    const watermark_w = VIS_COLS * VIS_BLOCK_SIZE + 2 * VIS_BORDER;
    const watermark_h = VIS_ROWS * VIS_BLOCK_SIZE + 2 * VIS_BORDER;
    
    if (width < watermark_w + 20 || height < watermark_h + 20) {
      return null;  // Image too small
    }

    const resp = await fetch(img.src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = makeCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    // Sample top-right corner (where watermark should be)
    const start_x = width - watermark_w - 10;
    const start_y = 10;
    
    const imgData = ctx.getImageData(start_x, start_y, watermark_w, watermark_h);
    const data = imgData.data;

    // Extract 32 bits
    const bits = [];
    for (let bit_idx = 0; bit_idx < 32; bit_idx++) {
      const row = Math.floor(bit_idx / VIS_COLS);
      const col = bit_idx % VIS_COLS;
      
      // Center of the block
      const y = VIS_BORDER + row * VIS_BLOCK_SIZE + VIS_BLOCK_SIZE / 2;
      const x = VIS_BORDER + col * VIS_BLOCK_SIZE + VIS_BLOCK_SIZE / 2;
      
      const idx = (Math.floor(y) * watermark_w + Math.floor(x)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      const brightness = (r + g + b) / 3;
      const bit = brightness > 128 ? 1 : 0;  // Threshold
      bits.push(bit);
    }

    // Check marker (first 8 bits)
    let marker = 0;
    for (let i = 0; i < 8; i++) {
      marker = (marker << 1) | bits[i];
    }

    if (marker !== MARKER_BYTE) {
      console.log(`[SAI] Visible watermark marker mismatch: 0x${marker.toString(16)} (expected 0x${MARKER_BYTE.toString(16)})`);
      return null;
    }

    // Extract ID (next 24 bits)
    let id24 = 0;
    for (let i = 8; i < 32; i++) {
      id24 = (id24 << 1) | bits[i];
    }

    console.log("[SAI] ✓ Visible watermark detected. Image ID =", id24);
    return id24;

  } catch (err) {
    console.warn("[SAI] Failed to extract visible watermark:", err);
    return null;
  }
}


// ===============================
// 4B. Extract ID from DCT patch (fallback)
// ===============================
async function extractImageIdFromDct(img) {
  try {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width < PATCH_SIZE || height < PATCH_SIZE) return null;

    const resp = await fetch(img.src);  // Removed { mode: "cors" } for Facebook compatibility
    if (!resp.ok) {
      console.warn("[SAI] Failed to fetch image:", resp.status);
      return null;
    }
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = makeCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    const imgData = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE);
    const data = imgData.data;

    // Build grayscale matrix
    const M = Array.from({ length: PATCH_SIZE }, () => new Array(PATCH_SIZE).fill(0));
    let idx = 0;
    for (let y = 0; y < PATCH_SIZE; y++) {
      for (let x = 0; x < PATCH_SIZE; x++) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        M[y][x] = gray;
        idx += 4;
      }
    }

    const D = dct2D(M);

    // Decode 32 bits from coefficient pairs
    const bits = [];
    for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
      const [[u1, v1], [u2, v2]] = BIT_PAIRS[bitIndex];
      const c1 = D[u1][v1];
      const c2 = D[u2][v2];
      const diff = c1 - c2;
      const bit = diff >= 0 ? 1 : 0;
      bits.push(bit);
    }

    // Check marker prefix bits[0..7]
    let marker = 0;
    for (let i = 0; i < 8; i++) {
      marker = (marker << 1) | bits[i];
    }
    if (marker !== MARKER_BYTE) {
      // Not our image
      return null;
    }

    // Remaining 24 bits => image ID
    let id24 = 0;
    for (let i = 8; i < 32; i++) {
      id24 = (id24 << 1) | bits[i];
    }

    console.log("[SAI] DCT marker OK. Image ID =", id24);
    return id24;

  } catch (err) {
    console.warn("[SAI] Failed to extract DCT ID:", err);
    return null;
  }
}


// ===============================
// 5. SCRAMBLE decode using server-sourced scrambled image
// ===============================
async function descrambleFromServer(img, imageId) {
  try {
    const targetW = img.naturalWidth;
    const targetH = img.naturalHeight;

    // 1) Fetch clean scrambled image from server
    const url = `${SERVER_BASE}/image/${imageId}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("[SAI] Failed to fetch server image:", resp.status, resp.statusText);
      return;
    }
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    // 2) Scale server image to Facebook displayed size
    const scaledCanvas = makeCanvas(targetW, targetH);
    const scaledCtx = scaledCanvas.getContext("2d");
    scaledCtx.drawImage(bitmap, 0, 0, targetW, targetH);

    // 3) Unscramble on scaled version
    const outCanvas = makeCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext("2d");

    const blockSize = targetW / BLOCKS;

    for (let originalIndex = 0; originalIndex < BLOCK_ORDER.length; originalIndex++) {
      const scrambledIndex = BLOCK_ORDER[originalIndex];

      const srcY = Math.floor(scrambledIndex / BLOCKS);
      const srcX = scrambledIndex % BLOCKS;

      const dstY = Math.floor(originalIndex / BLOCKS);
      const dstX = originalIndex % BLOCKS;

      outCtx.drawImage(
        scaledCanvas,
        srcX * blockSize, srcY * blockSize, blockSize, blockSize,
        dstX * blockSize, dstY * blockSize, blockSize, blockSize
      );
    }

    const finalURL =
      outCanvas.convertToBlob
        ? URL.createObjectURL(await outCanvas.convertToBlob())
        : outCanvas.toDataURL("image/jpeg");

    img.src = finalURL;
    img.dataset.unscrambled = "true";
    console.log("[SAI] Decoded (scaled) from server image ID", imageId);

  } catch (err) {
    console.error("[SAI] descrambleFromServer failed:", err);
  }
}


// ===============================
// 6. PROCESS IMAGE
// ===============================
async function processImage(img) {
  try {
    if (!img || img.dataset.unscrambled === "true") return;
    if (!img.src) return;

    console.log("[SAI] Checking image:", img.src.substring(0, 100));

    // Try visible watermark first (survives Facebook processing)
    let imageId = await extractImageIdFromVisibleWatermark(img);
    
    // Fall back to DCT watermark
    if (imageId == null) {
      imageId = await extractImageIdFromDct(img);
    }
    
    if (imageId == null) {
      console.log("[SAI] No protected marker found in this image");
      return;
    }

    console.log("[SAI] ✓ Protected image detected, ID =", imageId);
    console.log("[SAI] Image source:", img.src);
    await descrambleFromServer(img, imageId);

  } catch (err) {
    console.error("[SAI] processImage failed:", err);
  }
}


// ===============================
// 7. Initial scan + MutationObserver
// ===============================
console.log("[SAI] 🔍 Protected Image Unscrambler extension loaded");

function scanAllImages() {
  const imgs = document.querySelectorAll("img");
  console.log(`[SAI] Scanning ${imgs.length} images on page`);
  imgs.forEach((img) => processImage(img));
}

scanAllImages();

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.tagName === "IMG") {
        processImage(node);
      } else if (node.querySelectorAll) {
        node.querySelectorAll("img").forEach((img) => processImage(img));
      }
    }
  }
});

observer.observe(document.documentElement || document.body, {
  childList: true,
  subtree: true,
});
