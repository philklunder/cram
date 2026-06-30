# Cram Web — Study Desk

The Cram web dashboard (v0.6). A Next.js app that authenticates with Supabase and reads/writes
the **live Cram backend** (`https://cram.up.railway.app`). It's the "study desk": sign in, browse
your subjects and decks, upload material to generate flashcards + quizzes, take a quiz, and track
exam progress.

> **Quiz-taking** is live on the web (Quizzes tab → "Take quiz"): multiple-choice is graded in the
> browser; short-answer is graded by the backend's Claude call. **Spaced-repetition flashcard
> review** still lives in the iOS app for now — bringing it to the web (with a faithful port of the
> SM-2 scheduler) is the next slice.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** for styling
- **Supabase** auth (`@supabase/ssr` + `@supabase/supabase-js`), same project as iOS
- Talks to the backend with a Bearer JWT (the same scheme the iOS client uses)

## Prerequisites

- Node.js 18.18+ (developed on Node 22)
- A Supabase account with access to the Cram project (for `SUPABASE_URL` + anon key)
- The backend must allow this origin via `CRAM_CORS_ORIGINS` (see below)

## Setup

```sh
cd web
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** key — public by design, safe in the browser. **Never** the service-role key. |
| `NEXT_PUBLIC_CRAM_BACKEND_URL` | Backend base URL. Defaults to the live Railway deploy; set to `http://127.0.0.1:8000` for a local backend. |

```sh
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

## CORS — required before live calls work

The backend only answers cross-origin browser requests from origins in its `CRAM_CORS_ORIGINS`
allowlist (comma-separated, exact origins, no trailing slash). Until it includes this app's origin,
every `/v1/*` call fails as a CORS error in the browser.

- **Local dev against the deployed backend:** add `http://localhost:3000` to `CRAM_CORS_ORIGINS` in
  Railway Variables (enter raw — Railway does not strip quotes), then redeploy.
- **Local dev against a local backend:** set `CRAM_CORS_ORIGINS=http://localhost:3000` in the
  backend's `.env` and point `NEXT_PUBLIC_CRAM_BACKEND_URL` at it.
- **Production (Vercel):** add the Vercel URL (e.g. `https://<app>.vercel.app`) to
  `CRAM_CORS_ORIGINS`.

## Architecture notes

- **Auth:** `@supabase/ssr` keeps the session in cookies; `src/middleware.ts` refreshes it on each
  request. The `(app)` route group's server layout validates the session and redirects
  unauthenticated users to `/login`.
- **Backend calls:** `src/lib/api/client.ts` runs in the browser, reads the access token from the
  Supabase session, and sends `Authorization: Bearer <jwt>`. Types in `src/lib/api/types.ts` mirror
  the backend's Pydantic `*Read` schemas (snake_case on the wire — kept verbatim, no mapping layer).
- **Filtering:** the CRUD list endpoints return all of a user's rows (delta-pull, not filtered
  server-side), so the client pages through and filters by subject/quiz. Fine at single-user scale.
- **Progress:** `src/lib/progress.ts` derives mastery buckets from each card's stored SM-2 state.
  These are simple, transparent heuristics; the authoritative scheduler lives in the iOS app.
- **Quiz-taking:** `src/components/QuizRunner.tsx` grades by question kind. Multiple choice is
  checked in the browser against `answer_key` and saved via `POST /v1/attempts`. Short answer is
  sent to `POST /v1/grade` (the backend's Claude call, behind the spend cap), which grades *and*
  persists the attempt — so the client never double-writes it to `/v1/attempts`.

## Deploy to Vercel

1. Import the repo into Vercel, set the **Root Directory** to `web/`.
2. Add env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and (optionally)
   `NEXT_PUBLIC_CRAM_BACKEND_URL` in the Vercel project settings.
3. Deploy, then add the resulting Vercel URL to the backend's `CRAM_CORS_ORIGINS`.
