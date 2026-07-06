"""study_sessions — recorded study-time blocks for the weekly-activity chart (v0.6 web)

One append-only owned table (mirrors app/models/study_session.py), added after the domain
schema so it is a clean standalone migration:

  * ``study_sessions`` — owned, append-only. Gets the same auth.users FK + owner RLS policy
    as every domain table (defense-in-depth; the backend service role bypasses RLS and
    enforces ownership in app logic — ADR 0007 §2). Also carries an ordinary FK to
    ``subjects(id)`` ON DELETE SET NULL (subject_id is optional — a session may span subjects).

The auth-schema FK is why this migration, like 0002/0003, is Supabase-specific and must not
run against a plain Postgres. Mirrors iOS (a future StudySession @Model) so both clients push
to the same contract.

NOTE (autogenerate drift): the auth.users FK + RLS below are raw-SQL managed, exactly like
0002/0003. ``alembic revision --autogenerate`` will want to DROP ``fk_study_sessions_user``
(the ORM model doesn't declare the cross-schema FK) — discard that diff; never apply it.

Revision ID: 0004_study_sessions
Revises: 0003_ai_usage_and_rate_limit
Create Date: 2026-07-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_study_sessions"
down_revision: str | None = "0003_ai_usage_and_rate_limit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("review", "quiz", "other", native_enum=False, length=32, name="study_kind"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["subject_id"], ["subjects.id"], ondelete="SET NULL", name="fk_study_sessions_subject"
        ),
        comment="Recorded study-time blocks (append-only) for the weekly-activity chart.",
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"])
    op.create_index("ix_study_sessions_subject_id", "study_sessions", ["subject_id"])
    op.create_index("ix_study_sessions_started_at", "study_sessions", ["started_at"])
    # The dashboard aggregates a user's recent sessions by day — a composite serves it directly.
    op.create_index(
        "ix_study_sessions_user_started", "study_sessions", ["user_id", "started_at"]
    )

    op.execute(
        "ALTER TABLE study_sessions ADD CONSTRAINT fk_study_sessions_user "
        "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
    )
    op.execute("ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY study_sessions_owner ON study_sessions FOR ALL "
        "USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS study_sessions_owner ON study_sessions")
    op.execute("ALTER TABLE study_sessions DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE study_sessions DROP CONSTRAINT IF EXISTS fk_study_sessions_user")
    op.drop_index("ix_study_sessions_user_started", table_name="study_sessions")
    op.drop_index("ix_study_sessions_started_at", table_name="study_sessions")
    op.drop_index("ix_study_sessions_subject_id", table_name="study_sessions")
    op.drop_index("ix_study_sessions_user_id", table_name="study_sessions")
    op.drop_table("study_sessions")
