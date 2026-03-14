# Backend System Guide (Supabase-First)

This document is the source of truth for the current backend architecture.

---

## 1) What the system does

The API protects uploaded images, stores protected artifacts in Supabase Storage, and allows only approved viewers to retrieve decode metadata.

End-to-end behavior:

1. Authenticated user uploads an image to `POST /api/protect`.
2. Backend generates a per-image subkey, scrambles the image, and stores:
   - clean scrambled image in Supabase Storage bucket `protected-images`,
   - image metadata (`image_id`, owner, encrypted subkey, storage path) in `public.images`.
3. Extension/client fetches:
   - `GET /api/images/{image_id}/key` for deterministic scramble seed,
   - `GET /api/images/{image_id}/file` for scrambled source bytes.
4. Extension reconstructs the image client-side.

Compatibility:

- `GET /api/decode/{image_id}` is still available temporarily.

---

## 2) Canonical runtime components

### `backend/main.py` (primary FastAPI app)

- Auth endpoints (`/api/auth/signup`, `/api/auth/login`)
- Protect endpoint (`/api/protect`)
- Decode compatibility endpoint (`/api/decode/{image_id}`)
- Key endpoint (`/api/images/{image_id}/key`)
- Scrambled file endpoint (`/api/images/{image_id}/file`)
- Permission grant endpoint (`/api/grant`)

### `backend/services/` (Supabase service layer)

- `supabase_client.py`: singleton Supabase clients (service + auth)
- `image_repo.py`: metadata, permissions, key rows
- `storage_repo.py`: protected image upload/download

### `backend/server.py` (deprecated)

- No longer used for upload/decode flow.
- Keep only as a deprecation pointer to `main.py`.

---

## 3) Security model

Current protection model:

- User-level master key (stored in `public.user_crypto_keys`).
- Per-image generated subkey.
- Subkey encrypted by owner master key and stored in `public.images.encrypted_subkey`.
- Seed derived from decrypted subkey and returned only to authorized viewers.

Authorization:

- Owner always has access.
- Viewers in `public.allowed_users` (`owner_id`, `viewer_id`) are allowed.
- Others receive `403`.

Auth enforcement:

- Protected routes require bearer token validated against Supabase Auth.

---

## 4) Data model (Supabase)

## `public.user_crypto_keys`

- `user_id` (PK, references `auth.users.id`)
- `fernet_key`

## `public.images`

- `image_id` (unique image identifier used by extension)
- `owner_id` (image owner)
- `encrypted_subkey` (encrypted per-image key)
- `storage_path` (object key in storage, e.g. `123456.jpg`)
- legacy-compatible columns may still exist (`user_id`, `image_url`)

## `public.allowed_users`

- `owner_id`
- `viewer_id`
- unique owner/viewer pair
- legacy-compatible `user_id` may still exist

## Supabase Storage

- Bucket: `protected-images` (private)
- Objects: clean scrambled JPEGs, keyed by `storage_path`

---

## 5) API contract

### `POST /api/protect` (auth required)

Form fields:

- `file`: image upload
- `version`: `clean` or `social` (default `clean`)

Returns:

- JPEG stream (`clean` or `social`)
- Header: `X-Image-ID`

### `GET /api/images/{image_id}/key` (auth required)

Returns:

```json
{ "seed": 123456789, "blocks": 32 }
```

Rules:

- owner or allowed viewer only

### `GET /api/images/{image_id}/file` (auth required)

Returns:

- scrambled JPEG source used by extension/client decode

Rules:

- owner or allowed viewer only

### `POST /api/grant` (auth required)

Body:

```json
{ "viewer_email": "viewer@example.com" }
```

Effect:

- grants viewer access to all owner images (current behavior)

### `GET /api/decode/{image_id}` (auth required, temporary compatibility)

- Returns decoded image bytes server-side.
- Retained during migration; extension should prefer key + file endpoints.

---

## 6) Local runbook

Install:

```bash
cd backend
python3 -m pip install -r requirements.txt
```

