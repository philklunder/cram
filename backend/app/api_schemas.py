"""Wire schemas for the CRUD + sync API (Phase 3).

snake_case on the wire (ADR 0005/0006); the iOS client maps to its camelCase domain types.
Enum fields reuse the model enums (``str``-valued), so a payload is validated against the
exact wire values the iOS models already use (e.g. ``multipleChoice``) and serialized back
to the same strings.

Per resource there are up to three shapes:
- ``*Read``   — server → client (``from_attributes`` over the ORM row).
- ``*Create`` — client → server for POST and for the upsert push (``id`` is the
  client-generated PK: optional on plain create, required on upsert — enforced in the route).
- ``*Update`` — client → server for PATCH; every field optional, ``exclude_unset`` applied
  so only sent fields change.

Append-only resources (attempts, review_logs) have no ``*Update``: they are insert-only.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from .models.enums import GradeKind, GradingScale, QuestionKind, SourceKind, StudyKind

# --- envelopes -------------------------------------------------------------------------

T = TypeVar("T")


class DeltaPage(BaseModel, Generic[T]):
    """A delta-pull page: the changed rows (tombstones included) plus the cursor to resume
    from. ``next_cursor`` is always a resume point (the position after the last row, or the
    caller's own cursor when nothing changed); ``has_more`` says whether to pull again
    immediately. ``next_cursor`` is ``null`` only when no rows have ever existed."""

    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False


class BatchUpsert(BaseModel, Generic[T]):
    """Push payload: a batch of rows to upsert (sync tables) or insert (append-only logs),
    each keyed by its client-generated ``id``."""

    items: list[T]


class _Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class _SyncRead(_Read):
    """Common fields on every syncable row: identity, audit, and the tombstone."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class _AppendRead(_Read):
    id: uuid.UUID
    created_at: datetime


# --- subjects --------------------------------------------------------------------------


class SubjectRead(_SyncRead):
    name: str
    grading_scale: GradingScale
    target_grade: float | None = None
    current_grade: float | None = None


class SubjectCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    grading_scale: GradingScale = GradingScale.german
    target_grade: float | None = None
    current_grade: float | None = None


class SubjectUpdate(BaseModel):
    name: str | None = None
    grading_scale: GradingScale | None = None
    target_grade: float | None = None
    current_grade: float | None = None


# --- exams -----------------------------------------------------------------------------


class ExamRead(_SyncRead):
    subject_id: uuid.UUID
    title: str
    exam_date: datetime | None = None


class ExamCreate(BaseModel):
    id: uuid.UUID | None = None
    subject_id: uuid.UUID
    title: str
    exam_date: datetime | None = None


class ExamUpdate(BaseModel):
    subject_id: uuid.UUID | None = None
    title: str | None = None
    exam_date: datetime | None = None


# --- sources ---------------------------------------------------------------------------


class SourceRead(_SyncRead):
    subject_id: uuid.UUID
    kind: SourceKind
    title: str
    added_at: datetime
    storage_paths: list[str]


class SourceCreate(BaseModel):
    id: uuid.UUID | None = None
    subject_id: uuid.UUID
    kind: SourceKind
    title: str
    added_at: datetime | None = None
    storage_paths: list[str] = Field(default_factory=list)


class SourceUpdate(BaseModel):
    subject_id: uuid.UUID | None = None
    kind: SourceKind | None = None
    title: str | None = None
    storage_paths: list[str] | None = None


# --- cards -----------------------------------------------------------------------------


class CardRead(_SyncRead):
    subject_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    front: str
    back: str
    topic: str
    difficulty: int
    ease_factor: float
    interval_days: int
    repetitions: int
    lapses: int
    due_date: datetime


class CardCreate(BaseModel):
    id: uuid.UUID | None = None
    subject_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    front: str
    back: str
    topic: str
    difficulty: int = Field(default=3, ge=1, le=5)
    ease_factor: float | None = None
    interval_days: int | None = None
    repetitions: int | None = None
    lapses: int | None = None
    due_date: datetime | None = None


class CardUpdate(BaseModel):
    subject_id: uuid.UUID | None = None
    exam_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    front: str | None = None
    back: str | None = None
    topic: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    ease_factor: float | None = None
    interval_days: int | None = None
    repetitions: int | None = None
    lapses: int | None = None
    due_date: datetime | None = None


# --- quizzes ---------------------------------------------------------------------------


class QuizRead(_SyncRead):
    subject_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    title: str


class QuizCreate(BaseModel):
    id: uuid.UUID | None = None
    subject_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    title: str


class QuizUpdate(BaseModel):
    subject_id: uuid.UUID | None = None
    exam_id: uuid.UUID | None = None
    title: str | None = None


# --- questions -------------------------------------------------------------------------


class QuestionRead(_SyncRead):
    quiz_id: uuid.UUID
    prompt: str
    kind: QuestionKind
    topic: str
    options: list[str]
    answer_key: str


class QuestionCreate(BaseModel):
    id: uuid.UUID | None = None
    quiz_id: uuid.UUID
    prompt: str
    kind: QuestionKind
    topic: str
    options: list[str] = Field(default_factory=list)
    answer_key: str


class QuestionUpdate(BaseModel):
    quiz_id: uuid.UUID | None = None
    prompt: str | None = None
    kind: QuestionKind | None = None
    topic: str | None = None
    options: list[str] | None = None
    answer_key: str | None = None


# --- grade_entries ---------------------------------------------------------------------


class GradeEntryRead(_SyncRead):
    subject_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    title: str
    kind: GradeKind
    score: float
    weight: float
    date: datetime


class GradeEntryCreate(BaseModel):
    id: uuid.UUID | None = None
    subject_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    title: str
    kind: GradeKind
    score: float
    weight: float = 1.0
    date: datetime | None = None


class GradeEntryUpdate(BaseModel):
    subject_id: uuid.UUID | None = None
    exam_id: uuid.UUID | None = None
    title: str | None = None
    kind: GradeKind | None = None
    score: float | None = None
    weight: float | None = None
    date: datetime | None = None


# --- attempts (append-only) ------------------------------------------------------------


class AttemptRead(_AppendRead):
    question_id: uuid.UUID
    response: str
    is_correct: bool
    score: float
    feedback: str
    graded_at: datetime


class AttemptCreate(BaseModel):
    id: uuid.UUID | None = None
    question_id: uuid.UUID
    response: str = ""
    is_correct: bool
    score: float = Field(ge=0.0, le=1.0)
    feedback: str = ""
    graded_at: datetime | None = None


# --- review_logs (append-only) ---------------------------------------------------------


class ReviewLogRead(_AppendRead):
    card_id: uuid.UUID
    reviewed_at: datetime
    rating: int


class ReviewLogCreate(BaseModel):
    id: uuid.UUID | None = None
    card_id: uuid.UUID
    reviewed_at: datetime | None = None
    # SM-2 quality: 1 (again) / 3 (hard) / 4 (good) / 5 (easy).
    rating: int = Field(ge=1, le=5)


# --- study_sessions (append-only) ------------------------------------------------------


class StudySessionRead(_AppendRead):
    subject_id: uuid.UUID | None = None
    started_at: datetime
    duration_seconds: int
    kind: StudyKind


class StudySessionCreate(BaseModel):
    id: uuid.UUID | None = None
    subject_id: uuid.UUID | None = None
    started_at: datetime | None = None
    # Elapsed study time. Non-negative; a capped upper bound keeps a runaway client timer from
    # poisoning the weekly-activity aggregate (24h = 86400s).
    duration_seconds: int = Field(ge=0, le=86_400)
    kind: StudyKind = StudyKind.other
