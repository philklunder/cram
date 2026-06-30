# Cram Web — Study Desk

The Cram web dashboard (v0.6). A Next.js app that authenticates with Supabase and reads/writes
the **live Cram backend** (`https://cram.up.railway.app`). It's the "study desk": sign in, browse
your subjects and decks, upload material to generate flashcards + quizzes, take a quiz, review your
cards, and track exam progress.

> **Quiz-taking** is live on the web (Quizzes tab → "Take quiz"): multiple-choice is graded in the
> browser; short-answer is graded by the backend's Claude call.
> **Spaced-repetition review** (Review tab): walks your due cards, and each rating runs a faithful
> TypeScript port of the iOS SM-2 scheduler — so reviewing on the web advances the *same* schedule
> as the iOS app. The port is pinned to the Swift behaviour by a parity test suite (`npm test`).

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
  These are simple, transparent display heuristics (distinct from the scheduler below).
- **Quiz-taking:** `src/components/QuizRunner.tsx` grades by question kind. Multiple choice is
  checked in the browser against `answer_key` and saved via `POST /v1/attempts`. Short answer is
  sent to `POST /v1/grade` (the backend's Claude call, behind the spend cap), which grades *and*
  persists the attempt — so the client never double-writes it to `/v1/attempts`.
- **Review (SM-2):** `src/lib/srs/scheduler.ts` is a faithful TypeScript port of the iOS scheduler
  (`ios/Cram/Study/Scheduler.swift`) — standard SM-2 plus exam-date compression. `ReviewSession.tsx`
  runs it on each rating and writes back `PATCH /v1/cards` + `POST /v1/review-logs`. Because the same
  card can be reviewed on web *or* iOS, the two scheduler implementations must agree: `src/lib/srs/
  *.test.ts` pins the port to vectors derived from the Swift source (`npm test`). The `due_date` is
  naturally review-time-dependent (now + interval); only the algorithm is held identical.

## Deploy to Vercel

1. Import the repo into Vercel, set the **Root Directory** to `web/`.
2. Add env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and (optionally)
   `NEXT_PUBLIC_CRAM_BACKEND_URL` in the Vercel project settings.
3. Deploy, then add the resulting Vercel URL to the backend's `CRAM_CORS_ORIGINS`.