Run API:

```bash
cd backend
python3 -m uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd WC_Web/white-christmas
npm run dev
```

Set frontend env:

- `NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8000`

Required backend env:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- optional: `SUPABASE_PROTECTED_IMAGES_BUCKET` (defaults to `protected-images`)

---

## 7) Operational notes

- Keep seed derivation logic identical across backend and extension.
- Keep one API entrypoint (`main.py`) to avoid architecture drift.
- `db.py` is not part of the canonical runtime path.
# Backend System Guide

This file is the source of truth for how the current `Backend/` pipeline works.

---

## 1) What the system does

The system protects images for public upload and lets approved viewers decode them in-browser.

End-to-end behavior:

1. `main.py` generates:
   - a public protected image (scrambled + watermark)
   - a server-side scrambled image (`Server/images/<image_id>.jpg`)
2. `server.py` serves decode material:
   - scrambled image by `image_id`
   - scramble seed from either Fernet MK/SK flow or legacy fallback
3. `contentScript.js` detects watermarked images, fetches decode material, and reconstructs the image locally.

Important: decode happens in the extension, not on the server.

---

## 2) Components and responsibilities

### `Backend/main.py` (encoder)

- Loads and resizes input image
- Computes 24-bit `image_id` from original bytes
- Supports two modes:
  - `legacy`: seed from fixed key (`demo-key-123`)
  - `fernet`: seed returned by server from MK/SK flow
- Scrambles image with deterministic block order
- Adds DCT + visible watermark
- Writes:
  - `Backend/output/<name>_protected_scramble_fb.jpg`
  - `Server/images/<image_id>.jpg`

### `Backend/server.py` (API + auth + demo state)

- Serves scrambled source image: `GET /image/{image_id}`
- Serves scramble seed: `GET /unscramble/{image_id}?viewer_id=...`
- Fernet demo endpoints:
  - `POST /demo/create-user`
  - `POST /demo/provision-image/{image_id}`
  - `GET /demo/state`
- Local testing pages:
  - `GET /preview/{filename}`
  - `GET /test`
  - `GET /health`

### `Backend/image-unscrambler-extension/contentScript.js` (decoder)

- Watches `<img>` elements in DOM
- Extracts watermark ID (visible first, DCT fallback)
- Requests per-image seed from server
- Generates per-image block order
- Fetches scrambled server image
- Reconstructs image on canvas and swaps `img.src`

---

## 3) Current seed architecture (implemented)

## A. Fernet mode (active implementation)

1. User has a Fernet Master Key (MK).
2. Each image has a generated Sub Key (SK).
3. SK is encrypted with MK and stored in server state (demo: in-memory).
4. `/unscramble/{image_id}`:
   - authorizes `viewer_id`
   - decrypts SK with owner MK
   - derives `scramble_seed = HMAC(SK, "scramble-seed")[:4]`
   - returns seed to extension
5. Extension decodes using this seed.

## B. Legacy fallback (for backwards compatibility)

- If an image has not been provisioned via Fernet endpoints:
  - server can return fixed legacy seed (`ALLOW_LEGACY_UNSCRAMBLE=true`)
- Used to avoid breaking older test images.

---

## 4) API contract (important)

### `GET /image/{image_id}`

- Returns scrambled clean JPEG
- Used by extension as decode source
- Dev cache policy is `no-store` to avoid stale image/seed mismatch

### `GET /unscramble/{image_id}?viewer_id=<id>`

Responses:

- Fernet image:
  - `{ "image_id": ..., "scramble_seed": ..., "mode": "fernet", "owner_id": ... }`
- Legacy fallback image:
  - `{ "image_id": ..., "scramble_seed": ..., "mode": "legacy" }`

Error cases:

- `401` if `viewer_id` missing for Fernet provisioned image
- `403` if viewer is not allowed
- `404` if image not found or not provisioned (with legacy disabled)

### `POST /demo/create-user`

Body:

```json
{ "user_id": "alice" }
```

Returns generated Fernet MK.

