"""Exam — an assessment within a subject, grouping the cards studied for it.

A subject holds many exams; each exam owns the cards (and the generated quiz) made for it,
and carries its own optional date that drives the countdown + SM-2 exam compression — per
exam, not per subject. Cards and quizzes reference an exam by a **nullable** FK
(ON DELETE SET NULL): a card outlives its exam and falls back to the subject's unsorted
("General") bucket rather than being deleted. Mirrors a future ios/Cram/Models/Exam.swift so
both clients push to the same contract.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .mixins import OwnedMixin, SyncMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .card import Card
    from .quiz import Quiz
    from .subject import Subject


class Exam(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "exams"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    # Optional target date; like Subject.exam_date it is a timestamp, not a SQL date.
    exam_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subject: Mapped["Subject"] = relationship(back_populates="exams")
    # Cards/quizzes outlive their exam (ON DELETE SET NULL) — no cascade delete here; the
    # soft-delete cascade in the repository deliberately omits exams for the same reason.
    cards: Mapped[list["Card"]] = relationship(back_populates="exam", passive_deletes=True)
    quizzes: Mapped[list["Quiz"]] = relationship(back_populates="exam", passive_deletes=True)
