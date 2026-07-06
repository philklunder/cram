"""Domain enums, mirroring the iOS SwiftData raw values exactly (ADR 0007 §4).

The string ``.value`` of each member is the on-the-wire / on-disk value the iOS models
already use (e.g. ``multipleChoice``), so the backend mirror and the client converge.
Stored as **checked text** — ``Enum(native_enum=False)`` renders a ``VARCHAR`` + ``CHECK``
constraint rather than a native Postgres enum, which is portable and trivial to extend.
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum


class SourceKind(str, enum.Enum):
    pdf = "pdf"
    photo = "photo"
    # v2+ (already known, so the CHECK admits them now):
    web = "web"
    youtube = "youtube"
    audio = "audio"


class QuestionKind(str, enum.Enum):
    # Raw values are camelCase to match the iOS enum and the ADR 0005/0006 wire contract.
    multiple_choice = "multipleChoice"
    short_answer = "shortAnswer"


class GradeKind(str, enum.Enum):
    exam = "exam"
    test = "test"
    assignment = "assignment"
    overall = "overall"


class GradingScale(str, enum.Enum):
    german = "german"
    swiss = "swiss"
    percentage = "percentage"
    letter = "letter"
    gpa = "gpa"


class StudyKind(str, enum.Enum):
    """What a recorded study block was — feeds the dashboard's weekly-activity chart.
    ``other`` is the default catch-all so the CHECK admits blocks not tied to a review/quiz."""

    review = "review"
    quiz = "quiz"
    other = "other"


def checked_text_enum(py_enum: type[enum.Enum], name: str) -> SAEnum:
    """A VARCHAR + CHECK column type persisting each member's ``.value`` string.

    ``values_callable`` is essential for ``QuestionKind``: the member *name* is
    ``multiple_choice`` but the stored value must be ``multipleChoice``.
    """
    return SAEnum(
        py_enum,
        native_enum=False,
        length=32,
        name=name,
        values_callable=lambda e: [member.value for member in e],
    )
