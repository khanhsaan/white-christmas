import os

from services.supabase_client import get_service_client

BUCKET_NAME = os.getenv("SUPABASE_PROTECTED_IMAGES_BUCKET", "protected-images")


def get_storage_path(image_id: int) -> str:
    return f"{image_id}.jpg"


def upload_protected_image(storage_path: str, image_bytes: bytes) -> None:
    db = get_service_client()
    db.storage.from_(BUCKET_NAME).upload(
        storage_path,
        image_bytes,
        {"content-type": "image/jpeg", "upsert": "true"},
    )


def download_protected_image(storage_path: str) -> bytes:
    db = get_service_client()
    return db.storage.from_(BUCKET_NAME).download(storage_path)
