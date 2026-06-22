# meta/ — Decision reasoning

The *why* behind how Cram is built — for a future developer or Claude session with zero context.
This complements (does not replace) the formal numbered decision record in
[`docs/adr/`](../docs/adr/): ADRs freeze the contracts/decisions; these files capture the reasoning,
trade-offs, and downstream constraints in one place.

| Topic | Summary |
|-------|---------|
| [auth-security-posture.md](auth-security-posture.md) | Fail-closed auth defaults, server-side JWT (ES256/JWKS; HS256 dev-only + JWKS required at boot; claim-presence enforced), app-layer ownership (RLS as defense-in-depth), minimal `/healthz`, deferred cost-DoS controls. Cross-refs ADR 0005–0008. |
| [ios-auth-client.md](ios-auth-client.md) | **Client side of auth.** iOS signs in with the `supabase-swift` SDK (Keychain + auto-refresh kept as default), sends `Authorization: Bearer <jwt>` (drops `X-Cram-Secret`); token fetched per-request, never cached; auth gate only when configured; HTTPS-only bearer, enumeration-safe errors, local-scope sign-out fallback. Cross-refs ADR 0007/0008. |
| [data-layer-and-sync.md](data-layer-and-sync.md) | Phase 3 structure: single owner-scoped repository, parent-steal/id-squat defenses, compound keyset delta cursor, app-code soft-delete cascade, router factory. Cross-refs ADR 0007/0008. |
| [cost-controls.md](cost-controls.md) | Phase 4: Postgres-backed per-caller rate limit + token-based per-user/global daily spend cap; why metering commits before persistence (a spend-cap-bypass fix); prod-config guard. Cross-refs ADR 0009. |
| [edge-and-budget-backstops.md](edge-and-budget-backstops.md) | Security layers the app can't enforce: reverse proxy (body/flood ingestion) + Anthropic Console hard cap (spend) as mandatory out-of-app backstops; chosen prod cap values; floors-vs-lockfile. From the 2026-06-18 pre-deploy audit. |
| [deployment.md](deployment.md) | **LIVE on Railway (2026-06-19).** Host = Railway Hobby; the M1 reverse proxy (nginx) is baked into the container in front of uvicorn so the body/flood cap holds portably; why Vercel/Render were rejected for the backend; deploy packaging in `backend/`; go-live boot bugs (Railway quote-stripping, nginx duplicate-directive). Cross-refs ADR 0009. |
