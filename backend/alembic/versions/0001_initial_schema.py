"""initial schema — full v0.5 data model (ADR 0007 §4)

Creates every table mirroring the iOS SwiftData models. Portable to any Postgres (no
Supabase-specific objects); the auth.users foreign keys and RLS policies are added in
0002. Hand-authored to match app/models/*; once a live DB exists, sanity-check with
`alembic revision --autogenerate` and reconcile any drift before relying on it.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-17
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --- shared column factories (mirror app/models/mixins.py) ------------------------------
def _pk() -> sa.Column:
    return sa.Column("id", sa.Uuid(), primary_key=True)


def _owner() -> sa.Column:
    return sa.Column("user_id", sa.Uuid(), nullable=False)


def _created() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def _updated() -> sa.Column:
    return sa.Column(
        "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def _deleted() -> sa.Column:
    return sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)


def _enum(name: str, *values: str) -> sa.Enum:
    # Checked text (VARCHAR + CHECK), matching app/models/enums.checked_text_enum.
    return sa.Enum(*values, native_enum=False, length=32, name=name)


# Tables carrying the sync mixin (updated_at indexed for `?since=` delta pulls).
_SYNC_TABLES = ("subjects", "sources", "cards", "quizzes", "questions", "grade_entries")
# Every owned table gets a user_id index (all queries are owner-scoped).
_OWNED_TABLES = _SYNC_TABLES + ("attempts", "review_logs")


def upgrade() -> None:
    op.create_table(
        "subjects",
        _pk(),
        _owner(),
        _created(),
        _updated(),
        _deleted(),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("exam_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "grading_scale",
            _enum("grading_scale", "german", "swiss", "percentage", "letter", "gpa"),
            nullable=False,
        ),
        sa.Column("target_grade", sa.Double(), nullable=True),
        sa.Column("current_grade", sa.Double(), nullable=True),
    )

    op.create_table(
        "sources",
        _pk(),
        _owner(),
        _created(),
        _updated(),
        _deleted(),
        sa.Column(
            "subject_id",
            sa.Uuid(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind", _enum("source_kind", "pdf", "photo", "web", "youtube", "audio"), nullable=False
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("storage_paths", postgresql.JSONB(), nullable=False),
    )

    op.create_table(
        "cards",
        _pk(),
        _owner(),
        _created(),
        _updated(),
        _deleted(),
        sa.Column(
            "subject_id",
            sa.Uuid(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_id", sa.Uuid(), sa.ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("front", sa.Text(), nullable=False),
        sa.Column("back", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=256), nullable=False),
        sa.Column("difficulty", sa.Integer(), nullable=False),
        sa.Column("ease_factor", sa.Double(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=False),
        sa.Column("lapses", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_cards_source_id", "cards", ["source_id"])
    op.create_index("ix_cards_due_date", "cards", ["due_date"])

    op.create_table(
        "quizzes",
        _pk(),
        _owner(),
        _created(),
        _updated(),
        _deleted(),
        sa.Column(
            "subject_id",
            sa.Uuid(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
    )

    op.create_table(
        "questions",
        _pk(),
        _owner(),
        _created(),
        _updated(),
        _deleted(),
        sa.Column(
            "quiz_id", sa.Uuid(), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("kind", _enum("question_kind", "multipleChoice", "shortAnswer"), nullable=False),
        sa.Column("topic", sa.String(length=256), nullable=False),
        sa.Column("options", postgresql.JSONB(), nullable=False),
        sa.Column("answer_key", sa.Text(), nullable=False),
    )

    op.create_table(
        "attempts",
        _pk(),
        _owner(),
        _created(),
        sa.Column(
            "question_id",
            sa.Uuid(),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("response", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("score", sa.Double(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("graded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_attempts_question_id", "attempts", ["question_id"])

    op.create_table(
        "grade_entries",
        _pk(),
        _owner(),
        _created(),
        _updated(),
        _deleted(),
        sa.Column(
            "subject_id",
            sa.Uuid(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("kind", _enum("grade_kind", "exam", "test", "assignment", "overall"), nullable=False),
        sa.Column("score", sa.Double(), nullable=False),
        sa.Column("weight", sa.Double(), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "review_logs",
        _pk(),
        _owner(),
        _created(),
        sa.Column(
            "card_id", sa.Uuid(), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
    )
    op.create_index("ix_review_logs_card_id", "review_logs", ["card_id"])

    # FK indexes for the sync-table parent links.
    op.create_index("ix_sources_subject_id", "sources", ["subject_id"])
    op.create_index("ix_cards_subject_id", "cards", ["subject_id"])
    op.create_index("ix_quizzes_subject_id", "quizzes", ["subject_id"])
    op.create_index("ix_questions_quiz_id", "questions", ["quiz_id"])
    op.create_index("ix_grade_entries_subject_id", "grade_entries", ["subject_id"])

    # Owner + delta-pull indexes (mirror the mixin index=True columns).
    for table in _OWNED_TABLES:
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
    for table in _SYNC_TABLES:
        op.create_index(f"ix_{table}_updated_at", table, ["updated_at"])


def downgrade() -> None:
    # Drop children before parents (reverse of creation).
    op.drop_table("review_logs")
    op.drop_table("grade_entries")
    op.drop_table("attempts")
    op.drop_table("questions")
    op.drop_table("quizzes")
    op.drop_table("cards")
    op.drop_table("sources")
    op.drop_table("subjects")
