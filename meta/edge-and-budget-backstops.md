# Edge & Budget Backstops (security layers outside the app)

> The "why behind the why" for a future session. Companion to
> [cost-controls.md](cost-controls.md) and [auth-security-posture.md](auth-security-posture.md);
> formal contracts in ADR 0009. Written after the 2026-06-18 pre-public-deploy security audit
> (no Critical/High; the two residual Mediums were both *operational*, not code).

## Decisions
- **The reverse proxy is a mandatory security layer, not optional polish.** Every in-app guard
  (JWT auth, rate limit, spend cap, per-file/total caps) runs *after* the request body is received,
  so they cannot protect the body-ingestion layer itself. The proxy's hard body cap (`~36m`) **and**
  a coarse per-IP request/connection limit are the only defense there. "Proxy configured" is a hard
  deploy-gate, checked by a human — the `CRAM_ENV=prod` startup guard does **not** (and cannot) verify
  it.
- **The Anthropic Console hard monthly limit is the real spend backstop; the app caps are first-line,
  not last-line.** A no-auto-recharge Console cap (set by the owner 2026-06-18) is what actually
  bounds worst-case spend. The in-app daily token caps reduce the chance of ever reaching it, but the
  Console limit is the thing that makes a runaway financially impossible.
- **Production cap values are chosen** (resolves the open question in auth-security-posture.md). For
  the current $5/mo budget: `CRAM_GLOBAL_DAILY_TOKEN_CAP=35000`, `CRAM_USER_DAILY_TOKEN_CAP=35000`
  (solo → user = global so a single legitimate user isn't double-throttled),
  `CRAM_RATE_LIMIT_PER_MIN` kept low (~10). These live on the deploy **host**, never in the local
  `.env` (the prod guard would otherwise break local dev).
- **Dependencies are pinned for prod via a separate lockfile.** `backend/requirements.txt` keeps
  human-readable floors (`>=`, with the security-relevant ones annotated); `backend/requirements.lock`
  (`pip freeze`) is the reproducible, fully-pinned set deploys install from.

## Reasoning
- **Why the proxy is load-bearing.** FastAPI parses (and spools to disk) the multipart body *before*
  dependency resolution, and the `Content-Length` middleware is bypassable by chunked transfer
  encoding. So an *unauthenticated* client can make the server ingest a large body before the 401.
  Claude is never called pre-auth (no cost-DoS), but it's a real resource-exhaustion vector that only
  the edge can stop. The honest model: the app secures *logic and data*; the proxy secures *ingestion*.
- **Why the Console limit is decisive.** The spend cap is check-then-act: a burst of up to
  `CRAM_RATE_LIMIT_PER_MIN` concurrent authed calls all pass the pre-call check before the first usage
  row commits, so one minute can overshoot the daily cap by ~`rate_limit × per-call tokens`. ADR 0009
  accepted this as "bounded, fine for single-tenant" — true for generous caps, but at a $5/mo budget
  one bad minute could equal a month. Closing the race in-app (reserve-then-reconcile / row locks)
  isn't worth it for this scale; a hard out-of-band Console cap neutralizes the *consequence* instead,
  which is simpler and strictly safer.
- **Why a lockfile in addition to floors.** Floors get security patches automatically but also auto-
  pull any future (possibly compromised) release and aren't reproducible. A committed lockfile gives
  deterministic, auditable prod installs without losing the readable floor list for humans.

## Implications
- Deploy is gated on **two human-verified, out-of-app** steps that no test or startup check enforces:
  (1) proxy body cap + per-IP limit, (2) Console hard spend limit. Put both on the deploy checklist.
- Open public signup means anyone who registers shares `CRAM_GLOBAL_DAILY_TOKEN_CAP`. For a personal
  deploy, consider a signup allowlist (or keep signup closed) so the global budget isn't a public
  resource. Tracked as an open question, not yet decided.
- The lockfile must be regenerated when `requirements.txt` floors change, or it silently drifts.

## Open questions
- Signup allowlist vs. open registration for the public deploy (budget-sharing exposure above).
- Whether to add hash pinning (`--require-hashes`) to the lockfile for stronger supply-chain integrity.
- Revisit the spend-cap race only if this ever becomes multi-tenant at scale (see cost-controls.md).

## Last updated
2026-06-18
