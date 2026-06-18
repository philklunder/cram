"""ai usage ledger + rate-limit buckets (v0.5 Phase 4 hardening, ADR 0009)

Two backend-internal tables (never synced to iOS, mirror app/models/internal.py):

  1. ``ai_usage_events`` — append-only token-usage ledger the Anthropic spend cap sums over
     a daily window. Owned, so it gets the same auth.users FK + owner RLS policy as the
     domain tables (defense-in-depth; the backend service role bypasses RLS and enforces
     ownership in app logic — ADR 0007 §2). The auth-schema FK is why this migration, like
     0002, is Supabase-specific and must not run against a plain Postgres.

  2. ``rate_limit_buckets`` — fixed per-minute request counters keyed by an opaque subject
     (``user:<uuid>`` / ``ip:<addr>``). Not user-owned, so NO auth FK and NO RLS.

NOTE (autogenerate drift): the auth.users FK + RLS below are raw-SQL managed, exactly like
0002. ``alembic revision --autogenerate`` will want to DROP ``fk_ai_usage_events_user`` (the
ORM model doesn't declare the cross-schema FK) — discard that diff; never apply it.

Revision ID: 0003_ai_usage_and_rate_limit
Revises: 0002_supabase_auth_rls
Create Date: 2026-06-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_ai_usage_and_rate_limit"
down_revision: str | None = "0002_supabase_auth_rls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- ai_usage_events (owned; auth FK + RLS like the domain tables) -------------------
    op.create_table(
        "ai_usage_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "kind", sa.Enum("generate", "grade", native_enum=False, length=32, name="ai_call_kind"),
            nullable=False,
        ),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer(), nullable=False),
        comment="Backend-internal: Anthropic token usage for the spend cap.",
    )
    op.create_index("ix_ai_usage_events_user_id", "ai_usage_events", ["user_id"])
    op.create_index(
        "ix_ai_usage_events_user_created", "ai_usage_events", ["user_id", "created_at"]
    )
    op.create_index("ix_ai_usage_events_created_at", "ai_usage_events", ["created_at"])

    op.execute(
        "ALTER TABLE ai_usage_events ADD CONSTRAINT fk_ai_usage_events_user "
        "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
    )
    op.execute("ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY ai_usage_events_owner ON ai_usage_events FOR ALL "
        "USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
    )

    # --- rate_limit_buckets (infra; no owner, no FK, no RLS) -----------------------------
    op.create_table(
        "rate_limit_buckets",
        sa.Column("subject", sa.String(length=128), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        comment="Backend-internal: fixed-window request counters.",
    )
    # Prune-by-age helper (DELETE FROM rate_limit_buckets WHERE window_start < now()-'1h').
    op.create_index(
        "ix_rate_limit_buckets_window_start", "rate_limit_buckets", ["window_start"]
    )


def downgrade() -> None:
    op.drop_index("ix_rate_limit_buckets_window_start", table_name="rate_limit_buckets")
    op.drop_table("rate_limit_buckets")

    op.execute("DROP POLICY IF EXISTS ai_usage_events_owner ON ai_usage_events")
    op.execute("ALTER TABLE ai_usage_events DISABLE ROW LEVEL SECURITY")
    op.execute(
        "ALTER TABLE ai_usage_events DROP CONSTRAINT IF EXISTS fk_ai_usage_events_user"
    )
    op.drop_index("ix_ai_usage_events_created_at", table_name="ai_usage_events")
    op.drop_index("ix_ai_usage_events_user_created", table_name="ai_usage_events")
    op.drop_index("ix_ai_usage_events_user_id", table_name="ai_usage_events")
    op.drop_table("ai_usage_events")
