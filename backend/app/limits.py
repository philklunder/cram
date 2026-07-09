"""Per-caller rate limiting + Anthropic spend cap (v0.5 Phase 4, ADR 0009).

Two independent cost controls, both backed by Postgres so they hold across multiple workers
and restarts (the user's explicit choice over an in-memory half-measure):

* **Rate limit** — a fixed per-minute request ceiling on *every* ``/v1/*`` route, enforced as
  a FastAPI dependency (:func:`enforce_rate_limit`). It is split by method:

  - *Mutating* requests (POST/PATCH/DELETE) and the paid AI endpoints keep the original
    Postgres-backed counter: an atomic ``INSERT ... ON CONFLICT DO UPDATE`` that concurrent
    workers can't race past, committed immediately so an attempt counts even if the request
    later fails. These are the requests that write, or cost money, so ADR 0009's requirement
    that the ceiling survive restarts and span workers applies to them unchanged.

  - *Safe* reads (GET/HEAD) are counted **in-process** instead (:func:`check_read_rate_limit`),
    with their own, much higher ceiling. Charging a Postgres write + commit to every read was
    the dominant per-request cost: all of one user's concurrent reads contend on the same
    ``(subject, minute)`` bucket row, so they serialised on its row lock. A read is idempotent,
    owner-scoped and free, so the weaker guarantee is an acceptable trade — and it is not the
    only guard: nginx applies a per-IP ``limit_req`` (10r/s) and ``limit_conn`` in front of the
    app (deploy/nginx.conf.template), which is what actually blunts an unauthenticated flood.

  The in-process counter is per worker and resets on restart. The deploy runs a single uvicorn
  worker (deploy/entrypoint.sh), so today that is per container; with N workers a client could
  read N× the ceiling. That is deliberate for reads and **must not** be extended to the
  mutating/AI path, whose cap protects real money.

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
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .auth import CurrentUser, get_current_user
from .config import Settings, get_settings
from .db import get_session
from .models.internal import AiCallKind, AiUsageEvent, RateLimitBucket

logger = logging.getLogger("cram.limits")

# Rate-limit window length; the bucket key is the request minute (now truncated to :00).
_RATE_WINDOW_SECONDS = 60

# Opportunistic pruning of the rate_limit_buckets table (ADR 0009 documented the sweep but
# never scheduled it, so the table grew one row per (subject, minute) forever). We delete
# buckets older than the retention window lazily, at most once per interval per process —
# the deploy runs a single uvicorn worker, so in-process throttling is sufficient and needs
# no external cron. Only long-past windows are removed, never a live counter, so this can
# never affect an in-flight limit decision.
_BUCKET_RETENTION_SECONDS = 3600  # keep the last hour of counters
_PRUNE_INTERVAL_SECONDS = 3600  # sweep at most hourly
_last_prune_monotonic = 0.0

# HTTP methods treated as safe reads — limited in-process, never with a DB write.
_SAFE_METHODS = frozenset({"GET", "HEAD"})

# In-process fixed-window counters for safe reads: {subject: (window_index, count)}. Guarded by a
# lock because sync route dependencies run in uvicorn's threadpool, so several requests touch this
# concurrently. Entries are self-expiring (a stale window resets to 0 on next use); the size cap
# below bounds memory if many distinct subjects appear within one window.
_read_buckets: dict[str, tuple[int, int]] = {}
_read_lock = threading.Lock()
_READ_BUCKET_MAX = 4096


def _maybe_prune_buckets(session: Session) -> None:
    """Delete rate-limit buckets older than the retention window, throttled to once per
    interval per process. Best-effort: a failure here must never break the request that
    triggered it, so it is logged and swallowed."""
    global _last_prune_monotonic
    now = time.monotonic()
    if now - _last_prune_monotonic < _PRUNE_INTERVAL_SECONDS:
        return
    _last_prune_monotonic = now  # claim the slot before the (fallible) delete
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_BUCKET_RETENTION_SECONDS)
    try:
        result = session.execute(
            delete(RateLimitBucket).where(RateLimitBucket.window_start < cutoff)
        )
        session.commit()
        if result.rowcount:
            logger.info("pruned %s stale rate-limit bucket(s)", result.rowcount)
    except Exception:  # noqa: BLE001 — pruning is best-effort housekeeping
        logger.warning("rate-limit bucket prune failed", exc_info=True)
        session.rollback()


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

    # Piggyback the housekeeping sweep on a path that already runs on every request; it is
    # self-throttled to once an hour and only removes long-expired windows.
    _maybe_prune_buckets(session)

    if count > limit_per_min:
        retry_after = max(1, _RATE_WINDOW_SECONDS - now.second)
        logger.info("rate limit hit: subject=%s count=%s limit=%s", subject, count, limit_per_min)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def check_read_rate_limit(subject: str, limit_per_min: int) -> None:
    """Bump ``subject``'s in-process read counter for the current minute and 429 if it exceeds
    the limit. Disabled when ``limit_per_min <= 0``.

    No database I/O: this is the whole point (see the module docstring). Per worker, resets on
    restart — acceptable for idempotent, owner-scoped reads, and never used for writes.
    """
    if limit_per_min <= 0:
        return

    now = time.time()
    window = int(now // _RATE_WINDOW_SECONDS)

    with _read_lock:
        # Bound memory: if a burst of distinct subjects fills the map, drop everything not in the
        # current window. Only expired counters go, so no live limit decision is affected.
        if len(_read_buckets) > _READ_BUCKET_MAX:
            for key in [k for k, (w, _) in _read_buckets.items() if w != window]:
                del _read_buckets[key]

        prev_window, count = _read_buckets.get(subject, (window, 0))
        count = count + 1 if prev_window == window else 1
        _read_buckets[subject] = (window, count)

    if count > limit_per_min:
        retry_after = max(1, _RATE_WINDOW_SECONDS - int(now % _RATE_WINDOW_SECONDS))
        logger.info("read rate limit hit: subject=%s count=%s limit=%s", subject, count, limit_per_min)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def reset_read_rate_limit() -> None:
    """Clear the in-process read counters. For tests — the module-level map would otherwise leak
    counts across cases."""
    with _read_lock:
        _read_buckets.clear()


def enforce_rate_limit(
    request: Request,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """FastAPI dependency applied to every ``/v1/*`` router (CRUD + the AI endpoints). Runs
    after auth, so the caller is always identified; keyed per user (per IP for dev fallback).

    Safe reads take the cheap in-process counter; everything that writes or costs money keeps the
    Postgres-backed one. See the module docstring for why the guarantees differ.
    """
    settings = get_settings()
    subject = _subject_key(user, request, settings)

    if request.method in _SAFE_METHODS:
        check_read_rate_limit(subject, settings.read_rate_limit_per_min)
        return

    check_rate_limit(session, subject, settings.rate_limit_per_min)


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
    """Append a usage row for a Claude call that has already been made (and therefore already
    cost money). Does NOT commit — but the caller MUST commit it immediately, on its own, and
    *before* the fallible persistence that follows. Metering is deliberately decoupled from
    persistence: if the row were committed atomically with the persisted output, any post-call
    failure (e.g. a foreign question_id → OwnershipError, a Storage/DB hiccup) would roll the
    meter back and let the spend cap be bypassed via unmetered paid calls (the High fixed in the
    2026-06-18 review, ADR 0009). The call cost money, so it is metered even if the request then
    fails — see the commit ordering in app/main.py."""
    session.add(
        AiUsageEvent(
            user_id=user_id,
            kind=kind,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
        )
    )
