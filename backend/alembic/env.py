"""Alembic migration environment (ADR 0007).

The database URL is taken from the app Settings (``migration_url`` — the direct
connection, falling back to ``DATABASE_URL``), not from alembic.ini, so the connection
string stays in the gitignored ``.env``. ``target_metadata`` is the app's declarative
``Base.metadata``; it is empty until Phase 1 adds models, at which point ``--autogenerate``
begins emitting real migrations.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

load_dotenv()  # load backend/.env before reading settings

from app.config import load_settings  # noqa: E402
from app.db import Base, normalize_url  # noqa: E402
import app.models  # noqa: E402,F401 — registers all tables on Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_settings = load_settings()
_url = normalize_url(_settings.migration_url)
if _url:
    # Set at runtime so the secret never lives in a tracked file.
    config.set_main_option("sqlalchemy.url", _url)

target_metadata = Base.metadata


def _require_url() -> str:
    if not _url:
        raise RuntimeError(
            "No database URL. Set DATABASE_DIRECT_URL (preferred) or DATABASE_URL in "
            "backend/.env before running migrations."
        )
    return _url


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live connection (``alembic upgrade --sql``)."""
    context.configure(
        url=_require_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live connection."""
    _require_url()
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
