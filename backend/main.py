import io
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

from scramble import decode_image, protect_image

load_dotenv()

app = FastAPI(title="White Christmas API")

# Allow requests from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Image-ID"],
    expose_headers=["X-Image-ID"],
)


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/protect")
async def protect(
    file: UploadFile = File(...),
    user_key: str = Form(...),
    version: str = Form("clean"),  # "clean" or "social"
):
    """
    Protect an image by scrambling it.

    version="clean"  → no visible watermark (use this for decoding later)
    version="social" → adds visible watermark (post this to social media for extension detection)
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()

    try:
        clean_bytes, social_bytes, image_id = protect_image(image_bytes, user_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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


@app.post("/api/decode")
async def decode(
    file: UploadFile = File(...),
    user_key: str = Form(...),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()

    try:
        decoded_bytes = decode_image(image_bytes, user_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        io.BytesIO(decoded_bytes),
        media_type="image/jpeg",
        headers={
            "Content-Disposition": "attachment; filename=decoded.jpg",
        },
    )
