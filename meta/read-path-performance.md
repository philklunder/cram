# Read-path performance (aggregate snapshot + client cache)

> The web client's read path, reworked 2026-07-09. Complements
> [web-dashboard.md](web-dashboard.md) (what the web client *is*) and
> [data-layer-and-sync.md](data-layer-and-sync.md) (the delta contract this deliberately does not touch).

## Decisions
- **Diagnosis first: the infrastructure was not the problem.** Railway's edge serves from `ams1`,
  Supabase sits in `eu-central-2`, and `/healthz` TTFB measured ~90 ms. No hosting move, no region
  change, no database migration. Everything below is code.
- **`GET /v1/dashboard` returns the caller's whole live working set in one payload.** A read-only
  aggregate (`routers.build_dashboard_router` → `api_schemas.DashboardRead` →
  `repository.list_live`) over all ten owned resources.
- **The per-resource delta endpoints are untouched.** They remain the sync contract iOS depends on.
  The aggregate is a *convenience view*, explicitly not part of that contract.
- **The aggregate excludes tombstones; a delta pull still includes them.** A dashboard renders live
  rows; a replica converges. Different jobs, different filters.
- **The web client now serves every list read from one cached snapshot.** `web/src/lib/api/cache.ts`
  keys it under a single entry, shares in-flight requests, reuses a settled result for a 60 s TTL,
  and evicts on rejection so a failure retries.
- **Loader signatures were preserved rather than the call sites rewritten.** `loadDashboard`,
  `loadLibrary`, `loadSubjectBundle`, `getSubject` and every `list*` helper now slice the snapshot,
  so *no component changed*.
- **Any write drops the whole snapshot** rather than invalidating per resource; sign-out calls
  `clearApiCache()`.
- **Responses are gzipped in the application, not in nginx.**
- **The rate limiter is split by HTTP method** — see [cost-controls.md](cost-controls.md), where that
  decision (an amendment to ADR 0009) lives.
- **Connection pool raised** to `pool_size=10, max_overflow=10, pool_recycle=1800`.

## Reasoning
- **Why the fan-out was the bottleneck.** Rendering the dashboard cost ten HTTP requests: nine
  `loadDashboard` pulls plus a tenth from `SidebarStreak`, which fetched review-logs independently on
  *every* page because it lives in the sidebar. Each request separately paid auth, a rate-limit
  Postgres write, a `pool_pre_ping` round trip and a connection checkout — and nothing was cached, so
  Dashboard → Review → Progress re-pulled the same tables three times. Measured on loopback (network
  RTT ≈ 0), collapsing nine requests into one was **2.7× faster server-side**; in production each of
  those nine also paid a browser→Railway round trip that the aggregate now pays once.
- **Why cache at `pageAll`, then at the snapshot.** Every list read already funnelled through one
  function. Caching at that chokepoint fixed ten pages without touching a component — and once the
  aggregate existed, the same property let the whole client move onto it behind unchanged signatures.
  The duplicate review-logs fetch disappeared as a *side effect* rather than needing its own fix.
- **Why drop the whole snapshot on any write.** It is one cache entry; per-resource invalidation would
  be finer-grained bookkeeping with no benefit, and would have to model the server-side soft-delete
  cascade (deleting a subject tombstones its exams, sources, cards, quizzes, questions and grade
  entries) to stay correct. Coarse and obviously-correct beats clever here.
- **Why the cache must clear on sign-out.** It is module-level state in a long-lived tab. Without
  `clearApiCache()`, a second user signing in on the same tab would read the first user's rows — the
  client-side mirror of the ownership invariant the repository enforces server-side.
