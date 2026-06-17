"""Runtime configuration, read once from the environment.

The Claude API key is server-side only (ADR 0005): it is read here from the
environment (loaded from a gitignored ``.env`` in development) and never leaves
the backend.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str
    model: str
    env: str
    shared_secret: str
    max_files: int
    max_file_bytes: int
    max_total_bytes: int
    max_field_chars: int
    # v0.5 persistence + auth (ADR 0007). All optional in Phase 0 so the app boots
    # before the Supabase project exists; the DB health check reports "not_configured".
    database_url: str
    database_direct_url: str
    supabase_url: str
    supabase_jwt_secret: str
    supabase_jwks_url: str
    supabase_service_role_key: str
    supabase_storage_bucket: str

    @property
    def migration_url(self) -> str:
        """Connection string Alembic uses. The direct connection (port 5432) is
        preferred for migrations — the transaction pooler can't run DDL reliably —
        falling back to ``database_url`` when no separate direct URL is set."""
        return self.database_direct_url or self.database_url

    @property
    def auth_configured(self) -> bool:
        """True when Supabase JWT verification is possible (ADR 0007 §2): a JWKS URL
        (asymmetric keys, preferred) or the project JWT secret (HS256). Required in
        production — enforced by the startup guard in main.py."""
        return bool(self.supabase_jwks_url or self.supabase_jwt_secret)

    @property
    def is_production(self) -> bool:
        """True for a deployed config. In production the dev loopback fallback is
        unsafe (it fails open behind a same-host reverse proxy), so configured JWT auth
        is mandatory — enforced at startup in main.py."""
        return self.env in {"prod", "production"}


def load_settings() -> Settings:
    return Settings(
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        model=os.environ.get("CRAM_MODEL", "claude-sonnet-4-6"),
        # Deployment environment. "dev" (default) allows the loopback-only access
        # fallback for local work; "prod"/"production" requires CRAM_SHARED_SECRET.
        env=os.environ.get("CRAM_ENV", "dev").strip().lower(),
        # DEPRECATED (v0.5): the X-Cram-Secret gate is superseded by Supabase JWT auth
        # (ADR 0007 §3, app/auth.py). Still read so existing .env files don't error, but
        # no longer enforced on any endpoint. Safe to remove once no .env sets it.
        shared_secret=os.environ.get("CRAM_SHARED_SECRET", ""),
        max_files=int(os.environ.get("CRAM_MAX_FILES", "20")),
        max_file_bytes=int(os.environ.get("CRAM_MAX_FILE_BYTES", str(32 * 1024 * 1024))),
        max_total_bytes=int(os.environ.get("CRAM_MAX_TOTAL_BYTES", str(32 * 1024 * 1024))),
        # Cap on each free-text form field (subject_name / title / kind), in characters.
        max_field_chars=int(os.environ.get("CRAM_MAX_FIELD_CHARS", "4096")),
        # Supabase Postgres (ADR 0007). DATABASE_URL is the app-runtime connection
        # (transaction pooler, port 6543); DATABASE_DIRECT_URL is the direct connection
        # (port 5432) used by Alembic migrations. Both empty until the project exists.
        database_url=os.environ.get("DATABASE_URL", "").strip(),
        database_direct_url=os.environ.get("DATABASE_DIRECT_URL", "").strip(),
        # Supabase Auth + Storage. JWT is verified against the JWKS URL when set,
        # otherwise the shared JWT secret (Phase 2). Service-role key is server-side only.
        supabase_url=os.environ.get("SUPABASE_URL", "").strip(),
        supabase_jwt_secret=os.environ.get("SUPABASE_JWT_SECRET", ""),
        supabase_jwks_url=os.environ.get("SUPABASE_JWKS_URL", "").strip(),
        supabase_service_role_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_storage_bucket=os.environ.get("SUPABASE_STORAGE_BUCKET", "sources").strip(),
    )
