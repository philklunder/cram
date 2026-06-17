"""ORM models (ADR 0007 §4), mirroring the iOS SwiftData @Model classes.

Importing this package imports every model module, which registers all tables on
``Base.metadata`` — this is what Alembic's ``target_metadata`` reflects and what the
migrations build. Import ``app.models`` anywhere the full metadata must be populated.
"""

from __future__ import annotations

from ..db import Base
from .card import Card
from .enums import GradeKind, GradingScale, QuestionKind, SourceKind
from .grade_entry import GradeEntry
from .quiz import Attempt, Question, Quiz
from .review_log import ReviewLog
from .source import Source
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
    "SourceKind",
    "QuestionKind",
    "GradeKind",
    "GradingScale",
]
