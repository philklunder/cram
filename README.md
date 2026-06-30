# Cram

An **exam-prep study app** that turns your own course material into a personalized course of
**flashcards and quizzes**, then uses **spaced repetition** to schedule your reviews so the
knowledge actually sticks — peaking on the day of your exam.

> Portfolio flagship: a native iOS client, a multi-client FastAPI backend, a Next.js web dashboard,
> and a genuinely useful Claude integration that reads your material, generates study content, and
> adapts to how you're actually doing.

## The idea

1. **Ingest** — drop in your material (PDF, slides, or a photo of a textbook page).
2. **Generate** — Claude extracts the key concepts and writes flashcards + quiz questions, tagged
   by topic and graded by difficulty.
3. **Study** — a daily review session, scheduled by a spaced-repetition engine.
4. **Adapt** — it tracks what you know, re-teaches the gaps, and (knowing your **real grades** and
   **exam date**) focuses your time where it counts.

## Status

| Component  | Stack                          | Status |
|------------|--------------------------------|--------|
| iOS app    | Swift + SwiftUI + SwiftData    | 🟡 Scaffolded — study loop + real PDF/photo capture. Now authenticates with **Supabase JWT** (login flow + `Authorization: Bearer`; retired `X-Cram-Secret` dropped) via the `supabase-swift` SDK; pending a live end-to-end generate test against Railway (Mac) |
| Backend    | FastAPI (Python) + Supabase    | 🟢 **Deployed live on Railway** ([`/healthz`](https://cram.up.railway.app/healthz)) — v0.5 complete. Generate + grade behind Supabase JWT auth; schema migrated to Supabase Postgres with per-user CRUD + delta-sync endpoints; generate/grade persist their output. **Pre-deploy hardening in place** (ADR 0009, see [plan](docs/plans/v0.5-backend-persistence-auth.md)) — per-caller rate limit, Anthropic spend cap, and a reverse-proxy body cap served by a baked-in nginx proxy, plus a fail-fast prod-config guard. An env-driven CORS allowlist (`CRAM_CORS_ORIGINS`, default closed) gates the web client. Only the iOS sync client (Phase 5) remains |
| Web        | Next.js + React + Tailwind     | 🟡 **v0.6 built** — the "study desk": Supabase login, subjects with an exam countdown, browse sources/cards/quizzes, upload material → generate decks, **take a quiz** (MC graded client-side, short-answer via the backend's Claude grader), and a progress overview. Talks to the live backend with a Supabase Bearer JWT (CORS-gated). SRS flashcard review (full SM-2 parity) is the next slice. See [`web/README.md`](web/README.md) |
| AI         | Claude API                     | 🟢 Server-side only; real generation via Claude Sonnet 4.6 (ADR 0005) |

## Repository layout

```
cram/
├── ios/          # SwiftUI app (Xcode) — the native client (built first)
├── backend/      # FastAPI API — live on Railway (generate, grade, per-user CRUD + sync)
├── web/          # Next.js dashboard — the study desk (browse, upload, progress)
├── docs/         # Product spec, architecture, setup, and decision records
└── meta/         # Decision reasoning (the *why*), complementing docs/adr/
```

## Docs

- [`docs/PRODUCT-SPEC.md`](docs/PRODUCT-SPEC.md) — what we're building and why (start here).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the clients, backend, and AI fit together.
- [`docs/SETUP.md`](docs/SETUP.md) — how to build and run each component locally.
- [`docs/adr/`](docs/adr/) — Architecture Decision Records (the frozen contracts).
- [`meta/`](meta/) — the reasoning behind the build (the *why*), complementing the ADRs.

## License

[MIT](LICENSE)
