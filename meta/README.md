# meta/ — Decision reasoning

The *why* behind how Cram is built — for a future developer or Claude session with zero context.
This complements (does not replace) the formal numbered decision record in
[`docs/adr/`](../docs/adr/): ADRs freeze the contracts/decisions; these files capture the reasoning,
trade-offs, and downstream constraints in one place.

| Topic | Summary |
|-------|---------|
| [auth-security-posture.md](auth-security-posture.md) | Fail-closed auth defaults, server-side JWT (ES256/JWKS), app-layer ownership (RLS as defense-in-depth), deferred cost-DoS controls. Cross-refs ADR 0005–0008. |
| [data-layer-and-sync.md](data-layer-and-sync.md) | Phase 3 structure: single owner-scoped repository, parent-steal/id-squat defenses, compound keyset delta cursor, app-code soft-delete cascade, router factory. Cross-refs ADR 0007/0008. |
| [cost-controls.md](cost-controls.md) | Phase 4: Postgres-backed per-caller rate limit + token-based per-user/global daily spend cap; why metering commits before persistence (a spend-cap-bypass fix); prod-config guard. Cross-refs ADR 0009. |
