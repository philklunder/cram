"""supabase auth FKs + row-level security (ADR 0007 §2)

Supabase-specific, and separated from 0001 so the table creation stays portable to a
plain Postgres (e.g. a local test DB). This migration:

  1. Adds a FK from every table's user_id to auth.users(id) ON DELETE CASCADE.
  2. Enables RLS and adds an owner-only policy keyed on auth.uid().

RLS is **defense-in-depth**, not the primary gate: the backend connects with a privileged
role that bypasses RLS and enforces ownership in app logic (ADR 0007 §2). These policies
only matter for an accidental anon/authenticated direct path. Requires the Supabase `auth`
schema + `auth.uid()`; do NOT run this against a plain Postgres without them.

Revision ID: 0002_supabase_auth_rls
Revises: 0001_initial
Create Date: 2026-06-17
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_supabase_auth_rls"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = (
    "subjects",
    "sources",
    "cards",
    "quizzes",
    "questions",
    "attempts",
    "grade_entries",
    "review_logs",
)


def upgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT fk_{table}_user "
            f"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        # FOR ALL covers select/insert/update/delete; USING gates reads/writes of existing
        # rows, WITH CHECK gates inserted/updated rows — both pinned to the owner.
        op.execute(
            f"CREATE POLICY {table}_owner ON {table} FOR ALL "
            f"USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_owner ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_user")
