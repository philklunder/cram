"""Database engine, session factory, and the FastAPI session dependency (ADR 0007).

SQLAlchemy + psycopg (v3) against the Supabase Postgres instance. The app runtime
connects through the transaction pooler (port 6543); Alembic migrations use the
direct connection (port 5432, see ``Settings.migration_url``). The engine here is
**pooler-safe**: server-side prepared statements are disabled, which pgBouncer's
transaction mode does not support.

Phase 0 is tolerant of a missing ``DATABASE_URL``: the engine is simply ``None`` and
``db_status()`` reports ``"not_configured"``, so the service boots and ``/healthz``
works before the Supabase project exists. Models and migrations land in Phase 1.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import Settings, get_settings

# Query params some providers append (Prisma/Supabase) that libpq/psycopg reject as unknown
# connection options. Stripped by normalize_url so a copy-pasted pooler URL still connects.
_DROP_QUERY_PARAMS = {"pgbouncer"}

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base for all ORM models. Models are added in Phase 1; until then
    ``Base.metadata`` is empty, so Alembic autogenerate produces an empty migration."""


def _strip_unknown_params(url: str) -> str:
    """Drop query params libpq/psycopg can't consume (e.g. Prisma's ``?pgbouncer=true``),
    which otherwise raise ``invalid connection option`` at connect time."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    kept = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k not in _DROP_QUERY_PARAMS
    ]
    return urlunsplit(parts._replace(query=urlencode(kept)))


def normalize_url(url: str) -> str:
    """Force the psycopg (v3) driver and drop provider-only query params. Supabase hands out
    bare ``postgresql://`` (and sometimes ``postgres://``) URLs, which SQLAlchemy would route
    to psycopg2 — the driver we don't install — so rewrite the scheme to
    ``postgresql+psycopg://``, then strip params like ``pgbouncer`` that psycopg rejects."""
    if not url:
        return url
    if not url.startswith("postgresql+"):
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                url = "postgresql+psycopg://" + url[len(prefix) :]
                break
    return _strip_unknown_params(url)


def _build_engine(settings: Settings) -> Engine | None:
    if not settings.database_url:
        return None
    return create_engine(
        normalize_url(settings.database_url),
        future=True,
        # Reconnect transparently after the pooler drops an idle connection.
        pool_pre_ping=True,
        # pgBouncer transaction mode (the Supabase pooler) cannot keep server-side
        # prepared statements across pooled connections; disable them. Harmless on a
        # direct connection. (psycopg v3 connection kwarg.)
        connect_args={"prepare_threshold": None},
    )


_engine: Engine | None = _build_engine(get_settings())
_SessionLocal: sessionmaker[Session] | None = (
    sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False, future=True)
    if _engine is not None
    else None
)


def get_engine() -> Engine | None:
    """The process-wide engine, or ``None`` when ``DATABASE_URL`` is unset."""
    return _engine


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped session. Raises if the DB is unconfigured —
    data endpoints (Phase 3) depend on this, so an unconfigured DB fails loudly there
    rather than silently. ``/healthz`` uses ``db_status()`` instead and never raises."""
    if _SessionLocal is None:
        raise RuntimeError("Database is not configured (DATABASE_URL is unset).")
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()


def db_status() -> str:
    """Health-check probe: ``"ok"`` if ``SELECT 1`` succeeds, ``"unreachable"`` if the
    engine exists but the query fails, ``"not_configured"`` if no ``DATABASE_URL``."""
    if _engine is None:
        return "not_configured"
    try:
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception:  # noqa: BLE001 — health check must never raise
        logger.warning("Database health check failed", exc_info=True)
        return "unreachable"
