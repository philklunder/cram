"""drop subjects.exam_date — the exam date lives on Exam now

Since 0005 a subject holds many exams, each with its own ``exam_date``. The pre-existing
per-subject ``subjects.exam_date`` is therefore redundant: it can't express more than one exam and
duplicates the authoritative per-exam date. This migration removes it. Clients derive a
subject-level countdown from the subject's soonest upcoming exam instead.

Plain-Postgres safe (no auth-schema/RLS involved), unlike 0002/0004/0005.

Revision ID: 0006_drop_subject_exam_date
Revises: 0005_exams
Create Date: 2026-07-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_drop_subject_exam_date"
down_revision: str | None = "0005_exams"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("subjects", "exam_date")


def downgrade() -> None:
    # Re-add as the original nullable timestamptz. Data is not restored (it was dropped); rows come
    # back with a NULL exam_date.
    op.add_column(
        "subjects",
        sa.Column("exam_date", sa.DateTime(timezone=True), nullable=True),
    )