- **Why gzip in the app and not nginx.** Two independent traps. (1) `gzip on` already lives in the
  stock Debian `nginx.conf` `http{}` block that `deploy/nginx.conf.template` is included into, and
  re-declaring a directive already set there is the `[emerg]` duplicate-directive boot crash — the
  same trap `server_tokens` hit (see [deployment.md](deployment.md)). (2) Stock nginx compresses only
  `text/html` and will not touch *proxied* responses without `gzip_proxied`, so an nginx-side setting
  would have looked enabled while doing nothing for our JSON. Compressing in the app is proxy-
  independent; nginx passes the encoded body through untouched. Measured **16.8×** on a 300-card
  payload (165 KB → 9.8 KB).
- **Why `list_live` is unpaged.** It returns exactly what the client previously assembled by paging
  every resource itself — one user's own data. Paging it would reintroduce the round trips this
  removes. It is owner-scoped via `_owned()` like every other read, so the ownership invariant holds.
- **Why the pool was starving.** SQLAlchemy's defaults (`pool_size=5`) meant a ten-request burst
  exhausted the pool and opened *fresh* connections — each a TCP + TLS handshake to the Supabase
  pooler on the request's critical path, then discarded when the overflow connection was returned.

## Implications
- **Deploy the backend before the web.** The web client now reads only from `/v1/dashboard`; a Vercel
  deploy landing before Railway has the endpoint means every authenticated page fails. This is a hard
  ordering constraint, not a preference.
- The aggregate's payload grows linearly with a user's whole library, and is fetched even by pages
  that need a slice of it (Settings triggers it via the sidebar streak). At current scale that is one
  gzipped request; if a user's library ever gets large, the fix is a narrower endpoint or a
  `?include=` filter — not a return to the fan-out.
- Cross-device staleness is bounded by the 60 s TTL: a change made on iOS shows up in an open web tab
  within a minute, or immediately after any local write. Previously every navigation refetched.
- `repository.list_live` is a new read path over owned tables, so it carries the same load-bearing
  ownership requirement as the rest of the repository. `tests/test_dashboard.py` asserts cross-user
  isolation directly, alongside tombstone exclusion and agreement with the delta endpoints.
- `pool_size + max_overflow = 20` connections per worker is well under the Supabase pooler's
  allowance, but is now a number to keep in mind if the deploy ever scales past one uvicorn worker.

## Gotchas worth not rediscovering
- **Starlette's `add_middleware` does `user_middleware.insert(0, …)`, so the LAST middleware added is
  the OUTERMOST.** (The comment in `main.py` asserting the opposite was wrong.) Combined with the fact
  that `@app.middleware("http")` registers a `BaseHTTPMiddleware`, which re-emits every response as a
  *stream*: gzip registered *after* `limit_body_size` sat outside it, saw `more_body=True` on the
  first chunk, and thereby **silently skipped its own `minimum_size` check** — compressing a 13-byte
  `/healthz` up to 31 bytes and forcing chunked transfer by dropping `Content-Length`. `GZipMiddleware`
  must be registered **before** that decorator so it is innermost and sees complete responses. Verify
  with `[m.cls.__name__ for m in app.user_middleware]` (index 0 = outermost).
- `app.routes` does **not** flatten included routers in this FastAPI version (they appear as
  `_IncludedRouter`, with no `.path`). Check `app.openapi()["paths"]` instead.
- `pytest`'s session fixture **drops the schema on teardown**, so a long-lived local uvicorn pointed at
  the same test database starts returning `500 relation "subjects" does not exist` after a test run.

## Open questions
- The `getSubject`/`loadSubjectBundle` 404 for an unknown id is now derived from the snapshot rather
  than a server 404. Equivalent for tombstoned/foreign ids (both read as absent), but it means a
  subject created on another device 404s until the TTL lapses.
- A composite `(user_id, updated_at, id)` index is the right shape for both `list_live` and
  `list_delta` (today `user_id` and `updated_at` are indexed separately, so Postgres filters then
  sorts). Worth nothing at current scale; do it when the tables grow.
- The in-process read limiter and the snapshot TTL are both per-process/per-tab. Neither survives a
  scale-out to multiple workers with the same semantics — see cost-controls.md.

## Last updated
2026-07-09