### `POST /demo/provision-image/{image_id}`

Body:

```json
{ "owner_id": "alice", "allowed_viewers": ["viewer-demo"] }
```

Creates encrypted SK row and returns derived `scramble_seed`.

---

## 5) Encoding workflows

## Legacy mode

```bash
cd Backend
source venv/bin/activate
python main.py original.jpg --mode legacy --key demo-key-123
```

## Fernet mode (recommended now)

```bash
cd Backend
source venv/bin/activate
python main.py original.jpg \
  --mode fernet \
  --server-base http://127.0.0.1:5001 \
  --owner-id alice \
  --allowed-viewer viewer-demo \
  --ensure-owner
```

What this does:

- auto-creates owner if needed (`--ensure-owner`)
- provisions image metadata on server
- obtains Fernet-derived seed
- scrambles with that same seed

This guarantees encoder seed == decoder seed.

---

## 6) Browser extension configuration

In `contentScript.js`:

- `SERVER_BASE` must point to your API
- `VIEWER_ID` must be an allowed viewer for Fernet-provisioned images

Example:

```js
const SERVER_BASE = "http://localhost:5001";
const VIEWER_ID = "viewer-demo";
```

After changes:

1. Reload extension on `chrome://extensions`
2. Hard refresh target page (`Cmd+Shift+R`)

---

## 7) Local test runbook

1. Start server:

```bash
cd Backend
source venv/bin/activate
python server.py
```

2. Generate protected image in Fernet mode (command above).

3. Open:

- `http://127.0.0.1:5001/test`

4. DevTools Console should show:

- `[SAI] Protected Image Unscrambler loaded`
- `[SAI] ✓ Protected image detected — ID: ...`
- `[SAI] Seed mode=fernet image=...`
- `[SAI] ✓ Descrambled image ID ...`

---

## 8) Decision record

### Why decode in extension?

- Server never sends original clear image directly.
- Client performs reconstruction from scrambled source + seed.

### Why keep both visible + DCT watermark?

- Visible marker survives social network recompression better.
- DCT remains fallback path.

### Why `no-store` cache policy in dev?

- During rapid reprovisioning, same `image_id` may point to updated server content.
- Aggressive browser cache can produce stale image with fresh seed and break decode.

### Why keep legacy mode?

- Non-breaking migration path while moving existing images to MK/SK provisioning.

---

## 9) Known pitfalls and fixes

## Symptom: "Decoded" log appears, image still scrambled

Likely causes:

- Seed mismatch (image encoded with one seed, decoded with another)
- stale cached `/image/{id}` with fresh `/unscramble/{id}`

Fix:

- regenerate image in Fernet mode
- keep cache-busting/no-store behavior
- hard refresh page and reload extension

## Symptom: `ERR_BLOCKED_BY_CLIENT` on Facebook

Cause:

- privacy blocker/shields blocked request to localhost

Fix:

- disable blocker for test OR use real HTTPS backend domain

## Symptom: `fetch(file://...)` blocked

Cause:

- browser forbids content-script fetch from `file://`

Fix:

- test via `http://127.0.0.1:5001/test` (served over HTTP)

---

## 10) Security status

### Implemented now

- Fernet MK/SK logic in server (demo in-memory)
- Viewer authorization gate for `unscramble` endpoint
- Per-image seed derivation from decrypted SK

### Not production-ready yet

- in-memory store is volatile (lost on restart)
- `viewer_id` query param is not strong auth

### Next production steps

1. Replace in-memory state with SQLite/Postgres.
2. Replace `viewer_id` with signed auth token/JWT.
3. Add rate limiting + audit logs for `unscramble`.
4. Rotate and securely manage MK in secret storage/KMS.

---

## 11) Canonical directories

- Protected outputs: `Backend/output/`
- Scrambled server images: `Server/images/`
- Extension code: `Backend/image-unscrambler-extension/`

---

## 12) Quick commands

