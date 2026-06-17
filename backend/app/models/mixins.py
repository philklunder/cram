"""Shared column mixins for the ORM models (ADR 0007 §4).

- ``UUIDPkMixin`` — client-generatable UUID primary key.
- ``OwnedMixin`` — ``user_id`` ownership column (FK to Supabase ``auth.users`` added in a
  migration; the table lives in the ``auth`` schema, outside this metadata).
- ``TimestampMixin`` — ``created_at`` only; for append-only event rows.
- ``SyncMixin`` — adds ``updated_at`` + ``deleted_at`` for mutable, syncable rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPkMixin:
    # Client-generatable (ADR 0007): offline-created rows get a stable id and upserts are
    # idempotent. The server fills a uuid4 when the client omits it.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class OwnedMixin:
    # References auth.users(id); the FK + ON DELETE CASCADE is added in the Supabase RLS
    # migration. Indexed because every query is scoped by owner (backend-mediated, §2).
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SyncMixin(TimestampMixin):
    # All writes flow through the backend ORM (backend-mediated, ADR 0007 §2), so an ORM
    # onupdate keeps updated_at server-fresh; indexed for `?since=` delta pulls.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        index=True,
    )
    # Soft-delete tombstone: set on delete so the deletion propagates to clients on pull.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
