import hashlib
import hmac
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from cryptography.fernet import Fernet, InvalidToken
from fastapi import FastAPI, HTTPException, Path as FPath, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

# ================================
# CONFIG
# ================================

# Resolve directories: env var -> project-relative defaults
_project_root = Path(__file__).parent.parent
_backend_dir = Path(__file__).parent
IMAGES_DIR = Path(os.getenv("IMAGES_DIR", _project_root / "Server" / "images"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", _backend_dir / "output"))
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "5001"))

# Legacy fallback for images not yet provisioned with SK metadata
ALLOW_LEGACY_UNSCRAMBLE = os.getenv("ALLOW_LEGACY_UNSCRAMBLE", "true").lower() == "true"
LEGACY_SCRAMBLE_SEED = 435681395  # SHA-256("demo-key-123") % 2^32

MAX_IMAGE_ID = 0xFFFFFF  # 24-bit ID space

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")
log = logging.getLogger("scramble-server")

IMAGES_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ================================
# IN-MEMORY DEMO STORE (replace with DB later)
# ================================

@dataclass
class UserRecord:
    master_key: bytes  # Fernet key bytes


@dataclass
class ImageRecord:
    owner_id: str
    encrypted_sub_key: bytes
    allowed_viewers: set[str]


USERS: dict[str, UserRecord] = {}
IMAGE_ACCESS: dict[int, ImageRecord] = {}


# ================================
# REQUEST / RESPONSE MODELS
# ================================

class CreateUserRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)


class CreateUserResponse(BaseModel):
    user_id: str
    master_key: str


class ProvisionImageRequest(BaseModel):
    owner_id: str = Field(min_length=1, max_length=128)
    allowed_viewers: list[str] = Field(default_factory=list)


class ProvisionImageResponse(BaseModel):
    image_id: int
    owner_id: str
    allowed_viewers: list[str]
    sub_key_encrypted: str
    scramble_seed: int


# ================================
# HELPERS
# ================================

ImageId = Annotated[int, FPath(ge=0, le=MAX_IMAGE_ID, description="24-bit image ID")]


