import cv2
import numpy as np
import argparse
import hashlib
import os
import json
import urllib.error
import urllib.request
from pathlib import Path

# ================================
# PATH CONFIG
# ================================
_backend_dir = Path(__file__).parent

# Protected/watermarked images ready to upload to social media
OUTPUT_DIR = _backend_dir / "output"

# Clean scrambled images served by server.py to the browser extension
SERVER_IMAGES_DIR = _backend_dir.parent / "Server" / "images"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SERVER_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

PATCH_SIZE = 16   # for DCT ID embedding
ALPHA = 12.0      # DCT coefficient separation strength
MARKER_BYTE = 0xAC  # 8-bit marker: 1010 1100


# ============================================================
# 1. PRNG + key-to-seed (for block order)
# ============================================================
def mulberry32(seed: int):
    def rng():
        nonlocal seed
        seed = (seed + 0x6D2B79F5) & 0xFFFFFFFF
        t = seed
        t = (t ^ (t >> 15)) * (t | 1)
        t &= 0xFFFFFFFF
        t ^= t + ((t ^ (t >> 7)) * (t | 61))
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rng


def key_to_seed(key: str) -> int:
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % (2**32)


def generate_block_order_from_seed(blocks: int, seed: int):
    num_blocks = blocks * blocks
    rand = mulberry32(seed)
    arr = list(range(num_blocks))

    # Fisher–Yates
    for i in range(num_blocks - 1, 0, -1):
        j = int(rand() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


# ============================================================
# 2. Image loading / resizing
# ============================================================
def load_and_resize(path: str, size: int = 512) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Could not read image: {path}")
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
    return img


# ============================================================
# 3. Scramble (block shuffle)
# ============================================================
def generate_block_order(blocks: int, key: str):
    seed = key_to_seed(key)
    return generate_block_order_from_seed(blocks, seed)


def scramble_image(img: np.ndarray, blocks: int, order: list[int]) -> np.ndarray:
    h, w, _ = img.shape
    block_size = h // blocks

    scrambled = np.zeros_like(img)
    blocks_list = []

    for y in range(blocks):
        for x in range(blocks):
            block = img[
                y * block_size:(y + 1) * block_size,
                x * block_size:(x + 1) * block_size
            ]
            blocks_list.append(block)

    for original_idx, scrambled_idx in enumerate(order):
        block = blocks_list[original_idx]
        dst_y = scrambled_idx // blocks
        dst_x = scrambled_idx % blocks

        scrambled[
            dst_y * block_size:(dst_y + 1) * block_size,
            dst_x * block_size:(dst_x + 1) * block_size
        ] = block

    return scrambled


# ============================================================
# 4. Image ID (24-bit) from SHA-256
# ============================================================
def compute_image_id_24(img: np.ndarray) -> int:
    """
    Compute 24-bit ID from SHA-256 hash of the resized original image bytes.
    """
    success, buf = cv2.imencode(".jpg", img)
    if not success:
        raise RuntimeError("Failed to encode image for hashing")

    h = hashlib.sha256(buf.tobytes()).digest()
    id32 = int.from_bytes(h[:4], byteorder="big", signed=False)
    id24 = id32 & 0xFFFFFF  # keep lower 24 bits
    return id24


def id24_to_bits(id24: int):
    """
    Encode into 32 bits:
      bits[0..7]   = MARKER_BYTE (fixed pattern)
      bits[8..31]  = id24 (MSB first)
    """
    bits = []

    # marker bits
    for i in range(8):
        bit = (MARKER_BYTE >> (7 - i)) & 1
        bits.append(bit)

    # id24 bits
    for i in range(24):
        bit = (id24 >> (23 - i)) & 1
        bits.append(bit)

    assert len(bits) == 32
    return bits


def add_visible_watermark(img: np.ndarray, image_id_24: int) -> np.ndarray:
    """
    Add a visible watermark encoding the image ID in the top-right corner.
    Uses a 8x4 grid of colored blocks (32 bits total: 8-bit marker + 24-bit ID).
    Each block is 8x8 pixels = 64x32 pixel watermark total.
    
    Colors:
    - Bit 0 (black): RGB(20, 20, 20)
    - Bit 1 (white): RGB(235, 235, 235)
    - Border: RGB(180, 180, 180) for visibility
    """
    h, w, _ = img.shape
    result = img.copy()
    
    bits = id24_to_bits(image_id_24)
    
    BLOCK_SIZE = 8  # 8x8 pixels per bit
    COLS = 8  # 8 columns
    ROWS = 4  # 4 rows (32 bits total)
    BORDER = 2  # 2-pixel border
    
    # Colors
    COLOR_0 = np.array([20, 20, 20], dtype=np.uint8)  # Dark
    COLOR_1 = np.array([235, 235, 235], dtype=np.uint8)  # Light  
    COLOR_BORDER = np.array([180, 180, 180], dtype=np.uint8)  # Gray border
    
    # Position: top-right corner with 10px margin
    watermark_w = COLS * BLOCK_SIZE + 2 * BORDER
    watermark_h = ROWS * BLOCK_SIZE + 2 * BORDER
    start_x = w - watermark_w - 10
    start_y = 10
    
    # Draw border
    result[start_y:start_y+watermark_h, start_x:start_x+watermark_w] = COLOR_BORDER
    
    # Draw bits
    for bit_idx, bit_val in enumerate(bits):
        row = bit_idx // COLS
        col = bit_idx % COLS
        
        y1 = start_y + BORDER + row * BLOCK_SIZE
        y2 = y1 + BLOCK_SIZE
        x1 = start_x + BORDER + col * BLOCK_SIZE
        x2 = x1 + BLOCK_SIZE
        
        color = COLOR_1 if bit_val == 1 else COLOR_0
        result[y1:y2, x1:x2] = color
    
    return result


# ============================================================
# 5. DCT bit-pair mapping
# ============================================================
def get_dct_pairs(patch_size: int = PATCH_SIZE):
    """
    Define 32 pairs of DCT coordinates (u1,v1) vs (u2,v2).

    Layout:
      - 4 rows (row=0..3)
      - 8 columns (col=0..7)
      - u = 2 + col
      - v1 = 2 + 2*row
      - v2 = v1 + 1
    So all in 2..9 range (requires patch_size>=10).
    """
    pairs = []
    for bit_index in range(32):
        row = bit_index // 8  # 0..3
        col = bit_index % 8   # 0..7

        u1 = 2 + col
        v1 = 2 + 2 * row
        u2 = u1
        v2 = v1 + 1

        if u1 >= patch_size or v2 >= patch_size:
            raise ValueError("PATCH_SIZE too small for our DCT pairs")

        pairs.append(((u1, v1), (u2, v2)))
    return pairs


# ============================================================
# 6. Embed ID bits into DCT of top-left PATCH_SIZE x PATCH_SIZE
# ============================================================
def embed_dct_id(scrambled_img: np.ndarray, image_id_24: int) -> np.ndarray:
    """
    Embed 32 bits (marker + id24) in DCT of top-left PATCH_SIZE x PATCH_SIZE
    of luminance channel. Effect is visually imperceptible but detectable.
    """
    h, w, _ = scrambled_img.shape
    if h < PATCH_SIZE or w < PATCH_SIZE:
        return scrambled_img

    ycrcb = cv2.cvtColor(scrambled_img, cv2.COLOR_BGR2YCrCb)
    y = ycrcb[:, :, 0].astype(np.float32)

    patch = y[0:PATCH_SIZE, 0:PATCH_SIZE].copy()
    dct = cv2.dct(patch)

    pairs = get_dct_pairs(PATCH_SIZE)
    bits = id24_to_bits(image_id_24)

    for bit_index, bit in enumerate(bits):
        (u1, v1), (u2, v2) = pairs[bit_index]
        c1 = dct[u1, v1]
        c2 = dct[u2, v2]

        # We want:
        # bit=1 => c1 - c2 = +ALPHA
        # bit=0 => c1 - c2 = -ALPHA
        current_diff = c1 - c2
        target_diff = ALPHA if bit == 1 else -ALPHA
        delta = target_diff - current_diff

        # adjust coefficients symmetrically
        dct[u1, v1] = c1 + delta / 2.0
        dct[u2, v2] = c2 - delta / 2.0

    idct = cv2.idct(dct)
    y[0:PATCH_SIZE, 0:PATCH_SIZE] = idct
    y = np.clip(y, 0, 255).astype(np.uint8)
    ycrcb[:, :, 0] = y

    out = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)
    return out


