# Auth & Security Posture

> Cross-references the canonical ADRs in `docs/adr/` (the repo's numbered decision record).
> This file is the "why behind the why" for a future session with zero context. Formal
> contracts live in ADR 0005/0006/0007/0008/0009. The cost-DoS controls deferred here shipped in
> Phase 4 — see [cost-controls.md](cost-controls.md).

## Decisions
- **Auth defaults fail closed.** The dev loopback fallback (serve unauthenticated loopback as a
  fixed dev user) is **opt-in** via `CRAM_ALLOW_DEV_FALLBACK` (default off), not opt-out. (ADR 0008)
- **Prod boot is guarded.** The app refuses to start if `CRAM_ENV=prod` and either auth is
  unconfigured or `CRAM_ALLOW_DEV_FALLBACK` is set. (ADR 0007/0008)
- **Supabase JWT, verified server-side, asymmetric.** Tokens are ES256, verified against the project
  JWKS endpoint (`…/auth/v1/.well-known/jwks.json`); algorithms are pinned (RS256/ES256 for JWKS,
  HS256 only on the legacy-secret path), audience (`authenticated`) + issuer + exp enforced.
- **Ownership is enforced in app code, not the database.** RLS is `ENABLE`d (defense-in-depth for the
  disabled Data API) but the backend connects as the table-owner role and **bypasses** it.
- **Cost-DoS controls shipped in Phase 4** (were deferred on purpose — a real Anthropic spend cap
  needs persistence-backed usage tracking, which arrived with Phase 3). Postgres-backed per-caller
  rate limit + token-based per-user/global daily spend cap + reverse-proxy body cap, all mandatory in
  prod. See [cost-controls.md](cost-controls.md) and ADR 0009.
- **Secrets are server-side only and never committed.** `.env` is gitignored; only `.env.example`
  (blank placeholders) ships. The Claude key, Supabase service-role key, and DB creds live in `.env`.

## Reasoning
- Safety that depends on remembering to *opt out* of an unsafe mode (e.g. setting `CRAM_ENV=prod`)
  will eventually fail when someone forgets. Behind a same-host reverse proxy every request looks
  like loopback, so an opt-out fallback = silent full auth bypass. Inverting it to opt-in makes the
  forgotten-config case refuse traffic instead of trusting it.
- JWKS over a shared HS256 secret avoids a symmetric secret on the server and supports key rotation;
  pinning algorithms per-path closes the classic HS/RS confusion. A JWKS fetch failure is treated as
  an auth failure (clean 401, logged) rather than a 500 — no stack-trace leak, no outage masquerade.
- RLS can't protect the backend's own queries because the service role owns the tables, so leaning on
  RLS would be a false sense of safety. The honest model is: app-layer ownership is the real gate,
  RLS is a backstop only for an accidental anon/authenticated direct path (and the Data API is off).

## Implications
- Local dev without Supabase requires one documented opt-in line (`CRAM_ALLOW_DEV_FALLBACK=1`).
- **Phase 3 hard constraint:** every data query is ownership-scoped through a single helper, with
  cross-user isolation tests as an acceptance gate. One missed `WHERE user_id = …` is a cross-user
  leak with no DB backstop. Soft-delete must set `deleted_at` on descendants (a hard ORM cascade
  emits no child tombstones → ghost rows on offline clients).
- **Phase 4 delivered** the per-caller rate limit + Anthropic spend cap + hard reverse-proxy body
  cap, plus a prod-config guard that refuses to boot without them — the public-deploy gate is closed
  (cost-controls.md, ADR 0009).
- The `SUPABASE_JWKS_URL` must be the JWKS **endpoint URL**, not an API key — a mis-paste there
  silently fails every token (caught this session).

## Open questions
- Add a dedicated non-owner DB role + `FORCE ROW LEVEL SECURITY` so the database enforces ownership
  as a second layer behind the app checks? (Note: this would also break the spend cap's global token
  sum — see cost-controls.md — so revisit both together.)
- Phase 4 thresholds are now configurable env vars (`CRAM_RATE_LIMIT_PER_MIN`,
  `CRAM_{USER,GLOBAL}_DAILY_TOKEN_CAP`); the concrete production values still need to be chosen per
  the real Anthropic budget.

## Last updated
2026-06-18
