from pathlib import Path
import sys
from types import SimpleNamespace

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

import main as api_main  # noqa: E402
from auth import get_current_user, get_optional_user  # noqa: E402
from scramble import generate_subkey, protect_image  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[2]
IMAGE_FIXTURE = PROJECT_ROOT / "original_image.jpg"


def _read_fixture_image_bytes() -> bytes:
    if not IMAGE_FIXTURE.exists():
        raise FileNotFoundError(f"Fixture not found: {IMAGE_FIXTURE}")
    return IMAGE_FIXTURE.read_bytes()


def _post_image(client: TestClient, endpoint: str, version: str = "clean"):
    image_bytes = _read_fixture_image_bytes()
    return client.post(
        endpoint,
        data={"version": version},
        files={"file": ("original_image.jpg", image_bytes, "image/jpeg")},
    )


def test_protect_anonymous_uses_uploaded_image_fixture():
    client = TestClient(api_main.app)
    response = _post_image(client, "/api/protect", version="clean")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert "x-image-id" in response.headers
    assert len(response.content) > 0


def test_protect_authenticated_persists_clean_image(monkeypatch):
    owner = SimpleNamespace(id="owner-user-id")
    captured = {}

    async def _fake_optional_user():
        return owner

    api_main.app.dependency_overrides[get_optional_user] = _fake_optional_user

    master_key = Fernet.generate_key().decode()

    monkeypatch.setattr(api_main, "get_or_create_user_key", lambda _uid: master_key)
    monkeypatch.setattr(api_main, "get_storage_path", lambda image_id: f"{image_id}.jpg")

    def _fake_upload(storage_path, image_bytes):
        captured["storage_path"] = storage_path
        captured["image_size"] = len(image_bytes)

    monkeypatch.setattr(api_main, "upload_protected_image", _fake_upload)

    def _fake_save(image_id, owner_id, encrypted_subkey, storage_path):
        captured["image_id"] = image_id
        captured["owner_id"] = owner_id
        captured["encrypted_subkey"] = encrypted_subkey
        captured["saved_storage_path"] = storage_path

    monkeypatch.setattr(api_main, "save_image_metadata", _fake_save)

    try:
        client = TestClient(api_main.app)
        response = _post_image(client, "/api/protect", version="clean")
        assert response.status_code == 200
        assert captured["owner_id"] == "owner-user-id"
        assert captured["storage_path"] == f'{captured["image_id"]}.jpg'
        assert captured["saved_storage_path"] == captured["storage_path"]
        assert captured["image_size"] > 0
        assert captured["encrypted_subkey"]
    finally:
        api_main.app.dependency_overrides.clear()


def test_decode_owner_roundtrip_with_fixture(monkeypatch):
    owner = SimpleNamespace(id="owner-user-id")

    async def _fake_current_user():
        return owner

    api_main.app.dependency_overrides[get_current_user] = _fake_current_user

    master_key = Fernet.generate_key().decode()
    subkey = generate_subkey()
    encrypted_subkey = Fernet(master_key.encode()).encrypt(subkey.encode()).decode()

    clean_bytes, _, image_id = protect_image(_read_fixture_image_bytes(), subkey)

    monkeypatch.setattr(
        api_main,
        "get_image_record",
        lambda _image_id: {
            "image_id": image_id,
            "owner_id": "owner-user-id",
            "encrypted_subkey": encrypted_subkey,
            "storage_path": f"{image_id}.jpg",
        },
    )
    monkeypatch.setattr(api_main, "has_permission", lambda _o, _v: False)
    monkeypatch.setattr(api_main, "get_or_create_user_key", lambda _uid: master_key)
    monkeypatch.setattr(api_main, "download_protected_image", lambda _path: clean_bytes)

    try:
        client = TestClient(api_main.app)
        response = client.get(f"/api/decode/{image_id}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/jpeg")
        assert "decoded_" in response.headers.get("content-disposition", "")
        assert len(response.content) > 0
    finally:
        api_main.app.dependency_overrides.clear()


def test_get_image_key_forbidden_without_permission(monkeypatch):
    viewer = SimpleNamespace(id="viewer-id")

    async def _fake_current_user():
        return viewer

    api_main.app.dependency_overrides[get_current_user] = _fake_current_user

    master_key = Fernet.generate_key().decode()
    subkey = generate_subkey()
    encrypted_subkey = Fernet(master_key.encode()).encrypt(subkey.encode()).decode()

    monkeypatch.setattr(
        api_main,
        "get_image_record",
        lambda _image_id: {
            "image_id": 1234,
            "owner_id": "owner-id",
            "encrypted_subkey": encrypted_subkey,
            "storage_path": "1234.jpg",
        },
    )
    monkeypatch.setattr(api_main, "has_permission", lambda _o, _v: False)
    monkeypatch.setattr(api_main, "get_or_create_user_key", lambda _uid: master_key)

    try:
        client = TestClient(api_main.app)
        response = client.get("/api/images/1234/key")
        assert response.status_code == 403
        assert response.json()["detail"] == "Access denied"
    finally:
        api_main.app.dependency_overrides.clear()
