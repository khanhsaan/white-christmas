import os
from typing import Optional

from supabase import Client, create_client

_service_client: Optional[Client] = None
_auth_client: Optional[Client] = None


def get_service_client() -> Client:
    """Supabase client with service role permissions for backend operations."""
    global _service_client
    if _service_client is None:
        url = os.getenv("SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not service_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        _service_client = create_client(url, service_key)
    return _service_client


def get_auth_client() -> Client:
    """Supabase client with anon key used for auth sign-in/sign-up routes."""
    global _auth_client
    if _auth_client is None:
        url = os.getenv("SUPABASE_URL")
        anon_key = os.getenv("SUPABASE_ANON_KEY")
        if not url or not anon_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
        _auth_client = create_client(url, anon_key)
    return _auth_client
