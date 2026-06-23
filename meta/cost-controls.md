# Cost Controls (rate limit + Anthropic spend cap)

> Cross-references the canonical decision record in [`docs/adr/0009-pre-deploy-hardening.md`](../docs/adr/0009-pre-deploy-hardening.md).
> This file is the "why behind the why" for a future session with zero context. Builds on
> [auth-security-posture.md](auth-security-posture.md) (these are the cost-DoS controls deferred there).

## Decisions
- **Counters are Postgres-backed, not in-memory.** Both the rate-limit buckets and the spend-cap
  ledger live in Postgres (`rate_limit_buckets`, `ai_usage_events`), so the limits hold across
  multiple workers and survive restarts.
- **Spend cap is token-based, daily (UTC), per-user *and* global.** Exact token counts from the SDK
  `usage` (cache tokens folded into the input total); no per-model price table to maintain. Per-user
  bounds one abusive account; global bounds total blast-radius.
- **Rate limit covers *all* `/v1/*`**, not just the AI endpoints — one router-level dependency, fixed
  per-minute window, keyed per authenticated user (per-IP only for the shared dev-fallback identity).
- **Metering is committed *before* persistence, not atomically with it.** A paid Claude call's usage
  row is committed on its own the instant the call returns, before the deck/attempt is persisted.
- **Cost controls are mandatory in prod.** `check_production_config` refuses to boot `CRAM_ENV=prod`
  unless all three ceilings are `> 0` (alongside auth + secrets). Default-off everywhere else.
- **The rate limit must be sized for the sync client, not the wallet.** CRUD/sync requests cost zero
  Claude tokens — the budget is guarded solely by the token spend cap. So `CRAM_RATE_LIMIT_PER_MIN`
  should be generous (≥120); a too-low value (the early ~10) only throttles free traffic and breaks
  sync. The iOS client also self-limits (trailing throttle + `Retry-After` backoff) — see
  [ios-sync-client.md](ios-sync-client.md).
- **A paid generation is never discarded over a Storage hiccup.** `/v1/generate` persists the deck
  even if the Supabase Storage upload fails: `persist_generation` catches `StorageError`, logs it,
  and writes the source with empty `storage_paths`. The cards are the product; the stored file is
  secondary.

## Reasoning
- An in-memory limiter resets on restart and is per-worker, giving false confidence right when the
  service goes public — the exact scenario these controls exist for. Postgres makes them honest.
- **Why metering-before-persistence (the load-bearing subtlety).** The first cut committed the usage
  row in the same transaction as persistence. But persistence is fallible *after* the paid call:
  `/v1/grade` with a foreign/absent `question_id` raises `OwnershipError` → `422`, and a Storage/DB
  hiccup fails `/v1/generate`. In all those paths the transaction rolls back — **including the usage
  row** — so an attacker could spam grade with a bogus `question_id` and make unlimited *paid* calls
  that never count against the cap (a HIGH the 2026-06-18 security review caught). The rule is now:
  the call cost money, so it is metered even if the request then fails. This mirrors the rate
  limiter, which commits its increment immediately so a rejected request still counts as an attempt.
- Token-based over cost-based: the SDK gives exact tokens; a USD figure needs a per-model price
  constant that drifts. The ledger keeps enough to add cost/monthly views later without a migration.
- Rate-limiting CRUD too (not just AI) because a flood of owned-table writes still hammers the DB; the
  uniform router dependency means no route can forget it. **But** the limit guards the DB, not the
  wallet — so it can sit far above what the spend cap allows; conflating the two (a ~10/min limit
  "to save money") just starves the legitimate sync client, which needs ~16 requests per cycle.
- **Why degrade instead of fail on a Storage hiccup.** Metering commits before persistence precisely
  because the call already cost money — so failing the *whole* request after that (and throwing away
  the generated cards the user paid for) is the wrong posture. Originally a `StorageError` propagated
  uncaught as a bare `500`; now generate persists the deck without the file. Same principle as the
  metering rule: don't waste a paid call.

## Implications
- Two new backend-internal tables (not synced to iOS). `ai_usage_events` is owned (auth-FK + RLS like
  the domain tables); `rate_limit_buckets` is pure infra (no owner/FK/RLS). Both added in migration
  `0003`, which — like `0002` — needs the Supabase `auth` schema and can't run on a plain Postgres.
- The AI functions (`generate_deck`, `grade_answer`) now return `(payload, TokenUsage)` so the route
  can meter them; test fakes return the tuple too.
- The **global** spend sum is correct only because the backend connects as the table-owner role that
  *bypasses* the `ENABLE`d (not `FORCE`d) RLS. If the FORCE-RLS / non-owner-role idea (see auth
  posture open questions) is ever adopted, the owner policy would scope the global sum to `auth.uid()`
  and silently turn it into a second per-user cap — failing open on total spend. There's a comment at
  the call site flagging this.
- New deploys must set five things they didn't before (the three ceilings are new) — a deliberate
  trip-wire, documented in the `docs/SETUP.md` production checklist; the guard fails fast naming them.

## Open questions
- A monthly ceiling and/or USD cost view layered on the same ledger, if billing visibility needs it.
- Pruning `rate_limit_buckets` / aging out `ai_usage_events` (a scheduled `DELETE` or Supabase cron) —
  currently unbounded growth, fine at current volume.
- The spend cap's check-then-act window allows a bounded overshoot (in-flight requests); closing it
  fully (reserve-then-reconcile) isn't worth it for a single-tenant deploy. At a very small budget the
  overshoot can equal a month's spend, so the real backstop is an **out-of-app Anthropic Console hard
  limit** rather than tighter in-app logic — see [edge-and-budget-backstops.md](edge-and-budget-backstops.md).

## Last updated
2026-06-23
