"""
Image scramble/descramble using key-based block shuffling.
Ported from the white-christmas_template main.py.
"""

import cv2
import numpy as np
import hashlib
import io
from cryptography.fernet import Fernet
from PIL import Image, UnidentifiedImageError
from typing import Tuple

PATCH_SIZE = 16
ALPHA = 12.0
MARKER_BYTE = 0xAC  # 8-bit marker: 1010 1100


# ============================================================
# PRNG
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


def generate_subkey() -> str:
    """Generate a new random Fernet key to use as an image subkey."""
    return Fernet.generate_key().decode()


def key_to_seed(key: str) -> int:
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % (2 ** 32)


# ============================================================
# Image loading
# ============================================================
def load_and_resize(image_bytes: bytes, size: int = 512) -> np.ndarray:
    """
    Decode via Pillow first (safer for browser-sourced JPEG variants),
    then convert to OpenCV BGR and resize.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as pil_img:
            pil_rgb = pil_img.convert("RGB")
            rgb = np.array(pil_rgb)
    except UnidentifiedImageError as exc:
        raise ValueError("Could not decode image") from exc
    except Exception as exc:
        raise ValueError("Invalid image file") from exc

    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
    return img


# ============================================================
# Block scramble
# ============================================================
def generate_block_order(blocks: int, key: str) -> list:
    num_blocks = blocks * blocks
    seed = key_to_seed(key)
    rand = mulberry32(seed)
    arr = list(range(num_blocks))
    for i in range(num_blocks - 1, 0, -1):
        j = int(rand() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def scramble_image(img: np.ndarray, blocks: int, order: list) -> np.ndarray:
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
# Image ID (24-bit) + watermark bits
# ============================================================
def compute_image_id_24(img: np.ndarray) -> int:
    success, buf = cv2.imencode(".jpg", img)
    if not success:
        raise RuntimeError("Failed to encode image for hashing")
    h = hashlib.sha256(buf.tobytes()).digest()
    id32 = int.from_bytes(h[:4], byteorder="big", signed=False)
    return id32 & 0xFFFFFF


def id24_to_bits(id24: int) -> list:
    bits = []
    for i in range(8):
        bits.append((MARKER_BYTE >> (7 - i)) & 1)
    for i in range(24):
        bits.append((id24 >> (23 - i)) & 1)
    return bits


# ============================================================
# Visible watermark (top-right corner, 8x4 grid = 32 bits)
# ============================================================
def add_visible_watermark(img: np.ndarray, image_id_24: int) -> np.ndarray:
    h, w, _ = img.shape
    result = img.copy()
    bits = id24_to_bits(image_id_24)

    BLOCK_SIZE = 8
    COLS = 8
    ROWS = 4
    BORDER = 2

    COLOR_0 = np.array([20, 20, 20], dtype=np.uint8)
    COLOR_1 = np.array([235, 235, 235], dtype=np.uint8)
    COLOR_BORDER = np.array([180, 180, 180], dtype=np.uint8)

    watermark_w = COLS * BLOCK_SIZE + 2 * BORDER
    watermark_h = ROWS * BLOCK_SIZE + 2 * BORDER
    start_x = w - watermark_w - 10
    start_y = 10

    result[start_y:start_y + watermark_h, start_x:start_x + watermark_w] = COLOR_BORDER

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
# DCT watermark (invisible, embedded in top-left patch)
# ============================================================
def get_dct_pairs(patch_size: int = PATCH_SIZE) -> list:
    pairs = []
    for bit_index in range(32):
        row = bit_index // 8
        col = bit_index % 8
        u1 = 2 + col
        v1 = 2 + 2 * row
        u2 = u1
        v2 = v1 + 1
        pairs.append(((u1, v1), (u2, v2)))
    return pairs


def embed_dct_id(scrambled_img: np.ndarray, image_id_24: int) -> np.ndarray:
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
        target_diff = ALPHA if bit == 1 else -ALPHA
        delta = target_diff - (c1 - c2)
        dct[u1, v1] = c1 + delta / 2.0
        dct[u2, v2] = c2 - delta / 2.0

    idct = cv2.idct(dct)
    y[0:PATCH_SIZE, 0:PATCH_SIZE] = idct
    y = np.clip(y, 0, 255).astype(np.uint8)
    ycrcb[:, :, 0] = y

    return cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)


# ============================================================
# Descramble (reverse the block shuffle)
# ============================================================
def descramble_image(img: np.ndarray, blocks: int, order: list) -> np.ndarray:
    """
    Reverse the block scramble.
    order[i] = scrambled position of original block i,
    so we read from scrambled[order[i]] and put it back at original position i.
    """
    h, w, _ = img.shape
    block_size = h // blocks

    scrambled_blocks = []
    for y in range(blocks):
        for x in range(blocks):
            block = img[
                y * block_size:(y + 1) * block_size,
                x * block_size:(x + 1) * block_size
            ]
            scrambled_blocks.append(block)

    reconstructed = np.zeros_like(img)
    for original_index, scrambled_index in enumerate(order):
        block = scrambled_blocks[scrambled_index]
        target_y = original_index // blocks
        target_x = original_index % blocks
        reconstructed[
            target_y * block_size:(target_y + 1) * block_size,
            target_x * block_size:(target_x + 1) * block_size
        ] = block

    return reconstructed


def decode_image(
    image_bytes: bytes,
    subkey: str,
    blocks: int = 32,
) -> bytes:
    """
    Descramble a protected image using the original key.

    Returns:
        decoded_jpeg_bytes
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    # Ensure image is square and divisible by blocks
    h, w = img.shape[:2]
    size = min(h, w)
    size = (size // blocks) * blocks
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)

    order = generate_block_order(blocks, subkey)
    decoded = descramble_image(img, blocks, order)

    success, buf = cv2.imencode(".jpg", decoded, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise RuntimeError("Failed to encode decoded image")

    return buf.tobytes()


# ============================================================
# Main entry points
# ============================================================
def protect_image(
    image_bytes: bytes,
    subkey: str,
    blocks: int = 32,
    size: int = 512,
    keep_original_size: bool = True,
) -> Tuple[bytes, bytes, int]:
    """
    Scramble an image with the given subkey.

    Returns:
        (clean_jpeg_bytes, social_jpeg_bytes, image_id_24)

        clean_jpeg_bytes  — no visible watermark, stored in DB for decoding
        social_jpeg_bytes — has visible watermark, returned to user to post on social media
    """
    # Decode once so we can preserve original output dimensions if requested.
    nparr = np.frombuffer(image_bytes, np.uint8)
    original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if original_img is None:
        raise ValueError("Could not decode image")
    original_h, original_w = original_img.shape[:2]

    img = cv2.resize(original_img, (size, size), interpolation=cv2.INTER_AREA)

    image_id_24 = compute_image_id_24(img)

    order = generate_block_order(blocks, subkey)
    scrambled = scramble_image(img, blocks, order)

    # Clean version: only invisible DCT watermark (safe to decode from)
    clean = embed_dct_id(scrambled.copy(), image_id_24)

    if keep_original_size:
        clean = cv2.resize(clean, (original_w, original_h), interpolation=cv2.INTER_LINEAR)

    success, clean_buf = cv2.imencode(".jpg", clean, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise RuntimeError("Failed to encode clean scrambled image")

    # Social version: DCT + visible watermark (for extension detection)
    social = add_visible_watermark(clean.copy(), image_id_24)
    success, social_buf = cv2.imencode(".jpg", social, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise RuntimeError("Failed to encode social scrambled image")

    return clean_buf.tobytes(), social_buf.tobytes(), image_id_24
