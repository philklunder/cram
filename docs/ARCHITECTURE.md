# Architecture

```
[ iOS app (SwiftUI) ]           [ Web dashboard (Next.js) ]
         \                              /
          \---- HTTPS / JSON ----------/
                      |
              [ Backend API ]  (FastAPI / Python)
                      |
              \-------+--------\
              |                |
   [ Supabase: Postgres ]   [ Claude API ]
       + Auth + Storage      (server-side only)
```

## Components

- **iOS app** — SwiftUI + SwiftData. The native client; built first, local-only. Daily study,
  capture (camera for textbook pages, file picker for PDFs).
- **Web dashboard** — Next.js + React. The "study desk": upload large documents, browse subjects
  and decks, take quizzes, review cards (spaced repetition via a parity-tested port of the iOS SM-2
  scheduler), view progress. Reads/writes the same API.
- **Backend** — FastAPI. Owns the data model, auth integration, the ingestion + generation
  pipeline, and the Claude API calls. The AI key lives **server-side only** — never in a client.
- **Database / auth** — Supabase (Postgres + Auth + Storage). Stores subjects, sources, cards,
  quizzes, grades, and review logs; holds uploaded source files.
- **AI** — Claude API, called from the backend, to extract concepts, generate flashcards/quizzes,
  grade short answers, and (later) write progress feedback.

## Data model (shared concepts)

See [`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) §5 for the full model. In short:

- **Subject** → has many **Sources**, **Cards**, **Quizzes**, and **GradeEntries**; carries an
  exam date, grading scale, and target grade.
- **Source** — ingested material (PDF/photo in v1; web/YouTube/audio later).
- **Card** — a flashcard with SRS state (SM-2; see ADR 0002).
- **Quiz / Question / Attempt** — periodic self-tests, short answers graded by Claude.
- **GradeEntry** — a real-world mark; feeds prioritization and difficulty calibration.
- **ReviewLog** — per-review history for analytics and scheduling.

The iOS app models these as SwiftData `@Model` classes in `ios/Cram/Models/`. The backend mirrors
them in Postgres so both clients converge on the same shape.

## API & sync contract

Clients authenticate with Supabase Auth and call the backend with `Authorization: Bearer <jwt>`;
the backend verifies the JWT and **enforces per-user ownership in application code** — it connects
as the table-owner role, which bypasses Postgres RLS, so RLS is defense-in-depth only and every
query is owner-scoped through one data-access layer (ADR 0008 §3). Each owned resource is exposed
under `/v1/{resource}` with CRUD plus a delta-sync pair: a `GET …?since=<cursor>` **pull** (returns
rows changed after the cursor, soft-delete tombstones included) and a `POST …/batch` **push**
(idempotent upsert keyed by the client-generated UUID; append-only logs are insert-only). Deletes
are soft (`deleted_at`) and cascade the tombstone to descendants so offline clients converge.
Generation and grading persist their output through the same owner-scoped layer. Full contract:
[ADR 0007](adr/0007-backend-persistence-and-auth.md) §5.

## Cost controls (v0.5 Phase 4)

Two Postgres-backed cost limits sit on the request path, so the public API is safe to expose
([ADR 0009](adr/0009-pre-deploy-hardening.md)). A **per-caller rate limit** (a router-level
dependency) gates every `/v1/*` route — per authenticated user, fixed per-minute window, `429` over
the limit. An **Anthropic spend cap** wraps the two Claude calls: before each call the backend sums
today's token usage (per user and globally) and refuses with `429` if over budget; after a paid call
it records the usage to a ledger table. The metering is committed the moment the call returns —
before the deck/attempt is persisted — so a persistence failure can never un-meter a call that
already cost money. A hard **reverse-proxy body cap** fronts the in-app upload caps. All three are
mandatory in production, enforced by a fail-fast startup guard.

## Platform split

- **Windows:** backend, web dashboard, database/auth.
- **MacBook:** the native SwiftUI app in Xcode + sideloading to the phone.
