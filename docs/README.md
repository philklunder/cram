# Cram docs

- [PRODUCT-SPEC.md](PRODUCT-SPEC.md) — what we're building and why (start here).
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and how the clients/backend/AI fit together.
- [SETUP.md](SETUP.md) — how to build and run each component locally (no secrets).
- [adr/](adr/) — Architecture Decision Records (one short file per notable decision):
  - [0001](adr/0001-stack-and-project-format.md) — Stack & iOS project format (Accepted).
  - [0002](adr/0002-srs-algorithm.md) — SRS algorithm: SM-2 with exam-date compression (Accepted).
  - [0003](adr/0003-v1-generation-location.md) — Where AI generation runs for the local-only v1
    (Accepted).
  - [0004](adr/0004-exam-date-compression.md) — Exam-date compression of the SM-2 schedule
    (Accepted).
  - [0005](adr/0005-generation-api-contract.md) — `POST /v1/generate` API contract (Accepted).
  - [0006](adr/0006-grading-api-contract.md) — `POST /v1/grade` API contract (Accepted).
  - [0007](adr/0007-backend-persistence-and-auth.md) — Backend persistence + Supabase JWT auth
    (Accepted).
  - [0008](adr/0008-fail-closed-auth-defaults.md) — Fail-closed auth defaults (Accepted).
  - [0009](adr/0009-pre-deploy-hardening.md) — Pre-deploy hardening: rate limit, spend cap, body
    cap, prod guard (Accepted).
