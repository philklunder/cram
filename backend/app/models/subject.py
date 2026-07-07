"""Subject — a course being studied. Mirrors ios/Cram/Models/Subject.swift."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Double, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .enums import GradingScale, checked_text_enum
from .mixins import OwnedMixin, SyncMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .card import Card
    from .exam import Exam
    from .grade_entry import GradeEntry
    from .quiz import Quiz
    from .source import Source


class Subject(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column(String(512), nullable=False)
    # iOS `examDate` is a Date (timestamp), so this is timestamptz, not a SQL date.
    exam_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    grading_scale: Mapped[GradingScale] = mapped_column(
        checked_text_enum(GradingScale, "grading_scale"),
        nullable=False,
        default=GradingScale.german,
    )
    target_grade: Mapped[float | None] = mapped_column(Double, nullable=True)
    # Manually-entered current grade (iOS `manualCurrentGrade`). When null, clients fall
    # back to the weighted average of grade_entries (PRODUCT-SPEC §6).
    current_grade: Mapped[float | None] = mapped_column(Double, nullable=True)

    # NOTE (sync, ADR 0007 §5): these cascades are HARD deletes (ORM + DB ON DELETE CASCADE)
    # and are for true row removal only (admin / account deletion). The normal lifecycle is
    # SOFT delete via SyncMixin.deleted_at, which clients pull as tombstones. Phase 3 delete
    # logic must set deleted_at on descendants explicitly — a hard cascade leaves offline
    # clients with ghost rows because no child tombstone is ever emitted.
    exams: Mapped[list["Exam"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", passive_deletes=True
    )
    sources: Mapped[list["Source"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", passive_deletes=True
    )
    cards: Mapped[list["Card"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", passive_deletes=True
    )
    quizzes: Mapped[list["Quiz"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", passive_deletes=True
    )
    grades: Mapped[list["GradeEntry"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan", passive_deletes=True
    )
