"""ORM models (ADR 0007 §4), mirroring the iOS SwiftData @Model classes.

Importing this package imports every model module, which registers all tables on
``Base.metadata`` — this is what Alembic's ``target_metadata`` reflects and what the
migrations build. Import ``app.models`` anywhere the full metadata must be populated.
"""

from __future__ import annotations

from ..db import Base
from .card import Card
from .enums import GradeKind, GradingScale, QuestionKind, SourceKind, StudyKind
from .grade_entry import GradeEntry
from .internal import AiCallKind, AiUsageEvent, RateLimitBucket
from .quiz import Attempt, Question, Quiz
from .review_log import ReviewLog
from .source import Source
from .study_session import StudySession
from .subject import Subject

__all__ = [
    "Base",
    "Subject",
    "Source",
    "Card",
    "Quiz",
    "Question",
    "Attempt",
    "GradeEntry",
    "ReviewLog",
    "StudySession",
    "SourceKind",
    "QuestionKind",
    "GradeKind",
    "GradingScale",
    "StudyKind",
    # Backend-internal infra tables (Phase 4, ADR 0009): not synced to iOS.
    "AiUsageEvent",
    "RateLimitBucket",
    "AiCallKind",
]
