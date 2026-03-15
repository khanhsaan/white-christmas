import os
from typing import Optional

from fastapi import HTTPException, Query, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

security          = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    FastAPI dependency — verifies the Supabase JWT from the Authorization header.
    Works with Swagger's Authorize button (no manual header field needed).

    Usage:
        @app.post("/api/protect")
        async def protect(user=Depends(get_current_user)):
            user_id = str(user.id)
    """
    token = credentials.credentials

    try:
        client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_ANON_KEY"),
        )
        response = client.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return response.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user_flex(
    token: Optional[str] = Query(default=None),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_optional),
):
    """
    Like get_current_user, but also accepts the JWT via ?token= query param.
    Used for endpoints where the browser loads the resource directly as an img src,
    so the plugin can detect and decode it (blob: URLs are skipped by the plugin).
    """
    jwt = (credentials.credentials if credentials else None) or token
    if not jwt:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_ANON_KEY"),
        )
        response = client.auth.get_user(jwt)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return response.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_optional),
):
    """Like get_current_user, but allows unauthenticated requests when no token is sent."""
    if not credentials:
        return None
    try:
        client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_ANON_KEY"),
        )
        response = client.auth.get_user(credentials.credentials)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return response.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
