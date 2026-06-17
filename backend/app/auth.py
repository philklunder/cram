"""Authentication — backend-mediated Supabase JWT verification (ADR 0007 §2).

Clients authenticate with Supabase Auth and send the access-token JWT as
``Authorization: Bearer <jwt>``. This module verifies it — against the Supabase JWKS
endpoint (asymmetric keys) when configured, else the project JWT secret (HS256) — and
yields the current user. Per-row ownership is then enforced in the data layer (Phase 3).

Dev convenience: when no auth is configured (only possible outside production — the prod
startup guard in main.py refuses to boot without it), loopback clients are served as a
fixed dev user so local work needs no Supabase. Non-loopback unauthenticated access is
always refused, preserving the H1 lockout from ADR 0005.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Header, HTTPException, Request

from .config import Settings, load_settings

logger = logging.getLogger(__name__)

_settings = load_settings()

_LOOPBACK = {"127.0.0.1", "::1"}
# Supabase access tokens are issued for the "authenticated" audience.
_AUDIENCE = "authenticated"
# Stable owner id for the dev fallback user (dev-only; see module docstring).
DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None = None
    is_dev_fallback: bool = False


@lru_cache(maxsize=4)
def _jwk_client(jwks_url: str) -> jwt.PyJWKClient:
    """Cached JWKS client so signing keys aren't refetched on every request."""
    return jwt.PyJWKClient(jwks_url)


def _decode(settings: Settings, token: str, key, algorithms: list[str]) -> dict:
    kwargs: dict = {"algorithms": algorithms, "audience": _AUDIENCE}
    if settings.supabase_url:
        # Pin the issuer too when we know the project URL (stricter than aud alone).
        kwargs["issuer"] = settings.supabase_url.rstrip("/") + "/auth/v1"
    return jwt.decode(token, key, **kwargs)


def _verify_token(settings: Settings, token: str) -> CurrentUser:
    try:
        if settings.supabase_jwks_url:
            signing_key = _jwk_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
            claims = _decode(settings, token, signing_key.key, ["RS256", "ES256"])
        elif settings.supabase_jwt_secret:
            claims = _decode(settings, token, settings.supabase_jwt_secret, ["HS256"])
        else:
            # Unreachable in production (startup guard); a misconfiguration in dev.
            raise HTTPException(status_code=500, detail="Server auth is not configured.")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.") from None
    except jwt.InvalidTokenError:
        # Covers bad signature, wrong audience/issuer, malformed token, etc.
        raise HTTPException(status_code=401, detail="Invalid token.") from None

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing subject.")
    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=401, detail="Token subject is not a valid user id."
        ) from None
    return CurrentUser(id=user_id, email=claims.get("email"))


def get_current_user(
    request: Request,
    authorization: str = Header(default=""),
) -> CurrentUser:
    """FastAPI dependency: the authenticated user, or 401.

    Returns the dev fallback user only for loopback requests when auth is unconfigured
    (dev-only — see the module docstring); every other unauthenticated case is refused.
    """
    token = ""
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if _settings.auth_configured:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="Missing bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return _verify_token(_settings, token)

    # No auth configured -> dev only (prod refuses to boot without it). Serve loopback as
    # a fixed dev user; refuse anything else, preserving the non-loopback lockout (H1).
    client_host = request.client.host if request.client else ""
    if client_host in _LOOPBACK:
        logger.warning("Auth not configured; serving loopback request as the dev fallback user.")
        return CurrentUser(id=DEV_USER_ID, is_dev_fallback=True)
    raise HTTPException(
        status_code=401,
        detail="Server auth is not configured; configure Supabase JWT to access remotely.",
    )
