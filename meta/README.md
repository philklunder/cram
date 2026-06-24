# meta/ — Decision reasoning

The *why* behind how Cram is built — for a future developer or Claude session with zero context.
This complements (does not replace) the formal numbered decision record in
[`docs/adr/`](../docs/adr/): ADRs freeze the contracts/decisions; these files capture the reasoning,
trade-offs, and downstream constraints in one place.

| Topic | Summary |
|-------|---------|
| [auth-security-posture.md](auth-security-posture.md) | Fail-closed auth defaults, server-side JWT (ES256/JWKS; HS256 dev-only + JWKS required at boot; claim-presence enforced), app-layer ownership (RLS as defense-in-depth), minimal `/healthz`, deferred cost-DoS controls. Cross-refs ADR 0005–0008. |
| [ios-auth-client.md](ios-auth-client.md) | **Client side of auth.** iOS signs in with the `supabase-swift` SDK (Keychain + auto-refresh kept as default), sends `Authorization: Bearer <jwt>` (drops `X-Cram-Secret`); token fetched per-request, never cached; auth gate only when configured; HTTPS-only bearer, enumeration-safe errors, local-scope sign-out fallback. Cross-refs ADR 0007/0008. |
| [data-layer-and-sync.md](data-layer-and-sync.md) | **Backend** Phase 3 structure: single owner-scoped repository, parent-steal/id-squat defenses, compound keyset delta cursor, app-code soft-delete cascade, router factory. Cross-refs ADR 0007/0008. |
| [ios-sync-client.md](ios-sync-client.md) | **Client side of sync (v0.5 Phase 5).** Offline-first, last-writer-wins, push-then-pull; sync metadata + `touch()`/`softDelete()` on the models; tombstone deletes; generated decks adopt server ids (de-dup); per-user cursors + user-switch wipe; trailing throttle + `Retry-After` 429 backoff. File-bytes not synced. Cross-refs ADR 0007/0008. |
| [cost-controls.md](cost-controls.md) | Phase 4: Postgres-backed per-caller rate limit + token-based per-user/global daily spend cap; why metering commits before persistence (a spend-cap-bypass fix); why the rate limit guards the DB not the wallet (size it for the sync client); generate degrades (keeps the deck) on a Storage hiccup; prod-config guard. Cross-refs ADR 0009. |
| [edge-and-budget-backstops.md](edge-and-budget-backstops.md) | Security layers the app can't enforce: reverse proxy (body/flood ingestion) + Anthropic Console hard cap (spend) as mandatory out-of-app backstops; chosen prod cap values; floors-vs-lockfile. From the 2026-06-18 pre-deploy audit. |
| [deployment.md](deployment.md) | **LIVE on Railway (2026-06-19).** Host = Railway Hobby; the M1 reverse proxy (nginx) is baked into the container in front of uvicorn so the body/flood cap holds portably; why Vercel/Render were rejected for the backend; deploy packaging in `backend/`; go-live boot bugs (Railway quote-stripping, nginx duplicate-directive). Cross-refs ADR 0009. |
| [web-dashboard.md](web-dashboard.md) | **Web client (v0.6), built on the `web` branch.** Next.js "study desk": scope = browse/upload/progress (review+grade stay iOS-primary); direct browser→backend Bearer JWT (mirrors iOS, not a BFF); `@supabase/ssr` cookie auth + `getUser()` server gate; client-side fetch+filter over the delta endpoints; zero extra deps (local `cn`, system font). Forced the backend's env-driven `CRAM_CORS_ORIGINS` allowlist (default closed, credentials off). Cross-refs ADR 0005/0007/0008. |
