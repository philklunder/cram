# ADR 0009 — Pre-deploy hardening: rate limit, spend cap, body cap, prod guard

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

ADR 0008 §4 deferred the cost-DoS controls to v0.5 Phase 4 *deliberately* — a real Anthropic spend
cap needs the per-call usage tracking that only arrives with persistence (Phase 3), and an in-memory
rate limiter would reset on restart and give false confidence. Phase 3 is now done, so the deferred
controls have a home. The open questions from ADR 0008 (the spend/rate thresholds, and whether to add
a second DB-enforced ownership layer) are settled or scoped here.

The endpoints to protect are the two metered Claude calls (`/v1/generate`, `/v1/grade`) plus the
eight CRUD/sync resources under `/v1/*`. Auth (ADR 0007/0008) already gates them, but an
*authenticated* user can still drive unbounded cost, and a flood of CRUD writes can still hammer the
DB. Before any public deploy these need ceilings.

## Decision

Four controls land together, all **default-disabled** so dev/local is unaffected, and all
**mandatory in production** (the fail-closed posture of ADR 0008, extended to cost).

1. **Per-caller rate limit on all `/v1/*` routes.** A fixed per-minute request ceiling
   (`CRAM_RATE_LIMIT_PER_MIN`, default 60; `0` disables) enforced as one router-level FastAPI
   dependency, so every CRUD and AI route is covered uniformly. The counter is **Postgres-backed**
   (`rate_limit_buckets`, one row per `(subject, minute)`), bumped with an atomic
   `INSERT … ON CONFLICT DO UPDATE … RETURNING` and committed immediately — so it holds across
   multiple workers/restarts and counts an attempt even if the request later fails. Keyed per
   authenticated user (`user:<uuid>`); the shared dev-fallback identity falls back to per-IP
   (`ip:<addr>`), trusting `X-Forwarded-For` only behind `CRAM_TRUSTED_PROXY`. Over the limit ⇒ `429`
   with `Retry-After`.

2. **Anthropic spend cap — token-based, daily, per-user *and* global.** Each successful Claude call
   appends an `ai_usage_events` row (input+output+cache tokens). Before a call, the route sums
   today's tokens (UTC day) and refuses with `429` if either `CRAM_USER_DAILY_TOKEN_CAP` or
   `CRAM_GLOBAL_DAILY_TOKEN_CAP` is reached — **the refusal happens before any spend is incurred**.
   Token-based (exact from the SDK `usage`) was chosen over cost-based so there is no per-model price
   table to keep in sync; per-user *and* global so one abusive account is bounded *and* total
   blast-radius is bounded.

3. **Hard reverse-proxy body cap (M1).** The in-process body caps in `app/main.py` are
   defense-in-depth; the authoritative hard cap belongs at the edge so an oversized/chunked upload
   never reaches a worker. Documented with ready-to-use nginx/Caddy/Traefik snippets
   (`backend/deploy/reverse-proxy.example.conf`, `docs/SETUP.md`), sized just above
   `CRAM_MAX_TOTAL_BYTES`.

4. **Production startup guard (prod checklist).** `check_production_config` (in `config.py`, so it is
   unit-testable) consolidates the ADR 0008 guards and adds the Phase 4 ones: when `CRAM_ENV=prod`
   the app **refuses to boot** unless auth is configured, the dev fallback is off, `ANTHROPIC_API_KEY`
   and `DATABASE_URL` are set, **and** all three ceilings are `> 0`. An unmetered public endpoint to a
   paid LLM is an open wallet, so booting prod without a spend cap is treated as a misconfiguration,
   not a choice.

The spend cap's check-then-act window (sum, then call, then record) is **intentionally tolerated**
for this single-tenant deploy: a concurrent burst can overshoot a cap by at most the in-flight
requests' tokens. Closing it fully (reserve-then-reconcile, or a serializable transaction) is not
worth the complexity here.

**Metering is committed before persistence, not atomically with it** (corrected after the
2026-06-18 security review). The usage row for a paid call is committed on its own *immediately*
after the Claude call returns, *before* the fallible deck/attempt persistence. An earlier draft
committed usage in the same transaction as persistence, which let the cap be bypassed: a
`/v1/grade` call with a foreign/absent `question_id` paid for the call, then raised
`OwnershipError` (422) on persist, rolling back the still-uncommitted usage row — unmetered paid
calls, bounded only by the rate limit. The rule is now: **the call cost money, so it is metered
even if the subsequent persistence fails** (the caller gets a 4xx/5xx but the meter is not
"refunded"). Regression test: `test_paid_call_is_metered_even_when_attempt_persist_fails`.

## Consequences

- New backend-internal tables `ai_usage_events` (owned; auth-FK + RLS like the domain tables) and
  `rate_limit_buckets` (infra; no owner/FK/RLS), added in migration `0003`. Neither is exposed
  through the sync API. As with `0002`, autogenerate will want to drop the cross-schema auth FK —
  discard that diff.
- The two AI functions now return `(payload, TokenUsage)` so the route can meter them; call sites and
  the test fakes are updated accordingly.
- Production deploys must now set five things they didn't before (the three ceilings being new). This
  is a deliberate trip-wire: the deploy checklist in `docs/SETUP.md` lists them and the app fails fast
  with the exact missing keys.
- Caps are token-based and per-day in UTC; a "monthly" or cost-based ceiling can be layered later by
  widening the same `ai_usage_events` sum (the ledger already supports it).

## Open questions

- A monthly ceiling and/or cost (USD) conversion on top of the daily token cap, if billing visibility
  needs it.
- Pruning `rate_limit_buckets` / aging out `ai_usage_events` (a scheduled `DELETE`, or a Supabase cron)
  — currently unbounded growth, fine at current volume.
- The ADR 0008 open question (a dedicated non-owner DB role with `FORCE ROW LEVEL SECURITY`) remains
  open; unchanged by this ADR.
