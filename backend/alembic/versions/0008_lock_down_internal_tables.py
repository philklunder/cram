"""lock the backend-internal tables away from the Supabase client roles

``ai_usage_events`` (the spend-cap meter) and ``rate_limit_buckets`` (the rate limiter) are
written only by the backend, but 0003 left them reachable by Supabase's ``anon`` /
``authenticated`` roles:

  * ``ai_usage_events`` had a ``FOR ALL`` owner policy, so a signed-in user could DELETE their
    own meter rows through the Data API and reset both their per-user and the global cap.
  * ``rate_limit_buckets`` had RLS off, so anyone could reset their counters or insert rows
    for another user's key and lock them out with 429s.

Today both paths depend on the Data API being switched off in the dashboard; this makes the
database itself refuse them (security review 2026-09-25):

  1. REVOKE every privilege from ``anon`` and ``authenticated`` on both tables.
  2. Enable RLS on ``rate_limit_buckets`` with no policy (deny-all for non-bypass roles).
  3. Narrow the ``ai_usage_events`` policy to SELECT, so even a re-grant can't let a user
     rewrite their own meter.

The backend's role bypasses RLS and owns the tables (it already writes ``ai_usage_events``
under RLS since 0003), so none of this changes backend behaviour. Supabase-specific, like
0002/0003: it needs the ``anon`` / ``authenticated`` roles and ``auth.uid()``.

Revision ID: 0008_lock_down_internal_tables
Revises: 0007_grade_entry_exam
Create Date: 2026-09-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0008_lock_down_internal_tables"
down_revision: str | None = "0007_grade_entry_exam"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INTERNAL = ("ai_usage_events", "rate_limit_buckets")


def upgrade() -> None:
    for table in _INTERNAL:
        op.execute(f"REVOKE ALL ON {table} FROM anon, authenticated")

    op.execute("ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS ai_usage_events_owner ON ai_usage_events")
    op.execute(
        "CREATE POLICY ai_usage_events_owner_read ON ai_usage_events FOR SELECT "
        "USING (user_id = auth.uid())"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS ai_usage_events_owner_read ON ai_usage_events")
    op.execute(
        "CREATE POLICY ai_usage_events_owner ON ai_usage_events FOR ALL "
        "USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
    )

    op.execute("ALTER TABLE rate_limit_buckets DISABLE ROW LEVEL SECURITY")

    # Supabase's default grants on public-schema tables.
    for table in _INTERNAL:
        op.execute(f"GRANT ALL ON {table} TO anon, authenticated")
