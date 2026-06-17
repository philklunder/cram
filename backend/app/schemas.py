"""Response shape for POST /v1/generate.

snake_case on the wire (ADR 0005); the iOS client maps it to its camelCase
``GeneratedDeck`` domain type. These Pydantic models double as validation of
whatever Claude returns before it goes back to the client.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# QuestionKind raw values shared with the iOS client (ADR 0005).
QuestionKind = Literal["multipleChoice", "shortAnswer"]


class Card(BaseModel):
    front: str
    back: str
    topic: str
    difficulty: int = Field(ge=1, le=5)


class Question(BaseModel):
    prompt: str
    kind: QuestionKind
    topic: str
    # [] for short answer; 3–4 entries for multiple choice.
    options: list[str] = Field(default_factory=list)
    # MC: the correct option's text. Short answer: the model answer (graded in v0.4).
    answer_key: str


class GeneratedDeck(BaseModel):
    source_title: str
    cards: list[Card]
    questions: list[Question]


# JSON schema handed to Claude's structured-output (output_config.format).
# Hand-written rather than derived so we control additionalProperties/enums/required
# exactly — structured outputs require additionalProperties:false and reject numeric
# range constraints, so difficulty is an enum of allowed values.
DECK_JSON_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "source_title": {"type": "string"},
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "front": {"type": "string"},
                    "back": {"type": "string"},
                    "topic": {"type": "string"},
                    "difficulty": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
                },
                "required": ["front", "back", "topic", "difficulty"],
            },
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "prompt": {"type": "string"},
                    "kind": {"type": "string", "enum": ["multipleChoice", "shortAnswer"]},
                    "topic": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer_key": {"type": "string"},
                },
                "required": ["prompt", "kind", "topic", "options", "answer_key"],
            },
        },
    },
    "required": ["source_title", "cards", "questions"],
}


# --- Grading (POST /v1/grade), ADR 0006 -------------------------------------------------

# Pass threshold: score at/above this counts as correct. Derived server-side (not asked of
# the model) so the boundary is deterministic and tunable without re-prompting.
GRADE_PASS_THRESHOLD = 0.6


class GradeRequest(BaseModel):
    """Inbound JSON body for short-answer grading. Field-length caps are enforced in the
    handler (against the configured limit), consistent with /v1/generate."""

    prompt: str
    model_answer: str
    # The student's answer. May be blank ("" grades to 0.0) — required key, not optional.
    response: str
    topic: str = ""


class GradeResult(BaseModel):
    """What the client receives. ``is_correct`` is set server-side from ``score`` (ADR 0006);
    the model only returns ``score`` and ``feedback``."""

    score: float = Field(ge=0.0, le=1.0)
    feedback: str
    is_correct: bool = False


# Schema handed to Claude for grading. The model returns only score + feedback; the server
# derives is_correct. additionalProperties:false and an explicit required list, as with the
# deck schema. (Structured outputs reject numeric range constraints, so score is a bare number
# and the 0..1 range is re-validated by GradeResult / clamped server-side.)
GRADE_JSON_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "score": {"type": "number"},
        "feedback": {"type": "string"},
    },
    "required": ["score", "feedback"],
}
