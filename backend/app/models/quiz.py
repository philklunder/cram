"""Quiz / Question / Attempt — periodic self-tests. Mirrors ios/Cram/Models/Quiz.swift.

`Attempt` is an **append-only** event (graded answers are never edited), so it uses
``TimestampMixin`` (created_at only), not the sync mixin. It carries the v0.4 `feedback`
field (ADR 0006/0007) which the iOS `Attempt` model gains in the Mac-side v0.4 work.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Double, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .enums import QuestionKind, checked_text_enum
from .mixins import OwnedMixin, SyncMixin, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .subject import Subject


class Quiz(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "quizzes"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)

    subject: Mapped["Subject"] = relationship(back_populates="quizzes")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", passive_deletes=True
    )


class Question(UUIDPkMixin, OwnedMixin, SyncMixin, Base):
    __tablename__ = "questions"

    quiz_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[QuestionKind] = mapped_column(
        checked_text_enum(QuestionKind, "question_kind"), nullable=False
    )
    topic: Mapped[str] = mapped_column(String(256), nullable=False)
    # MC options; empty list for short answer (mirrors iOS `options`).
    options: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    # The correct option (MC) or the model answer (short answer).
    answer_key: Mapped[str] = mapped_column(Text, nullable=False)

    quiz: Mapped["Quiz"] = relationship(back_populates="questions")
    attempts: Mapped[list["Attempt"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", passive_deletes=True
    )


class Attempt(UUIDPkMixin, OwnedMixin, TimestampMixin, Base):
    __tablename__ = "attempts"

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    response: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # 0…1 partial-credit score (1.0 for a correct multiple-choice answer).
    score: Mapped[float] = mapped_column(Double, nullable=False)
    # Grader feedback (ADR 0006); empty for locally-graded multiple choice.
    feedback: Mapped[str] = mapped_column(Text, nullable=False, default="")
    graded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    question: Mapped["Question"] = relationship(back_populates="attempts")
