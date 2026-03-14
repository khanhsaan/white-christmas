import io
import os
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel
from supabase import create_client

from cryptography.fernet import Fernet

from auth import get_current_user, security
from db import (
    get_or_create_user_key, save_image, get_image_owner,
    get_encrypted_subkey, upload_image, download_image,
    has_permission, grant_permission, get_user_id_by_email,
)
from scramble import decode_image, protect_image, key_to_seed, generate_subkey

load_dotenv()


def get_auth_client():
    return create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))

app = FastAPI(title="White Christmas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    """Create a new account. Returns access_token to use in Swagger Authorize."""
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

    # Save metadata + encrypted subkey to DB
    save_image(image_id, user_id, encrypted_subkey)

    # Save clean scrambled image to storage (used for decoding later)
    upload_image(image_id, clean_bytes)

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

    owner_id = get_image_owner(image_id)
    if owner_id is None:
        raise HTTPException(status_code=404, detail="Image not found")

    if viewer_id != owner_id and not has_permission(owner_id, viewer_id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Decrypt the image's subkey using the owner's master key
    master_key = get_or_create_user_key(owner_id)
    encrypted_subkey = get_encrypted_subkey(image_id)
    if encrypted_subkey is None:
        raise HTTPException(status_code=404, detail="Image key not found")
    subkey = Fernet(master_key.encode()).decrypt(encrypted_subkey.encode()).decode()

    # Fetch scrambled image from storage
    try:
        image_bytes = download_image(image_id)
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
    owner_id = get_image_owner(image_id)

    if owner_id is None:
        raise HTTPException(status_code=404, detail="Image not found")

    # Owner always has access; others must be in permissions table
    if viewer_id != owner_id and not has_permission(owner_id, viewer_id):
        raise HTTPException(status_code=403, detail="Access denied")

    master_key = get_or_create_user_key(owner_id)
    encrypted_subkey = get_encrypted_subkey(image_id)
    if encrypted_subkey is None:
        raise HTTPException(status_code=404, detail="Image key not found")
    subkey = Fernet(master_key.encode()).decrypt(encrypted_subkey.encode()).decode()
    seed = key_to_seed(subkey)

    return {"seed": seed, "blocks": 32}


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
