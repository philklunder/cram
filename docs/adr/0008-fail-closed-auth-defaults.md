# ADR 0008 — Fail-closed authentication defaults

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

ADR 0007 made Supabase JWT the auth gate for `/v1/*` and kept a **dev convenience**: when no auth is
configured, loopback requests are served as a fixed dev user so local work needs no Supabase. A v0.5
security review found this convenience could **fail open**: behind a same-host reverse proxy the
backend sees every request as loopback (`127.0.0.1`), so an unauthenticated caller would be served as
the dev user. The only thing preventing that was the `CRAM_ENV=prod` startup guard — but `CRAM_ENV`
**defaults to `dev`**, so the safety depended on an operator remembering to set an env var at deploy
time. The same review surfaced two adjacent issues: a JWKS resolution failure (bad `kid`, or an
unreachable Supabase JWKS endpoint) escaped as an uncaught `500` with a stack trace instead of a
clean `401`; and the deferred cost-DoS controls (rate limit / Anthropic spend cap) had no home in
the plan beyond "later."

## Decision

**Security-relevant defaults must fail closed — safety cannot depend on remembering to opt *out* of
an unsafe mode.** Concretely:

1. **The dev loopback fallback is opt-in, not opt-out.** A new `CRAM_ALLOW_DEV_FALLBACK` flag
   (default **off**) gates it; the fallback is served only when the flag is set **and** the request
   is loopback **and** no JWT auth is configured. Forgetting `CRAM_ENV=prod` now fails closed (a
   tokenless request is refused) instead of open. The startup guard additionally **refuses to boot**
   if `CRAM_ALLOW_DEV_FALLBACK` is set together with `CRAM_ENV=prod`.

2. **Auth verification never leaks via an unhandled error.** `PyJWKClientError` is caught and mapped
   to a client-safe `401` (the real reason is logged server-side), matching the existing "generic
   client error, no upstream detail" pattern (ADR 0005/0006). A transient JWKS outage or a forged
   `kid` is an auth failure, not a `500`.

3. **Ownership enforcement is app-layer; RLS is defense-in-depth only (reaffirmed).** The backend
   connects as the table-owner role, which **bypasses** the `ENABLE`d (not `FORCE`d) RLS policies.
   So RLS does **not** protect the backend's own queries — every Phase 3 query must be ownership-
   scoped in code, routed through a single owner-scoped helper, with cross-user isolation asserted in
   tests. This is the load-bearing security invariant for Phase 3.

4. **Cost-DoS controls are deferred to Phase 4 deliberately, not bodged.** A real Anthropic spend cap
   needs the usage tracking that arrives with persistence; an in-memory rate limiter now would reset
   on restart and give false confidence. Rate limit + spend cap + a hard reverse-proxy body cap land
   together in Phase 4, before any public deploy.

## Consequences

- Local development without a Supabase project now requires `CRAM_ALLOW_DEV_FALLBACK=1` in `.env` —
  a one-line, documented opt-in (`.env.example`). The trade-off (slightly less convenient locally)
  buys a default-safe production posture.
- A misconfigured or down JWKS endpoint degrades to "all logins rejected with 401" rather than a
  crash with a stack trace — observable in logs, never leaked to clients.
- Phase 3 carries an explicit, non-negotiable constraint: ownership in code, not in the database.
  A single forgotten `WHERE user_id = …` is a cross-user data leak with no RLS backstop, so the
  owner-scoped query helper is a Phase 3 acceptance gate, not a nicety.
- The deferred hardening from ADR 0005/0006 (O1 rate limit / spend cap, M1 body cap) is now owned by
  Phase 4 with concrete acceptance criteria, rather than floating as "pre-deploy, someday."

## Open questions

- Whether to additionally run the app under a dedicated non-owner DB role with `FORCE ROW LEVEL
  SECURITY`, so the database enforces ownership as a second layer behind the app-layer checks.
- The pass/spend thresholds for Phase 4 (per-user rate, daily/monthly token-or-cost ceiling).
