from cryptography.fernet import Fernet
from typing import Optional

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
    payload = {
        "image_id": image_id,
        "owner_id": owner_id,
        "encrypted_subkey": encrypted_subkey,
        "storage_path": storage_path,
    }
    existing = (
        db.table("images")
        .select("image_id")
        .eq("owner_id", owner_id)
        .eq("image_id", image_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        (
            db.table("images")
            .update(payload)
            .eq("owner_id", owner_id)
            .eq("image_id", image_id)
            .execute()
        )
    else:
        db.table("images").insert(payload).execute()


def get_image_record(image_id: int) -> Optional[dict]:
    db = get_service_client()
    result = (
        db.table("images")
        .select("image_id, owner_id, encrypted_subkey, storage_path")
        .eq("image_id", image_id)
        .order("created_at", desc=True)
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


def get_user_images(user_id: str) -> list[dict]:
    """Return all image records owned by user_id, newest first."""
    db = get_service_client()
    result = (
        db.table("images")
        .select("image_id, storage_path, created_at")
        .eq("owner_id", user_id)
        .order("image_id", desc=True)
        .execute()
    )
    return result.data or []


def get_images_shared_with_user(viewer_id: str) -> list[dict]:
    """
    Return image records owned by users who have granted this viewer access.
    """
    db = get_service_client()
    links = (
        db.table("allowed_users")
        .select("owner_id")
        .eq("viewer_id", viewer_id)
        .execute()
    )
    owner_ids = sorted({row.get("owner_id") for row in (links.data or []) if row.get("owner_id")})
    if not owner_ids:
        return []

    result = (
        db.table("images")
        .select("image_id, owner_id, storage_path, created_at")
        .in_("owner_id", owner_ids)
        .order("image_id", desc=True)
        .execute()
    )
    return result.data or []


def get_user_id_by_email(email: str) -> Optional[str]:
    """Look up a user's UUID by email via a security-definer DB function."""
    target = (email or "").strip()
    if not target:
        return None
    db = get_service_client()
    result = db.rpc("get_user_id_by_email", {"p_email": target}).execute()
    value = result.data
    if not value:
        return None
    # RPC returns the scalar directly or wrapped in a list
    if isinstance(value, list):
        value = value[0] if value else None
    return str(value) if value else None


def get_user_email_by_id(user_id: str) -> Optional[str]:
    """Look up a user's email by UUID via a security-definer DB function."""
    if not user_id:
        return None
    db = get_service_client()
    result = db.rpc("get_user_email_by_id", {"p_user_id": user_id}).execute()
    value = result.data
    if not value:
        return None
    if isinstance(value, list):
        value = value[0] if value else None
    return str(value) if value else None


def create_or_accept_friend_request(requester_id: str, addressee_id: str) -> dict:
    db = get_service_client()

    direct = (
        db.table("friendships")
        .select("id, status")
        .eq("requester_id", requester_id)
        .eq("addressee_id", addressee_id)
        .limit(1)
        .execute()
    )
    if direct.data:
        status = direct.data[0].get("status") or "pending"
        return {"status": status, "auto_accepted": False}

    reverse = (
        db.table("friendships")
        .select("id, status")
        .eq("requester_id", addressee_id)
        .eq("addressee_id", requester_id)
        .limit(1)
        .execute()
    )
    if reverse.data:
        reverse_row = reverse.data[0]
        reverse_status = reverse_row.get("status")
        if reverse_status == "pending":
            (
                db.table("friendships")
                .update({"status": "accepted", "accepted_at": "now()"})
                .eq("id", reverse_row["id"])
                .execute()
            )
            return {"status": "accepted", "auto_accepted": True}
        return {"status": reverse_status or "accepted", "auto_accepted": False}

    db.table("friendships").insert(
        {
            "requester_id": requester_id,
            "addressee_id": addressee_id,
            "status": "pending",
        }
    ).execute()
    return {"status": "pending", "auto_accepted": False}


def decline_friend_request(addressee_id: str, requester_id: str) -> bool:
    db = get_service_client()
    result = (
        db.table("friendships")
        .delete()
        .eq("requester_id", requester_id)
        .eq("addressee_id", addressee_id)
        .eq("status", "pending")
        .execute()
    )
    return len(result.data) > 0


def accept_friend_request(addressee_id: str, requester_id: str) -> bool:
    db = get_service_client()
    existing = (
        db.table("friendships")
        .select("id, status")
        .eq("requester_id", requester_id)
        .eq("addressee_id", addressee_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        return False
    row = existing.data[0]
    if row.get("status") == "accepted":
        return True
    (
        db.table("friendships")
        .update({"status": "accepted", "accepted_at": "now()"})
        .eq("id", row["id"])
        .execute()
    )
    return True


def list_friendships(user_id: str) -> list[dict]:
    db = get_service_client()
    sent = (
        db.table("friendships")
        .select("requester_id, addressee_id, status, created_at, accepted_at")
        .eq("requester_id", user_id)
        .execute()
    )
    received = (
        db.table("friendships")
        .select("requester_id, addressee_id, status, created_at, accepted_at")
        .eq("addressee_id", user_id)
        .execute()
    )
    rows = (sent.data or []) + (received.data or [])
    out: list[dict] = []
    for row in rows:
        requester_id = row.get("requester_id")
        addressee_id = row.get("addressee_id")
        if not requester_id or not addressee_id:
            continue
        is_requester = requester_id == user_id
        friend_id = addressee_id if is_requester else requester_id
        out.append(
            {
                "friend_id": friend_id,
                "friend_email": get_user_email_by_id(friend_id),
                "status": row.get("status") or "pending",
                "direction": "outgoing" if is_requester else "incoming",
                "created_at": row.get("created_at"),
                "accepted_at": row.get("accepted_at"),
            }
        )
    return out
