from cryptography.fernet import Fernet

from services.supabase_client import get_service_client


def get_or_create_user_key(user_id: str) -> str:
    db = get_service_client()
    result = (
        db.table("user_crypto_keys")
        .select("fernet_key")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["fernet_key"]

    key = Fernet.generate_key().decode()
    db.table("user_crypto_keys").upsert(
        {"user_id": user_id, "fernet_key": key},
        on_conflict="user_id",
    ).execute()
    return key


def save_image_metadata(image_id: int, owner_id: str, encrypted_subkey: str, storage_path: str) -> None:
    db = get_service_client()
    db.table("images").upsert(
        {
            "image_id": image_id,
            "owner_id": owner_id,
            "encrypted_subkey": encrypted_subkey,
            "storage_path": storage_path,
        },
        on_conflict="image_id",
    ).execute()


def get_image_record(image_id: int) -> dict | None:
    db = get_service_client()
    result = (
        db.table("images")
        .select("image_id, owner_id, encrypted_subkey, storage_path")
        .eq("image_id", image_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


def has_permission(owner_id: str, viewer_id: str) -> bool:
    db = get_service_client()
    result = (
        db.table("allowed_users")
        .select("viewer_id")
        .eq("owner_id", owner_id)
        .eq("viewer_id", viewer_id)
        .limit(1)
        .execute()
    )
    return len(result.data) > 0


def grant_permission(owner_id: str, viewer_id: str) -> None:
    db = get_service_client()
    db.table("allowed_users").upsert(
        {
            "owner_id": owner_id,
            "viewer_id": viewer_id,
        },
        on_conflict="owner_id,viewer_id",
    ).execute()


def get_user_id_by_email(email: str) -> str | None:
    """
    Look up a user's UUID by email using Supabase Admin API.
    Handles both object and dict response shapes.
    """
    db = get_service_client()
    response = db.auth.admin.list_users()
    users = []

    if hasattr(response, "users") and response.users is not None:
        users = response.users
    elif isinstance(response, dict):
        users = response.get("users") or response.get("data", {}).get("users") or []

    for user in users:
        user_email = getattr(user, "email", None)
        if user_email is None and isinstance(user, dict):
            user_email = user.get("email")
        if user_email == email:
            user_id = getattr(user, "id", None)
            if user_id is None and isinstance(user, dict):
                user_id = user.get("id")
            return str(user_id) if user_id else None
    return None
