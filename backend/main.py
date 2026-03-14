import io
import os
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel
from supabase import create_client

from auth import get_current_user, security
from db import get_or_create_user_key, save_image, get_image_owner, has_permission, grant_permission, get_user_id_by_email
from scramble import decode_image, protect_image, key_to_seed

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

    # Get (or create) this user's Fernet key
    fernet_key = get_or_create_user_key(user_id)

    try:
        clean_bytes, social_bytes, image_id = protect_image(image_bytes, fernet_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Record image in DB
    save_image(image_id, user_id)

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
@app.post("/api/decode")
async def decode(
    file: UploadFile = File(...),
    image_id: int = Form(...),
    user=Depends(get_current_user),
):
    """
    Descramble a protected image.
    Requires image_id to look up the owner's Fernet key.
    Viewer must be the owner OR have been granted permission.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    viewer_id = str(user.id)

    # Look up who owns this image
    owner_id = get_image_owner(image_id)
    if owner_id is None:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check permission
    if viewer_id != owner_id and not has_permission(owner_id, viewer_id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Always use the OWNER's Fernet key to decode
    fernet_key = get_or_create_user_key(owner_id)
    image_bytes = await file.read()

    try:
        decoded_bytes = decode_image(image_bytes, fernet_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        io.BytesIO(decoded_bytes),
        media_type="image/jpeg",
        headers={"Content-Disposition": "attachment; filename=decoded.jpg"},
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

    fernet_key = get_or_create_user_key(owner_id)
    seed = key_to_seed(fernet_key)

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
