"""Runtime configuration, read once from the environment.

The Claude API key is server-side only (ADR 0005): it is read here from the
environment (loaded from a gitignored ``.env`` in development) and never leaves
the backend.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str
    model: str
    env: str
    shared_secret: str
    # Dev-only escape hatch (see load_settings): serve unauthenticated loopback requests as
    # a fixed dev user when no Supabase auth is configured. Off unless explicitly opted in.
    allow_dev_fallback: bool
    max_files: int
    max_file_bytes: int
    max_total_bytes: int
    max_field_chars: int
    # v0.5 Phase 4 hardening (ADR 0009). All default to "disabled" (0 / off) so local and
    # dev runs are unaffected; production *requires* them (see check_production_config).
    # Per-caller request ceiling per minute across all /v1/* routes (0 = no limit).
    rate_limit_per_min: int
    # Daily token ceilings for the metered Claude calls (0 = no cap). Token-based (exact from
    # the SDK usage) rather than cost-based, so there is no per-model price table to maintain.
    user_daily_token_cap: int
    global_daily_token_cap: int
    # Honour X-Forwarded-For for the rate-limit IP fallback only when explicitly behind a
    # trusted reverse proxy. Off by default: an untrusted client can spoof the header (H1).
    trust_proxy: bool
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
        # Dev-only: when no Supabase auth is configured, serve loopback requests as a fixed
        # dev user (app/auth.py). OFF by default so a deploy that forgets CRAM_ENV=prod still
        # fails closed — the H1 same-host-reverse-proxy bypass needs this flag to be opt-in.
        # Set CRAM_ALLOW_DEV_FALLBACK=1 only for local work without a Supabase project.
        allow_dev_fallback=os.environ.get("CRAM_ALLOW_DEV_FALLBACK", "").strip().lower()
        in {"1", "true", "yes", "on"},
        max_files=int(os.environ.get("CRAM_MAX_FILES", "20")),
        max_file_bytes=int(os.environ.get("CRAM_MAX_FILE_BYTES", str(32 * 1024 * 1024))),
        max_total_bytes=int(os.environ.get("CRAM_MAX_TOTAL_BYTES", str(32 * 1024 * 1024))),
        # Cap on each free-text form field (subject_name / title / kind), in characters.
        max_field_chars=int(os.environ.get("CRAM_MAX_FIELD_CHARS", "4096")),
        # Phase 4 hardening (ADR 0009). Default off so dev/local is unaffected; prod requires
        # them (check_production_config). A generous 60/min covers an interactive client.
        rate_limit_per_min=int(os.environ.get("CRAM_RATE_LIMIT_PER_MIN", "60")),
        user_daily_token_cap=int(os.environ.get("CRAM_USER_DAILY_TOKEN_CAP", "0")),
        global_daily_token_cap=int(os.environ.get("CRAM_GLOBAL_DAILY_TOKEN_CAP", "0")),
        trust_proxy=os.environ.get("CRAM_TRUSTED_PROXY", "").strip().lower()
        in {"1", "true", "yes", "on"},
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide cached settings — the environment is read exactly once. Call this from
    application code instead of ``load_settings()`` so there is a single source of truth.
    Tests that mutate the environment can reset it with ``get_settings.cache_clear()``."""
    return load_settings()


def check_production_config(settings: Settings) -> None:
    """Fail fast (``RuntimeError``) if a ``CRAM_ENV=prod`` boot is missing required config.

    The whole point of v0.5 Phase 4 is to be safe to deploy publicly, so production refuses
    to start half-configured (the fail-closed posture of ADR 0008, extended in ADR 0009). A
    no-op outside production. Called once at import in ``app/main.py``; pure and side-effect
    free so it is unit-testable with a hand-built ``Settings``.
    """
    if not settings.is_production:
        return

    problems: list[str] = []
    # Auth must be real in prod — the dev loopback fallback fails open behind a same-host
    # reverse proxy (ADR 0007 §2/§3, H1).
    if not settings.auth_configured:
        problems.append(
            "Supabase JWT auth (set SUPABASE_JWKS_URL — preferred — or SUPABASE_JWT_SECRET)"
        )
    if settings.allow_dev_fallback:
        problems.append("CRAM_ALLOW_DEV_FALLBACK must be OFF (it bypasses authentication)")
    # The service is useless / unsafe without these.
    if not settings.anthropic_api_key:
        problems.append("ANTHROPIC_API_KEY")
    if not settings.database_url:
        problems.append("DATABASE_URL")
    # Cost controls are mandatory before a public deploy (the Phase 4 raison d'être): an
    # unmetered public endpoint to a paid LLM is an open wallet.
    if settings.rate_limit_per_min <= 0:
        problems.append("CRAM_RATE_LIMIT_PER_MIN must be > 0")
    if settings.user_daily_token_cap <= 0:
        problems.append("CRAM_USER_DAILY_TOKEN_CAP must be > 0")
    if settings.global_daily_token_cap <= 0:
        problems.append("CRAM_GLOBAL_DAILY_TOKEN_CAP must be > 0")

    if problems:
        raise RuntimeError(
            "CRAM_ENV=prod is missing required configuration:\n  - "
            + "\n  - ".join(problems)
            + "\nSee docs/SETUP.md → Production deploy checklist."
        )
