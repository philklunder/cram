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
| iOS app    | Swift + SwiftUI + SwiftData    | 🟡 Scaffolded — study loop + real PDF/photo capture; remote-generation client ready (local-only) |
| Backend    | FastAPI (Python) + Supabase    | 🟢 v0.3 generation endpoint live (`POST /v1/generate`); persistence + auth not started |
| Web        | Next.js + React                | ⚪️ Not started |
| AI         | Claude API                     | 🟢 Server-side only; real generation via Claude Sonnet 4.6 (ADR 0005) |

## Repository layout

```
cram/
├── ios/          # SwiftUI app (Xcode) — the native client (built first)
├── backend/      # FastAPI generation API (v0.3 — POST /v1/generate)
├── web/          # Next.js dashboard (added on Windows)
└── docs/         # Product spec, architecture, setup, and decision records
```

## Docs

- [`docs/PRODUCT-SPEC.md`](docs/PRODUCT-SPEC.md) — what we're building and why (start here).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the clients, backend, and AI fit together.
- [`docs/SETUP.md`](docs/SETUP.md) — how to build and run each component locally.
- [`docs/adr/`](docs/adr/) — Architecture Decision Records.

## License

[MIT](LICENSE)
