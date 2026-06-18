"""Backend-internal infrastructure tables (v0.5 Phase 4 — pre-deploy hardening, ADR 0009).

Unlike the rest of ``app/models`` these tables do **not** mirror an iOS SwiftData model and
are never exposed through the sync API — they exist only so the backend can enforce an
Anthropic spend cap and a per-caller rate limit using durable, multi-worker-correct counters
(the user chose Postgres-backed counters over in-memory so the limits hold across workers and
restarts).

- ``AiUsageEvent`` — one row per *successful* Claude call, recording the token cost. The spend
  cap sums ``total_tokens`` over a daily window (per user and globally). Owned + auth-FK'd like
  the domain tables so account deletion cascades it away (the FK + RLS land in migration 0003).
- ``RateLimitBucket`` — a fixed-window request counter keyed by an opaque subject string
  (``user:<uuid>`` normally, ``ip:<addr>`` for the shared dev-fallback identity). One row per
  ``(subject, window_start)`` minute; the count is bumped with an atomic upsert so concurrent
  workers can't race past the limit. Not owned by a user (the subject may be an IP), so it gets
  no auth FK and no RLS.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .enums import checked_text_enum
from .mixins import OwnedMixin, TimestampMixin, UUIDPkMixin


class AiCallKind(str, enum.Enum):
    """Which metered Claude call produced a usage row (the only two — see app/generation.py
    and app/grading.py)."""

    generate = "generate"
    grade = "grade"


class AiUsageEvent(UUIDPkMixin, OwnedMixin, TimestampMixin, Base):
    """Append-only token-usage ledger; the spend cap reads it, nothing updates it.

    ``created_at`` (from ``TimestampMixin``) is the server-insert time and the column the
    daily-window sum filters on. A composite ``(user_id, created_at)`` index keeps the
    per-user daily sum cheap; ``created_at`` alone serves the global sum.
    """

    __tablename__ = "ai_usage_events"
    __table_args__ = (
        # Per-user daily sum filters on (user_id, created_at); the global daily sum filters
        # on created_at alone — each gets a matching index.
        Index("ix_ai_usage_events_user_created", "user_id", "created_at"),
        Index("ix_ai_usage_events_created_at", "created_at"),
        {"comment": "Backend-internal: Anthropic token usage for the spend cap."},
    )

    kind: Mapped[AiCallKind] = mapped_column(
        checked_text_enum(AiCallKind, "ai_call_kind"), nullable=False
    )
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    # Stored (not derived in SQL) so the spend-cap sum is a single column scan.
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False)


class RateLimitBucket(Base):
    """One fixed-window (per-minute) request counter. ``subject`` is the opaque limiter key.

    The count is incremented with ``INSERT ... ON CONFLICT DO UPDATE`` (see app/limits.py),
    which is atomic in Postgres, so two workers handling the same caller's requests in the
    same minute can't both read-then-write a stale count. Rows are disposable; an old window
    is simply never read again (a periodic cleanup can prune ``window_start < now()-1h``).
    """

    __tablename__ = "rate_limit_buckets"
    __table_args__ = ({"comment": "Backend-internal: fixed-window request counters."},)

    subject: Mapped[str] = mapped_column(String(128), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
