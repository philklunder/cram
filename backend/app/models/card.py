"""Card — a flashcard with SM-2 spaced-repetition state.

Mirrors ios/Cram/Models/Card.swift. The SM-2 fields (ease_factor, interval_days,
repetitions, lapses) are the canonical state; due_date is the effective, possibly
exam-compressed next-review date (ADR 0002 / ADR 0004).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Double, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .mixins import OwnedMixin, SyncMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .review_log import ReviewLog
    from .source import Source
    from .subject import Subject


class Card(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "cards"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Cards outlive the source they came from; null the link rather than delete the card.
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str] = mapped_column(String(256), nullable=False)
    # Author-estimated difficulty, 1 (easy) … 5 (hard); the range is enforced by the API layer.
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    # SM-2 canonical state.
    ease_factor: Mapped[float] = mapped_column(Double, nullable=False, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # New cards are due immediately.
    due_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    subject: Mapped["Subject"] = relationship(back_populates="cards")
    source: Mapped["Source | None"] = relationship(back_populates="cards")
    review_logs: Mapped[list["ReviewLog"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", passive_deletes=True
    )
