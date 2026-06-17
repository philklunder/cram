"""Source — ingested study material a deck was generated from.

Mirrors ios/Cram/Models/Source.swift. The iOS `fileNames: [String]` (a PDF is one entry;
photo notes span several pages) maps to `storage_paths` here — Supabase Storage object
keys under ``{user_id}/{source_id}/``. This refines ADR 0007 §4's singular `storage_path`
to a list, since a photo source genuinely has multiple page files.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .enums import SourceKind, checked_text_enum
from .mixins import OwnedMixin, SyncMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .card import Card
    from .subject import Subject


class Source(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "sources"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[SourceKind] = mapped_column(
        checked_text_enum(SourceKind, "source_kind"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Supabase Storage object keys; empty for fixture-only sources (mirrors iOS fileNames).
    storage_paths: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    subject: Mapped["Subject"] = relationship(back_populates="sources")
    # Cards outlive their source (ON DELETE SET NULL), so no cascade here.
    cards: Mapped[list["Card"]] = relationship(back_populates="source", passive_deletes=True)
