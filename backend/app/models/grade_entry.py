"""GradeEntry — a real-world mark recorded for a subject (PRODUCT-SPEC §6).

Mirrors ios/Cram/Models/GradeEntry.swift. `score` is interpreted by the subject's
grading_scale; `weight` is the relative weight when averaging into the current grade.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Double, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .enums import GradeKind, checked_text_enum
from .mixins import OwnedMixin, SyncMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .subject import Subject


class GradeEntry(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "grade_entries"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    kind: Mapped[GradeKind] = mapped_column(
        checked_text_enum(GradeKind, "grade_kind"), nullable=False
    )
    score: Mapped[float] = mapped_column(Double, nullable=False)
    # Relative weight when averaging into the subject's current grade (e.g. 0.3 for 30%).
    weight: Mapped[float] = mapped_column(Double, nullable=False, default=1.0)
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    subject: Mapped["Subject"] = relationship(back_populates="grades")