def _resolve_image_path(image_id: int) -> Path:
    """Resolve and validate that the path stays within IMAGES_DIR."""
    path = (IMAGES_DIR / f"{image_id}.jpg").resolve()
    if not path.is_relative_to(IMAGES_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid image ID")
    return path


def _derive_scramble_seed_from_sk(sub_key: bytes) -> int:
    """Derive deterministic 32-bit scramble seed from decrypted SK."""
    digest = hmac.new(sub_key, b"scramble-seed", hashlib.sha256).digest()
    return int.from_bytes(digest[:4], byteorder="big", signed=False)


# ================================
# APP
# ================================

app = FastAPI(
    title="Protected Image Scramble Server",
    description="Serves scrambled images and per-image scramble seeds for the extension.",
    version="0.3.0",
)

# "*" is intentional for extension fetches.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ================================
# CORE ROUTES
# ================================

@app.get("/health", summary="Server health check")
def health():
    available = sum(1 for f in IMAGES_DIR.glob("*.jpg") if f.stem.isdigit())
    return {
        "status": "ok",
        "images_available": available,
        "users_provisioned": len(USERS),
        "image_access_rows": len(IMAGE_ACCESS),
        "legacy_unscramble_enabled": ALLOW_LEGACY_UNSCRAMBLE,
    }


@app.get(
    "/image/{image_id}",
    summary="Serve the clean scrambled image for the given ID",
    responses={
        200: {"content": {"image/jpeg": {}}},
        404: {"description": "Image not found on server"},
    },
)
def get_image(image_id: ImageId):
    path = _resolve_image_path(image_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    log.info("Serving image %d", image_id)
    return FileResponse(
        path,
        media_type="image/jpeg",
        # Do not cache in dev/demo; image content can change for same image_id
        # while testing different seed strategies.
        headers={"Cache-Control": "no-store"},
    )


@app.get(
    "/unscramble/{image_id}",
    summary="Return per-image scramble seed for an allowed viewer",
    description=(
        "If image is provisioned with MK/SK metadata, viewer_id must be allowed. "
        "If not provisioned, optional legacy fallback seed is returned when enabled."
    ),
)
def get_unscramble_seed(
    image_id: ImageId,
    viewer_id: str | None = Query(default=None, description="Viewer identity for authorization"),
):
    path = _resolve_image_path(image_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    record = IMAGE_ACCESS.get(image_id)

    # New MK/SK mode
    if record is not None:
        if not viewer_id:
            raise HTTPException(status_code=401, detail="viewer_id is required")

        allowed = viewer_id == record.owner_id or viewer_id in record.allowed_viewers
        if not allowed:
            raise HTTPException(status_code=403, detail=f"Viewer '{viewer_id}' is not allowed")

        owner = USERS.get(record.owner_id)
        if owner is None:
            raise HTTPException(status_code=500, detail=f"Owner '{record.owner_id}' has no master key")

        try:
            sub_key = Fernet(owner.master_key).decrypt(record.encrypted_sub_key)
        except InvalidToken as exc:
            raise HTTPException(status_code=500, detail="Failed to decrypt image sub key") from exc

        scramble_seed = _derive_scramble_seed_from_sk(sub_key)
        log.info("Serving Fernet-derived seed for image %d to viewer '%s'", image_id, viewer_id)
        return {
            "image_id": image_id,
            "scramble_seed": scramble_seed,
            "mode": "fernet",
            "owner_id": record.owner_id,
        }

    # Legacy mode for old images not provisioned yet
    if ALLOW_LEGACY_UNSCRAMBLE:
        log.info("Serving legacy seed for image %d", image_id)
        return {
            "image_id": image_id,
            "scramble_seed": LEGACY_SCRAMBLE_SEED,
            "mode": "legacy",
        }

    raise HTTPException(
        status_code=404,
        detail=(
            f"Image {image_id} has no MK/SK metadata provisioned. "
            "Provision it via /demo/provision-image first."
        ),
    )


# ================================
# DEMO MK/SK PROVISIONING ROUTES
# ================================

@app.post("/demo/create-user", response_model=CreateUserResponse, summary="Create a user + Fernet master key")
def demo_create_user(payload: CreateUserRequest):
    if payload.user_id in USERS:
        raise HTTPException(status_code=409, detail=f"User '{payload.user_id}' already exists")

    mk = Fernet.generate_key()
    USERS[payload.user_id] = UserRecord(master_key=mk)
    log.info("Created user '%s' with Fernet MK", payload.user_id)
    return CreateUserResponse(user_id=payload.user_id, master_key=mk.decode("utf-8"))


@app.post(
    "/demo/provision-image/{image_id}",
    response_model=ProvisionImageResponse,
    summary="Create encrypted SK row for image",
)
def demo_provision_image(image_id: ImageId, payload: ProvisionImageRequest):
    path = _resolve_image_path(image_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    owner = USERS.get(payload.owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail=f"Owner '{payload.owner_id}' not found")

    sub_key = Fernet.generate_key()
    encrypted_sub_key = Fernet(owner.master_key).encrypt(sub_key)
    scramble_seed = _derive_scramble_seed_from_sk(sub_key)

    IMAGE_ACCESS[image_id] = ImageRecord(
        owner_id=payload.owner_id,
        encrypted_sub_key=encrypted_sub_key,
        allowed_viewers=set(payload.allowed_viewers),
    )

    log.info(
        "Provisioned image %d for owner '%s' (allowed viewers: %s)",
        image_id,
        payload.owner_id,
        payload.allowed_viewers,
    )

    return ProvisionImageResponse(
        image_id=image_id,
        owner_id=payload.owner_id,
        allowed_viewers=sorted(set(payload.allowed_viewers)),
        sub_key_encrypted=encrypted_sub_key.decode("utf-8"),
        scramble_seed=scramble_seed,
    )


@app.get("/demo/state", summary="Inspect in-memory demo state")
def demo_state():
    return {
        "users": sorted(USERS.keys()),
        "images": {
            str(image_id): {
                "owner_id": row.owner_id,
                "allowed_viewers": sorted(row.allowed_viewers),
            }
            for image_id, row in IMAGE_ACCESS.items()
        },
    }


# ================================
# TEST / PREVIEW ROUTES
# ================================

@app.get(
    "/preview/{filename}",
    summary="Serve a watermarked output image over HTTP for local testing",
    responses={
        200: {"content": {"image/jpeg": {}}},
        404: {"description": "File not found in output directory"},
    },
)
def preview_output(filename: str):
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = (OUTPUT_DIR / filename).resolve()
    if not path.is_relative_to(OUTPUT_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} not found in output/")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/test", response_class=HTMLResponse, summary="Test page — shows all output images")
def test_page():
    files = sorted(OUTPUT_DIR.glob("*.jpg"))
    if not files:
        imgs_html = "<p>No images in <code>Backend/output/</code> yet. Run <code>python main.py original.jpg</code> first.</p>"
    else:
        imgs_html = "\n".join(
            f'<figure>'
            f'<img src="/preview/{f.name}" style="max-width:100%;border:1px solid #ccc">'
            f'<figcaption>{f.name}</figcaption>'
            f'</figure>'
            for f in files
        )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Plugin Test Page</title>
  <style>
    body {{ font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }}
    figure {{ margin: 20px 0; }}
    figcaption {{ font-size: 12px; color: #666; margin-top: 6px; }}
    code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
  </style>
</head>
<body>
  <h2>Plugin Test Page</h2>
  <p>Open DevTools Console (<code>Cmd+Option+J</code>) to see <code>[SAI]</code> logs.</p>
  <p>
    Fernet demo: provision users/images via <code>/docs</code>, then set
    <code>VIEWER_ID</code> in the extension.
  </p>
  {imgs_html}
</body>
</html>"""


# ================================
# ENTRY POINT
# ================================

if __name__ == "__main__":
    import uvicorn

    log.info("Starting scramble server  ->  http://%s:%d", HOST, PORT)
    log.info("Images directory          ->  %s", IMAGES_DIR)
    log.info("Output directory          ->  %s", OUTPUT_DIR)
    log.info("Test page                 ->  http://%s:%d/test", HOST, PORT)
    log.info("Swagger docs              ->  http://%s:%d/docs", HOST, PORT)
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
