import os
from supabase import create_client, Client
from cryptography.fernet import Fernet

_client: Client | None = None


def get_db() -> Client:
    """Return a Supabase client using the service key (full DB access)."""
    global _client
    if _client is None:
        _client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_KEY"),
        )
    return _client


def get_or_create_user_key(user_id: str) -> str:
    """
    Return the user's Fernet key from the DB.
    If the user has no profile yet, generate a new key and save it.
    """
    db = get_db()

    result = db.table("profiles").select("fernet_key").eq("id", user_id).execute()

    if result.data and len(result.data) > 0:
        return result.data[0]["fernet_key"]

    # First time — generate a new Fernet key for this user
    key = Fernet.generate_key().decode()
    db.table("profiles").insert({"id": user_id, "fernet_key": key}).execute()
    return key


def save_image(image_id: int, owner_id: str) -> None:
    """Record a protected image in the DB."""
    db = get_db()
    db.table("images").upsert({"image_id": image_id, "owner_id": owner_id}).execute()


def get_image_owner(image_id: int) -> str | None:
    """Return the owner_id for an image, or None if not found."""
    db = get_db()
    result = db.table("images").select("owner_id").eq("image_id", image_id).execute()
    return result.data[0]["owner_id"] if result.data else None


def has_permission(owner_id: str, viewer_id: str) -> bool:
    """Check if viewer_id has been granted access to all of owner_id's images."""
    db = get_db()
    result = (
        db.table("permissions")
        .select("viewer_id")
        .eq("owner_id", owner_id)
        .eq("viewer_id", viewer_id)
        .execute()
    )
    return len(result.data) > 0


def get_user_id_by_email(email: str) -> str | None:
    """Look up a user's UUID by their email address."""
    db = get_db()
    users = db.auth.admin.list_users()
    for user in users:
        if user.email == email:
            return str(user.id)
    return None


def grant_permission(owner_id: str, viewer_id: str) -> None:
    """Grant viewer access to all images owned by owner_id."""
    db = get_db()
    db.table("permissions").upsert({"owner_id": owner_id, "viewer_id": viewer_id}).execute()
