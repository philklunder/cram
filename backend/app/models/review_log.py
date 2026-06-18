"""ReviewLog — one recorded card review, append-only (analytics + SRS tuning/FSRS migration).

Mirrors ios/Cram/Models/ReviewLog.swift. `rating` is the SM-2 quality stored as an int
(iOS `ReviewRating`: 1 again / 3 hard / 4 good / 5 easy); the API layer validates the value.
Append-only, so it uses ``TimestampMixin`` (created_at only) — never updated or soft-deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .mixins import OwnedMixin, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .card import Card


class ReviewLog(UUIDPkMixin, OwnedMixin, TimestampMixin, Base):
    __tablename__ = "review_logs"

    card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Distinct from created_at (the server-insert time): reviewed_at is the domain event time
    # the client reports, which differs for a review done offline and synced up later.
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # SM-2 quality: 1 (again) / 3 (hard) / 4 (good) / 5 (easy).
    rating: Mapped[int] = mapped_column(Integer, nullable=False)

    card: Mapped["Card"] = relationship(back_populates="review_logs")
