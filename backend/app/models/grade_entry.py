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
    from .exam import Exam
    from .subject import Subject


class GradeEntry(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "grade_entries"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The exam this grade is for, when it records an exam's result. Nullable — a standalone
    # grade (homework, participation) has no exam. A grade outlives its exam (ON DELETE SET
    # NULL), exactly like a card. Recording a grade against an exam is what "finishes" that
    # exam on the client: it drops out of the subject's active list into "Past exams".
    exam_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exams.id", ondelete="SET NULL"), nullable=True, index=True
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