```bash
# install runtime deps
cd Backend
source venv/bin/activate
pip install -r requirements.txt

# start server
python server.py

# generate Fernet-aligned protected image
python main.py original.jpg --mode fernet --owner-id alice --allowed-viewer viewer-demo --ensure-owner

# open test page
open http://127.0.0.1:5001/test
```
# Backend Workflow and Decision Guide

This document is the source of truth for how the current `Backend/` pipeline works, why it was designed this way, and how to evolve it safely.

## 1) What this system does

The system protects an image for public upload while allowing approved viewers to reconstruct it in-browser.

At a high level:

1. `main.py` creates two artifacts from one input image:
   - A **public upload image**: scrambled + watermark(s)
   - A **server image**: scrambled clean copy (no watermark)
2. `server.py` serves the server image by ID and returns scramble metadata.
3. The Chrome extension detects protected images, gets the ID, fetches the scrambled server image, and decodes locally.

Important: the server does **not** return the original clear photo. Decode happens in the extension.

---

## 2) Components and responsibilities

### `main.py` (encoder)

Responsibilities:

- Load and resize input image
- Compute deterministic 24-bit image ID
- Generate deterministic block shuffle order
- Create scrambled clean image (for server)
- Embed marker + ID in DCT patch
- Add visible watermark (8x4 bit grid)
- Write output files

Outputs:

- `Backend/output/<name>_protected_scramble_fb.jpg` (public upload artifact)
- `Server/images/<image_id>.jpg` (scrambled clean artifact)

### `server.py` (API + local test serving)

Responsibilities:

- Serve `Server/images/<id>.jpg` via `/image/{image_id}`
- Return scramble seed via `/unscramble/{image_id}`
- Serve local preview images via `/preview/{filename}`
- Provide `/test` page for plugin validation
- Provide `/health`

### `image-unscrambler-extension/contentScript.js` (decoder)

Responsibilities:

- Scan `<img>` tags on initial load + DOM mutations
- Detect protected images from watermark marker (visible first, DCT fallback)
- Extract image ID
- Fetch server scrambled image
- Apply inverse block mapping on canvas
- Replace DOM image source with decoded output

---

## 3) End-to-end workflow

## A. Content owner flow (encoding + publish)

1. Run encoder:

```bash
cd Backend
source venv/bin/activate
python main.py original.jpg
```

2. Resulting artifacts:
   - Upload this to social media:
     - `Backend/output/original_protected_scramble_fb.jpg`
   - Kept on server for approved decoding:
     - `Server/images/<image_id>.jpg`

3. Publish only the protected upload image.

## B. Viewer flow (decode in browser)

1. Viewer loads a page with protected image.
2. Extension reads watermark marker + ID.
3. Extension requests server image by ID.
4. Extension decodes block permutation in-browser.
5. User sees decoded image.

No original clear image is downloaded from backend.

---

## 4) Data model (current)

Current implementation is filesystem-backed (no DB dependency yet).

- Key identifier: `image_id` (24-bit integer)
- Mapping:
  - Public image contains marker + ID
  - Server file path is `Server/images/<image_id>.jpg`

Current seed model:

- Global default seed is used by encoder and decoder.
- `/unscramble/{image_id}` currently returns this default seed.

---

## 5) Decision log and rationale

### Decision 1: Two image artifacts (public + server)

- **Chosen**: Keep a watermarked public artifact and a clean scrambled server artifact.
- **Why**: Watermark survives social media processing; clean server artifact avoids recompression artifacts during decode.

### Decision 2: Decode in extension, not server

- **Chosen**: Client-side decode in content script.
- **Why**:
  - Avoid serving original image directly
  - Keep reconstruction logic under viewer-control path
  - Reduce server complexity for image transformation per request

### Decision 3: Visible watermark + DCT watermark

- **Chosen**: Visible watermark as primary, DCT as fallback.
- **Why**: Visible watermark is robust after social network recompression; DCT can degrade depending on processing.

### Decision 4: Deterministic block shuffle

