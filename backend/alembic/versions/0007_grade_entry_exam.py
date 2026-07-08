"""grade_entries.exam_id — link a recorded grade to the exam it's for

Adds one nullable back-reference so a grade can record a specific exam's result:

  * ``grade_entries.exam_id`` — nullable FK to ``exams(id)`` ON DELETE SET NULL. A standalone
    grade (homework, participation) leaves it null; an exam grade points at its exam. The grade
    outlives its exam (SET NULL), exactly like ``cards.exam_id`` / ``quizzes.exam_id`` (0005).
    Recording a grade against an exam is what "finishes" the exam on the client — it drops out
    of the subject's active list into "Past exams".

Plain additive column + FK + index; existing rows become standalone (null). Unlike 0002/0004/
0005 this touches no auth-schema FK or RLS, so it is not Supabase-specific.

Revision ID: 0007_grade_entry_exam
Revises: 0006_drop_subject_exam_date
Create Date: 2026-07-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_grade_entry_exam"
down_revision: str | None = "0006_drop_subject_exam_date"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("grade_entries", sa.Column("exam_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_grade_entries_exam",
        "grade_entries",
        "exams",
        ["exam_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_grade_entries_exam_id", "grade_entries", ["exam_id"])


def downgrade() -> None:
    op.drop_index("ix_grade_entries_exam_id", table_name="grade_entries")
    op.drop_constraint("fk_grade_entries_exam", "grade_entries", type_="foreignkey")
    op.drop_column("grade_entries", "exam_id")
