"""exams — a Subject → Exam → Cards level, so a subject can hold many exams

Adds one owned, syncable table plus two nullable back-references:

  * ``exams`` — owned + syncable (mirrors app/models/exam.py). Gets the same auth.users FK +
    owner RLS policy as every domain table (defense-in-depth; the backend service role
    bypasses RLS and enforces ownership in app logic — ADR 0007 §2), and a CASCADE FK to
    ``subjects(id)`` (an exam belongs to exactly one subject).
  * ``cards.exam_id`` / ``quizzes.exam_id`` — nullable FK to ``exams(id)`` ON DELETE SET NULL.
    A card/quiz outlives its exam: deleting the exam leaves the row in the subject's unsorted
    ("General") bucket rather than removing it.

The auth-schema FK is why this migration, like 0002/0004, is Supabase-specific and must not
run against a plain Postgres. Mirrors a future iOS Exam @Model so both clients share the
contract.

NOTE (autogenerate drift): the auth.users FK + RLS below are raw-SQL managed, exactly like
0002/0004. ``alembic revision --autogenerate`` will want to DROP ``fk_exams_user`` (the ORM
model doesn't declare the cross-schema FK) — discard that diff; never apply it.

Revision ID: 0005_exams
Revises: 0004_study_sessions
Create Date: 2026-07-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_exams"
down_revision: str | None = "0004_study_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exams",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "subject_id",
            sa.Uuid(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("exam_date", sa.DateTime(timezone=True), nullable=True),
        comment="Assessments within a subject; group the cards/quiz studied for each exam.",
    )
    # Owner-scoped queries + `?since=` delta pulls, matching every other syncable table.
    op.create_index("ix_exams_user_id", "exams", ["user_id"])
    op.create_index("ix_exams_updated_at", "exams", ["updated_at"])
    op.create_index("ix_exams_subject_id", "exams", ["subject_id"])

    op.execute(
        "ALTER TABLE exams ADD CONSTRAINT fk_exams_user "
        "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
    )
    op.execute("ALTER TABLE exams ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY exams_owner ON exams FOR ALL "
        "USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
    )

    # Back-references from the existing decks. Nullable → existing rows become "General".
    op.add_column("cards", sa.Column("exam_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_cards_exam", "cards", "exams", ["exam_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_cards_exam_id", "cards", ["exam_id"])

    op.add_column("quizzes", sa.Column("exam_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_quizzes_exam", "quizzes", "exams", ["exam_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_quizzes_exam_id", "quizzes", ["exam_id"])


def downgrade() -> None:
    op.drop_index("ix_quizzes_exam_id", table_name="quizzes")
    op.drop_constraint("fk_quizzes_exam", "quizzes", type_="foreignkey")
    op.drop_column("quizzes", "exam_id")

    op.drop_index("ix_cards_exam_id", table_name="cards")
    op.drop_constraint("fk_cards_exam", "cards", type_="foreignkey")
    op.drop_column("cards", "exam_id")

    op.execute("DROP POLICY IF EXISTS exams_owner ON exams")
    op.execute("ALTER TABLE exams DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE exams DROP CONSTRAINT IF EXISTS fk_exams_user")
    op.drop_index("ix_exams_subject_id", table_name="exams")
    op.drop_index("ix_exams_updated_at", table_name="exams")
    op.drop_index("ix_exams_user_id", table_name="exams")
    op.drop_table("exams")
