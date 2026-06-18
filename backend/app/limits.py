"""Per-caller rate limiting + Anthropic spend cap (v0.5 Phase 4, ADR 0009).

Two independent cost controls, both backed by Postgres so they hold across multiple workers
and restarts (the user's explicit choice over an in-memory half-measure):

* **Rate limit** — a fixed per-minute request ceiling on *every* ``/v1/*`` route, enforced as
  a FastAPI dependency (:func:`enforce_rate_limit`). The per-minute counter is bumped with an
  atomic ``INSERT ... ON CONFLICT DO UPDATE`` so concurrent workers can't race past it, and is
  committed immediately so an attempt counts even if the request later fails.

* **Spend cap** — a daily token ceiling, per user *and* global, checked *before* a Claude call
  (:func:`enforce_spend_cap`) and recorded *after* a successful one (:func:`record_usage`).
  Token-based (exact from the SDK ``usage``) so there is no per-model price table to maintain.

Both are disabled when their setting is ``0`` (the default), so local/dev work is unaffected;
``check_production_config`` makes them mandatory in prod. The check-then-act window in the
spend cap is intentionally tolerated for a single-tenant deploy: a burst can overshoot the cap
by at most the in-flight requests, which is acceptable and documented (ADR 0009).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .auth import CurrentUser, get_current_user
from .config import Settings, get_settings
from .db import get_session
from .models.internal import AiCallKind, AiUsageEvent, RateLimitBucket

logger = logging.getLogger("cram.limits")

# Rate-limit window length; the bucket key is the request minute (now truncated to :00).
_RATE_WINDOW_SECONDS = 60


# --- subject key + client IP ------------------------------------------------------------
def client_ip(request: Request, settings: Settings) -> str:
    """Best-effort client IP for the rate-limit fallback key.

    Trust ``X-Forwarded-For`` (first hop) *only* when ``CRAM_TRUSTED_PROXY`` is set — an
    untrusted client can spoof the header to evade or frame another IP (H1). Otherwise use
    the socket peer.
    """
    if settings.trust_proxy:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _subject_key(user: CurrentUser, request: Request, settings: Settings) -> str:
    """The limiter key: per real user normally. The dev-fallback identity is shared by every
    loopback caller, so fall back to per-IP there to keep distinct dev machines separate."""
    if user.is_dev_fallback:
        return f"ip:{client_ip(request, settings)}"
    return f"user:{user.id}"


# --- rate limit -------------------------------------------------------------------------
def check_rate_limit(session: Session, subject: str, limit_per_min: int) -> None:
    """Bump ``subject``'s counter for the current minute and 429 if it exceeds the limit.

    Disabled when ``limit_per_min <= 0``. The upsert + ``RETURNING`` is a single atomic
    statement, and we commit it straight away so the increment is durable independent of the
    request's own transaction (a rejected request still counts as an attempt).
    """
    if limit_per_min <= 0:
        return

    now = datetime.now(timezone.utc)
    window_start = now.replace(second=0, microsecond=0)
    stmt = (
        pg_insert(RateLimitBucket)
        .values(subject=subject, window_start=window_start, count=1)
        .on_conflict_do_update(
            index_elements=[RateLimitBucket.subject, RateLimitBucket.window_start],
            set_={"count": RateLimitBucket.count + 1},
        )
        .returning(RateLimitBucket.count)
    )
    count = session.execute(stmt).scalar_one()
    session.commit()

    if count > limit_per_min:
        retry_after = max(1, _RATE_WINDOW_SECONDS - now.second)
        logger.info("rate limit hit: subject=%s count=%s limit=%s", subject, count, limit_per_min)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def enforce_rate_limit(
    request: Request,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """FastAPI dependency applied to every ``/v1/*`` router (CRUD + the AI endpoints). Runs
    after auth, so the caller is always identified; keyed per user (per IP for dev fallback)."""
    settings = get_settings()
    check_rate_limit(session, _subject_key(user, request, settings), settings.rate_limit_per_min)


# --- spend cap --------------------------------------------------------------------------
def _utc_day_start() -> datetime:
    """Midnight UTC today — the start of the daily spend-cap window (resets at 00:00 UTC)."""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _tokens_since(session: Session, window_start: datetime, user_id=None) -> int:
    q = select(func.coalesce(func.sum(AiUsageEvent.total_tokens), 0)).where(
        AiUsageEvent.created_at >= window_start
    )
    if user_id is not None:
        q = q.where(AiUsageEvent.user_id == user_id)
    return int(session.execute(q).scalar_one())


def enforce_spend_cap(session: Session, user_id, settings: Settings) -> None:
    """Refuse with 429 *before* a Claude call when today's token usage is at/over a cap.

    Checks the per-user cap then the global cap; either disabled when its setting is ``0``.
    Raises before any spend is incurred (the call site must invoke this prior to the SDK
    call). The reads run inside the request transaction — see module note on the race window.
    """
    user_cap = settings.user_daily_token_cap
    global_cap = settings.global_daily_token_cap
    if user_cap <= 0 and global_cap <= 0:
        return

    window_start = _utc_day_start()
    # NOTE: the global sum below is correct only because the backend connects as the
    # table-owner role that BYPASSES the ENABLEd (not FORCEd) RLS on ai_usage_events. If the
    # app is ever moved to a non-owner role with FORCE ROW LEVEL SECURITY (ADR 0008 open
    # question), the owner policy would scope the sum to auth.uid() and the global cap would
    # silently become a second per-user cap — failing open on total spend. Revisit here then.
    if user_cap > 0:
        used = _tokens_since(session, window_start, user_id=user_id)
        if used >= user_cap:
            logger.warning("spend cap (user) reached: user=%s used=%s cap=%s", user_id, used, user_cap)
            raise HTTPException(
                status_code=429,
                detail="Your daily AI usage limit has been reached. Please try again tomorrow.",
            )
    if global_cap > 0:
        used = _tokens_since(session, window_start)
        if used >= global_cap:
            logger.warning("spend cap (global) reached: used=%s cap=%s", used, global_cap)
            raise HTTPException(
                status_code=429,
                detail="The service has reached its daily AI usage limit. Please try again later.",
            )


def record_usage(session: Session, user_id, kind: AiCallKind, usage) -> None:
    """Append a usage row for a *successful* Claude call. Does not commit — the caller commits
    it atomically with the persisted output, so usage is recorded iff the work landed."""
    session.add(
        AiUsageEvent(
            user_id=user_id,
            kind=kind,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
        )
    )
