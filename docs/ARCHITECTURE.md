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
  and decks, view progress. Reads/writes the same API.
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

## Platform split

- **Windows:** backend, web dashboard, database/auth.
- **MacBook:** the native SwiftUI app in Xcode + sideloading to the phone.
