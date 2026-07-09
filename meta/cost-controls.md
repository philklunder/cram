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
- **~~Counters are Postgres-backed~~ … for writes and the AI endpoints only; safe reads are counted
  in-process (2026-07-09).** `enforce_rate_limit` now branches on HTTP method. POST/PATCH/DELETE and
  the paid `/v1/generate` + `/v1/grade` keep the Postgres-backed counter unchanged. GET/HEAD use a
  separate, much higher in-process ceiling (`CRAM_READ_RATE_LIMIT_PER_MIN`, default 240) and perform
  **no database write at all**. Both routers still get the one uniform dependency, so no route can
  forget it.
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
- **Prompt caching is on for generation only, and mostly writes (by design).** `generation.py`
  passes top-level `cache_control={"type":"ephemeral"}` (automatic caching — breakpoint on the last
  cacheable block); `grading.py` deliberately omits it. `TokenUsage.from_usage` folds
  `cache_creation`/`cache_read` into the billed input total so the spend cap reflects real spend.
- **`rate_limit_buckets` is pruned lazily in-process, not by an external cron (2026-07-06).**
  ADR 0009 documented the sweep (`DELETE … WHERE window_start < now()-'1h'`) but never scheduled it,
  so the table grew one row per (subject, minute) forever. `_maybe_prune_buckets` in `limits.py`
  runs the delete opportunistically from `check_rate_limit`, self-throttled to once per hour per
  process via an in-process monotonic timestamp, and is best-effort (any failure is logged +
  swallowed, never breaks the triggering request). Retention = 1h of counters. **Since 2026-07-09
  `check_rate_limit` runs only on writes/AI calls, so the sweep is driven by writes** — which is also
  the only thing that creates a bucket row, so it still self-cleans; a read-only session simply never
  needs to prune.

## Reasoning
- An in-memory limiter resets on restart and is per-worker, giving false confidence right when the
  service goes public — the exact scenario these controls exist for. Postgres makes them honest.
- **Why reads were then exempted from that rule (2026-07-09).** The Postgres counter charged every
  request an `INSERT … ON CONFLICT DO UPDATE` plus an immediate `COMMIT` — including cheap `GET`s.
  Worse, all of one user's concurrent reads target the *same* `(subject, minute)` bucket row, so they
  serialised on its row lock: the limiter meant to protect the DB was itself the per-request cost.
  The honesty argument above still applies with full force to anything that **writes, or costs money** —
  so that path is unchanged. It does *not* apply to a read, which is idempotent, owner-scoped and
  free: the worst a client gains from a per-worker counter is reading its own rows faster. Reads also
  are not undefended — nginx applies a per-IP `limit_req` (10 r/s) + `limit_conn` in front of the app
  (see [edge-and-budget-backstops.md](edge-and-budget-backstops.md)), which is what actually blunts an
  unauthenticated flood. The in-process counter is deliberately **not** to be extended to the
  mutating/AI path, whose cap guards real money.
- Pressure on the limiter also dropped sharply the same day for an unrelated reason: the web client
  went from ten requests per page load to one (see
  [read-path-performance.md](read-path-performance.md)), so the read ceiling is now generous by a wide
  margin rather than a thing users bump into.
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
- **Why the prompt cache mostly writes and rarely reads (and why that's fine).** Caching is a
  prefix match; a read only lands on a repeat of the *same* prefix within the 5-min TTL. On
  `claude-sonnet-4-6` (`CRAM_MODEL` default) the minimum cacheable prefix is **2048 tokens**. In
  generation the *stable* prefix (`SYSTEM_PROMPT` ~500 tok + user text) is well under that floor, so
  it can't be cached on its own — only the whole prefix (system + text + the large uploaded files)
  clears 2048, and every upload is unique, so production sees cache *writes* but almost no *reads*
  (the Anthropic Console shows caching "configured but idle"). This is expected, not a regression:
  it's a dev/retry win only. Grading omits caching because its entire prompt sits under the 2048-token
  floor — the marker would silently no-op. Getting real cross-request reads would need a ≥2048-token
  shared prefix (not worth padding a prompt for) or a model with a lower floor (Sonnet 4.5 = 1024).

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
- **`CRAM_RATE_LIMIT_PER_MIN` is now a *write* ceiling, which makes an under-sized value bite harder,
  not softer.** It no longer has reads padding it, but the ratio that matters got worse: a review
  session writes **two** rows per card (`PATCH /v1/cards` + `POST /v1/review-logs`), so a value of
  ~10/min throttles a user to ~5 cards a minute. The "size it for the sync client, not the wallet"
  rule above (≥120) is therefore load-bearing, not advisory. `check_production_config` additionally
  requires `CRAM_READ_RATE_LIMIT_PER_MIN > 0`; it defaults to 240, so an existing deploy that never
  sets it still boots (verified).
- The read ceiling is per uvicorn worker and resets on restart. The deploy runs `--workers 1`
  (`deploy/entrypoint.sh`), so today that equals per-container; with N workers a client could read
  N× the ceiling. Acceptable for reads by construction — and a reason not to scale workers without
  revisiting this.

## Open questions
- A monthly ceiling and/or USD cost view layered on the same ledger, if billing visibility needs it.
- ~~Pruning `rate_limit_buckets`~~ **done 2026-07-06** — lazy in-process sweep (see Decisions).
  Aging out `ai_usage_events` is still unbounded (append-only ledger); fine at current volume, but a
  scheduled `DELETE`/Supabase cron would be the move if it ever grows. The bucket prune's in-process
  throttle is per-worker, so multiple workers would each sweep hourly — harmless (idempotent delete),
  but revisit if the deploy ever scales past one uvicorn worker.
- The spend cap's check-then-act window allows a bounded overshoot (in-flight requests); closing it
  fully (reserve-then-reconcile) isn't worth it for a single-tenant deploy. At a very small budget the
  overshoot can equal a month's spend, so the real backstop is an **out-of-app Anthropic Console hard
  limit** rather than tighter in-app logic — see [edge-and-budget-backstops.md](edge-and-budget-backstops.md).
- **Confirm the live `CRAM_RATE_LIMIT_PER_MIN` in Railway.** The session notes recall it being set to
  ~10 (chosen when it still throttled reads, on the mistaken theory that it saved money); that value
  now only throttles writes, where it is actively harmful (see Implications). It should be ≥120.
- If the write limiter ever needs the same latency treatment the read one got, the move is a single
  non-blocking upsert (no `COMMIT` on the request path) or a Redis counter — **not** an in-process
  map, which would forfeit exactly the guarantee that makes it worth having.

## Last updated
2026-07-09