def http_json(method: str, url: str, payload: dict | None = None, allow_statuses: set[int] | None = None):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        if allow_statuses and e.code in allow_statuses:
            body = e.read().decode("utf-8")
            return e.code, json.loads(body) if body else {}
        raise


def resolve_fernet_seed(image_id: int, args) -> int:
    server_base = args.server_base.rstrip("/")

    if args.ensure_owner:
        status, _ = http_json(
            "POST",
            f"{server_base}/demo/create-user",
            {"user_id": args.owner_id},
            allow_statuses={409},
        )
        if status == 201 or status == 200:
            print(f"[FERNET] Created owner user: {args.owner_id}")
        elif status == 409:
            print(f"[FERNET] Owner user already exists: {args.owner_id}")

    payload = {
        "owner_id": args.owner_id,
        "allowed_viewers": args.allowed_viewer,
    }
    status, body = http_json(
        "POST",
        f"{server_base}/demo/provision-image/{image_id}",
        payload,
    )
    if status not in {200, 201}:
        raise RuntimeError(f"Failed to provision image on server (status={status})")
    if "scramble_seed" not in body:
        raise RuntimeError("Server provisioning response missing scramble_seed")
    return int(body["scramble_seed"])


# ============================================================
# 7. MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="Scramble + DCT ID encoder")
    parser.add_argument("input", help="Input image file")
    parser.add_argument("--blocks", type=int, default=32,
                        help="Blocks per side")
    parser.add_argument("--key", type=str, default="demo-key-123",
                        help="Legacy mode key for deterministic block order")
    parser.add_argument("--size", type=int, default=1080,
                        help="Resize square size (use 1080 for FB friendliness)")
    parser.add_argument("--mode", choices=["legacy", "fernet"], default="legacy",
                        help="legacy: derive seed from --key; fernet: get per-image seed from server")
    parser.add_argument("--server-base", type=str, default="http://127.0.0.1:5001",
                        help="Server base URL for Fernet provisioning")
    parser.add_argument("--owner-id", type=str, default="owner-demo",
                        help="Owner user ID for Fernet provisioning mode")
    parser.add_argument("--allowed-viewer", action="append", default=["viewer-demo"],
                        help="Viewer ID allowed to decode this image (repeat flag for multiple viewers)")
    parser.add_argument("--ensure-owner", action="store_true",
                        help="Auto-create owner user if missing in Fernet mode")

    args = parser.parse_args()

    img = load_and_resize(args.input, size=args.size)

    # 1. Compute image ID (24-bit)
    image_id_24 = compute_image_id_24(img)
    print(f"Image ID (24-bit): {image_id_24}")

    # 2. Scramble with deterministic block order
    if args.mode == "fernet":
        scramble_seed = resolve_fernet_seed(image_id_24, args)
        order = generate_block_order_from_seed(args.blocks, scramble_seed)
    else:
        scramble_seed = key_to_seed(args.key)
        order = generate_block_order_from_seed(args.blocks, scramble_seed)

    scrambled_clean = scramble_image(img, args.blocks, order)

    # 3. Save scrambled clean image to server folder (for extension to fetch)
    server_image_path = SERVER_IMAGES_DIR / f"{image_id_24}.jpg"
    cv2.imwrite(str(server_image_path), scrambled_clean)

    # 4. Create upload image: scrambled + DCT ID + visible watermark
    scrambled_marked = embed_dct_id(scrambled_clean.copy(), image_id_24)
    scrambled_marked = add_visible_watermark(scrambled_marked, image_id_24)

    base_name = os.path.splitext(os.path.basename(args.input))[0]
    upload_path = OUTPUT_DIR / f"{base_name}_protected_scramble_fb.jpg"
    cv2.imwrite(str(upload_path), scrambled_marked, [cv2.IMWRITE_JPEG_QUALITY, 95])

    print("===========================================")
    print(" Scramble + DCT + Visible Watermark complete")
    print(f"  - Upload this to FB:  {upload_path}")
    print(f"  - Server scrambled:   {server_image_path}")
    print(f"  - Image ID (24-bit):  {image_id_24}")
    print(f"  - Scramble mode:      {args.mode}")
    print(f"  - Scramble seed:      {scramble_seed}")
    print(f"  - Visible watermark:  top-right corner (8x4 blocks)")
    if args.mode == "fernet":
        print(f"  - Owner ID:           {args.owner_id}")
        print(f"  - Allowed viewers:    {args.allowed_viewer}")
    print("===========================================")
    print("Start the server:  python Backend/server.py")
    print(f"Image endpoint:    http://localhost:5001/image/{image_id_24}")


if __name__ == "__main__":
    main()