- **Chosen**: Deterministic PRNG (`mulberry32`) and fixed block count.
- **Why**: Decoder can reconstruct exact permutation without storing a per-image map in files.

### Decision 5: FastAPI for backend service

- **Chosen**: `FastAPI` + `uvicorn`.
- **Why**: Type-safe routes, clear OpenAPI docs, straightforward local serving/test routes.

### Decision 6: `Backend/` as source of truth

- **Chosen**: Backend owns encode/server/plugin references and local test page.
- **Why**: One canonical pipeline avoids Frontend/Backend divergence.

---

## 6) Operational runbook

## Start server

```bash
cd Backend
source venv/bin/activate
python server.py
```

Check:

- `http://127.0.0.1:5001/health`
- `http://127.0.0.1:5001/test`

## Load Chrome extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked from `Backend/image-unscrambler-extension`
4. Enable “Allow access to file URLs” (only needed for direct file tests)

## Generate new protected image

```bash
cd Backend
source venv/bin/activate
python main.py original.jpg
```

Then open:

- `http://127.0.0.1:5001/test`

Watch DevTools console for `[SAI]` logs.

---

## 7) Testing checklist

## Functional

- [ ] `/health` returns `status: ok`
- [ ] `/test` lists output images
- [ ] Extension logs “Protected image detected”
- [ ] Extension logs “Descrambled image ID ...”
- [ ] Decoded image is visually correct

## Consistency

- [ ] `main.py` and extension use same marker byte
- [ ] `main.py` and extension use compatible block sizing
- [ ] `/image/{id}` exists for every protected upload generated

## Regression checks

- [ ] No CORS issues on `http://localhost:5001/*`
- [ ] No double-processing of same image element
- [ ] No growing blob-URL memory leak during long scroll sessions

---

## 8) Known failure modes and troubleshooting

### Symptom: image stays scrambled

Likely causes:

- Wrong block geometry mismatch (float/integer drift)
- Wrong seed mismatch between encoder/decoder
- Server file for ID missing or stale

Checks:

- Verify extension logs image ID
- Verify `Server/images/<id>.jpg` exists
- Verify `/image/<id>` returns 200

### Symptom: fetch blocked on `file://`

Cause:

- Browser blocks `fetch(file://...)` from content scripts.

Fix:

- Test via `http://127.0.0.1:5001/test` instead of opening local file path directly.

### Symptom: marker not detected

Causes:

- Watermark cropped/recompressed too aggressively
- Wrong marker byte or bit extraction thresholds

Fixes:

- Check visible watermark extraction first
- Re-run with fresh protected artifact from `main.py`

---

## 9) Security model (current state)

Current system protects against casual scraping but is not yet full cryptographic authorization.

Current protections:

- Public image is scrambled
- Reconstruction requires algorithm + server image access

Current gap:

- `/unscramble/{id}` currently returns a default global seed

Planned hardening:

- Per-user Master Key (MK)
- Per-image Sub Key (SK)
- Store only encrypted SK
- Derive per-image scramble seed from SK
- Authorize viewer before returning decode metadata

---

## 10) Planned MK/SK architecture (next stage)

Target flow:

1. On account creation: generate MK
2. On upload: generate SK per image
3. Encrypt SK with MK and store encrypted SK
4. Derive image ID and scramble seed from SK (deterministic KDF/HMAC labels)
5. Extension requests `/unscramble/{id}` with viewer auth
6. Server validates viewer, decrypts SK, derives seed, returns temporary decode metadata

Design principle:

- No extra random DB column is required if image ID + seed are derived from SK with stable labels.

---

## 11) Canonical directories

- Protected upload output: `Backend/output/`
- Server decode source images: `Server/images/`
- Extension code: `Backend/image-unscrambler-extension/`

These paths should remain canonical unless intentionally migrated.

---

## 12) Quick command reference

```bash
# install minimal runtime
cd Backend
source venv/bin/activate
pip install -r requirements.txt

# generate protected pair
python main.py original.jpg

# run server
python server.py

# test page
open http://127.0.0.1:5001/test
```

