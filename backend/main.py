import io

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user
from scramble import decode_image, generate_subkey, key_to_seed, protect_image
from services.image_repo import (
    get_image_record,
    get_or_create_user_key,
    get_user_id_by_email,
    grant_permission,
    has_permission,
    save_image_metadata,
)
from services.storage_repo import (
    download_protected_image,
    get_storage_path,
    upload_protected_image,
)
from services.supabase_client import get_auth_client

load_dotenv()

app = FastAPI(title="White Christmas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Image-ID"],
    expose_headers=["X-Image-ID"],
)


# ============================================================
# Auth — signup / login (returns JWT for use in Swagger)
# ============================================================
class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/api/auth/signup")
def signup(body: AuthRequest):
    """Create a new account and pre-provision cryptographic key material."""
    try:
        client = get_auth_client()
        res = client.auth.sign_up({"email": body.email, "password": body.password})
        if not res.user:
            raise HTTPException(status_code=400, detail="Signup failed")
        # Generate master key immediately on signup
        get_or_create_user_key(str(res.user.id))
        return {
            "user_id": str(res.user.id),
            "email": res.user.email,
            "access_token": res.session.access_token if res.session else None,
            "note": "Copy access_token → click Authorize in Swagger → paste as: Bearer <token>",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/login")
def login(body: AuthRequest):
    """Login with email + password. Returns access_token."""
    try:
        client = get_auth_client()
        res = client.auth.sign_in_with_password({"email": body.email, "password": body.password})
        if not res.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {
            "user_id": str(res.user.id),
            "email": res.user.email,
            "access_token": res.session.access_token,
            "note": "Copy access_token → click Authorize in Swagger → paste as: Bearer <token>",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


# ============================================================
# Health
# ============================================================
@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ============================================================
# Protect — scramble an image using the user's Fernet key
# ============================================================
@app.post("/api/protect")
async def protect(
    file: UploadFile = File(...),
    version: str = Form("clean"),   # "clean" or "social"
    user=Depends(get_current_user),
):
    """
    Protect an image by scrambling it with the user's unique Fernet key.

    version="clean"  → no visible watermark  (use this for decoding)
    version="social" → adds visible watermark (post this on social media)

    Returns the scrambled image as a JPEG download.
    Header X-Image-ID contains the 24-bit image ID embedded in the watermark.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if version not in {"clean", "social"}:
        raise HTTPException(status_code=400, detail="version must be 'clean' or 'social'")

    user_id = str(user.id)
    image_bytes = await file.read()

    # Get (or create) this user's master Fernet key
    master_key = get_or_create_user_key(user_id)

    # Generate a unique subkey for this image
    subkey = generate_subkey()
    encrypted_subkey = Fernet(master_key.encode()).encrypt(subkey.encode()).decode()

    try:
        clean_bytes, social_bytes, image_id = protect_image(image_bytes, subkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Save clean scrambled image to storage + metadata in Supabase
    storage_path = get_storage_path(image_id)
    upload_protected_image(storage_path, clean_bytes)
    save_image_metadata(image_id, user_id, encrypted_subkey, storage_path)

    output = social_bytes if version == "social" else clean_bytes
    filename = f"protected_{image_id}_{'social' if version == 'social' else 'clean'}.jpg"

    return StreamingResponse(
        io.BytesIO(output),
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Image-ID": str(image_id),
        },
    )


# ============================================================
# Decode — descramble using the user's own Fernet key
# ============================================================
@app.get("/api/decode/{image_id}")
async def decode(
    image_id: int,
    user=Depends(get_current_user),
):
    """
    Descramble a protected image by its ID.
    Fetches the scrambled image from storage — no file upload needed.
    Viewer must be the owner OR have been granted permission.
    """
    viewer_id = str(user.id)

    record = get_image_record(image_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Image not found")
    owner_id = record.get("owner_id")
    encrypted_subkey = record.get("encrypted_subkey")
    storage_path = record.get("storage_path")
    if not owner_id or not encrypted_subkey or not storage_path:
        raise HTTPException(status_code=500, detail="Image metadata is incomplete")

    if viewer_id != owner_id and not has_permission(owner_id, viewer_id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Decrypt the image's subkey using the owner's master key
    master_key = get_or_create_user_key(owner_id)
    subkey = Fernet(master_key.encode()).decrypt(encrypted_subkey.encode()).decode()

    # Fetch scrambled image from storage
    try:
        image_bytes = download_protected_image(storage_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Scrambled image not found in storage")

    try:
        decoded_bytes = decode_image(image_bytes, subkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        io.BytesIO(decoded_bytes),
        media_type="image/jpeg",
        headers={"Content-Disposition": f"attachment; filename=decoded_{image_id}.jpg"},
    )


# ============================================================
# Key — extension calls this to get the seed for descrambling
# ============================================================
@app.get("/api/images/{image_id}/key")
async def get_image_key(
    image_id: int,
    user=Depends(get_current_user),
):
    """
    Called by the browser extension.
    Returns the scramble seed if the viewer has permission.
    The seed is used by the extension to regenerate the block order and descramble.
    """
    viewer_id = str(user.id)
    record = get_image_record(image_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Image not found")
    owner_id = record.get("owner_id")
    encrypted_subkey = record.get("encrypted_subkey")
    if not owner_id or not encrypted_subkey:
        raise HTTPException(status_code=500, detail="Image metadata is incomplete")

    # Owner always has access; others must be in permissions table
    if viewer_id != owner_id and not has_permission(owner_id, viewer_id):
        raise HTTPException(status_code=403, detail="Access denied")

    master_key = get_or_create_user_key(owner_id)
    subkey = Fernet(master_key.encode()).decrypt(encrypted_subkey.encode()).decode()
    seed = key_to_seed(subkey)

    return {"seed": seed, "blocks": 32}


@app.get("/api/images/{image_id}/file")
async def get_scrambled_image_file(
    image_id: int,
    user=Depends(get_current_user),
):
    """
    Return the clean scrambled image bytes for extension/client decode.
    Access allowed for owner or explicitly granted viewer.
    """
    viewer_id = str(user.id)
    record = get_image_record(image_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Image not found")

    owner_id = record.get("owner_id")
    storage_path = record.get("storage_path")
    if not owner_id or not storage_path:
        raise HTTPException(status_code=500, detail="Image metadata is incomplete")

    if viewer_id != owner_id and not has_permission(owner_id, viewer_id):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        image_bytes = download_protected_image(storage_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Scrambled image not found in storage")

    filename = f"scrambled_{image_id}.jpg"
    return StreamingResponse(
        io.BytesIO(image_bytes),
        media_type="image/jpeg",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


# ============================================================
# Grant — owner gives a viewer access to decrypt an image
# ============================================================
class GrantRequest(BaseModel):
    viewer_email: str


@app.post("/api/grant")
async def grant_access(
    body: GrantRequest,
    user=Depends(get_current_user),
):
    """
    Grant a viewer permission to decrypt ALL of your images by their email.
    The caller (authenticated user) becomes the owner granting access.
    """
    owner_id = str(user.id)

    viewer_id = get_user_id_by_email(body.viewer_email)
    if viewer_id is None:
        raise HTTPException(status_code=404, detail=f"No user found with email: {body.viewer_email}")

    if viewer_id == owner_id:
        raise HTTPException(status_code=400, detail="Cannot grant access to yourself")

    grant_permission(owner_id, viewer_id)
    return {"status": "granted", "viewer_email": body.viewer_email}
