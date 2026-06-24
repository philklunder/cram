# Setup

No secrets live in this repo. API keys go in a local `.env` (gitignored); copy
[`backend/.env.example`](../backend/.env.example) (blank placeholders) and fill it in.

## iOS app

**Requirements:** macOS with Xcode 16+ (developed on Xcode 26), iOS 18+ simulator or device.

### Run in Xcode

1. Open `ios/Cram.xcodeproj` in Xcode.
2. Pick an iOS Simulator (e.g. iPhone 17) or your device.
3. Press **Run** (⌘R).

### Build from the command line

```sh
cd ios
xcodebuild -project Cram.xcodeproj -scheme Cram \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

> The iOS project is scaffolded next; this section will be exact once `ios/Cram.xcodeproj` exists.

## Backend

FastAPI + Supabase Postgres. The Claude API key and all Supabase credentials live in a
gitignored `backend/.env` (copy `backend/.env.example`).

### Install & run (Windows)

```sh
cd backend
py -3.13 -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt

cp .env.example .env        # set ANTHROPIC_API_KEY; add Supabase keys for persistence
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Health check: `GET http://localhost:8000/healthz` → `{"ok": true, …, "db": "ok"}` once
`DATABASE_URL` is set. See [`backend/README.md`](../backend/README.md) for the endpoint
reference (generation, grading, and the Phase 3 CRUD + delta-sync API).

### Database migrations (Alembic)

```sh
cd backend
.venv\Scripts\python -m alembic upgrade head    # uses DATABASE_DIRECT_URL (port 5432)
```

> The autogenerate **drift check is expected to be non-empty** — it wants to drop the eight
> `auth.users` FKs, which are raw-SQL-managed in migration `0002` (the `auth` schema isn't in
> the ORM metadata). **Discard** any such generated migration; never apply it.

### Tests

The data-layer tests need a disposable Postgres (the models use JSONB / `timestamptz` /
checked-text enums — SQLite can't stand in). Point `TEST_DATABASE_URL` at one; without it the
DB-backed tests skip and only the cursor unit test runs.

```sh
cd backend
.venv\Scripts\python -m pip install -r requirements-dev.txt

# disposable Postgres via Docker:
docker run --rm -d -e POSTGRES_PASSWORD=pw -p 55432:5432 --name cram-test postgres:15

set TEST_DATABASE_URL=postgresql://postgres:pw@localhost:55432/postgres   # PowerShell: $env:TEST_DATABASE_URL=…
.venv\Scripts\python -m pytest -q
```

The suite builds the schema from `Base.metadata` (not Alembic), so it omits the Supabase
`auth.users` FKs/RLS that need the `auth` schema, and stubs the Claude calls and Storage.

### Production deploy checklist

There are **two classes of gate** below. Class A is machine-enforced; Class B is not, so it is on
you.

#### Class A — machine-enforced (the app refuses to boot without these)

Before any public deploy, set `CRAM_ENV=prod`. The app then **refuses to boot** unless every item
below is configured — `check_production_config` (in [`app/config.py`](../backend/app/config.py))
fails fast with the exact missing keys (ADR 0009). This is deliberate: an unmetered public endpoint
to a paid LLM is an open wallet.

| Env var | Requirement in prod |
|---------|---------------------|
| `SUPABASE_JWKS_URL` (or `SUPABASE_JWT_SECRET`) | JWT auth must be configured — the dev fallback fails open behind a reverse proxy. |
| `CRAM_ALLOW_DEV_FALLBACK` | must be **off** (it bypasses auth). |
| `ANTHROPIC_API_KEY` | set. |
| `DATABASE_URL` | set. |
| `CRAM_RATE_LIMIT_PER_MIN` | **> 0** — per-caller request ceiling per minute over all `/v1/*` (default 60; over the limit → `429` + `Retry-After`). |
| `CRAM_USER_DAILY_TOKEN_CAP` | **> 0** — per-user daily Anthropic token cap. |
| `CRAM_GLOBAL_DAILY_TOKEN_CAP` | **> 0** — deployment-wide daily token cap. |

Spend caps are token-based and reset at 00:00 UTC; over budget, `/v1/generate` and `/v1/grade`
return `429` **before** calling Claude. Set `CRAM_TRUSTED_PROXY=1` only when the app sits behind a
trusted reverse proxy (it gates `X-Forwarded-For` trust for the rate-limit IP fallback). All these
vars default to off/0, so local and dev runs are unaffected — they are required only in prod. See
[`backend/.env.example`](../backend/.env.example) for the full annotated list.

**Web client (CORS).** The web dashboard is a browser app on a different origin, so the backend
must allow it explicitly: set `CRAM_CORS_ORIGINS` to a comma-separated list of exact origins
(`scheme://host[:port]`, no trailing slash), e.g. `https://<your-app>.vercel.app`. It is **not**
boot-enforced (empty just disables CORS, keeping iOS/native unaffected), but the live web app
cannot call the backend until it is set. On Railway, enter the value **raw** — no surrounding
quotes (Railway does not strip them).

#### Class B — NOT machine-enforced (you must verify these by hand)

> ⚠️ **`check_production_config` cannot see past its own process.** It validates env vars; it has no
> way to know whether a reverse proxy actually sits in front of the worker. So the single most
> important edge control is the one the boot guard will happily start *without*. Treat the two items
> below as hard, blocking deploy steps — the deploy is not done until both are checked off.

- [ ] **Reverse proxy configured in front of the app — MANDATORY (M1).** A hard body cap (~`36m`) +
  a coarse per-IP request/connection limit at the edge. **Why this is non-negotiable:** every in-app
  guard (auth, rate limit, spend cap, per-file/total caps) runs *after* FastAPI has already spooled
  the multipart body, and the in-app `Content-Length` middleware is bypassable with a chunked upload.
  Nothing in the application can protect the body-ingestion layer — only the proxy can. The app's
  rate limit is also per-authenticated-user, so a pre-auth flood stays cheap until the proxy blunts
  it. Ready-made nginx / Caddy / Traefik snippets, sized just above `CRAM_MAX_TOTAL_BYTES`
  (32 MiB → ~`36m`), are in
  [`backend/deploy/reverse-proxy.example.conf`](../backend/deploy/reverse-proxy.example.conf). Set
  `CRAM_TRUSTED_PROXY=1` once the proxy is in place. The in-app body caps (`app/main.py`) remain as
  defense-in-depth, not as the authoritative cap.
- [ ] **Migration `0003` applied** to the live Supabase DB the same way Phase 1 was applied
  (`alembic upgrade head` against `DATABASE_DIRECT_URL`). It adds the `ai_usage_events` (spend-cap
  ledger) and `rate_limit_buckets` tables; it needs the Supabase `auth` schema, so it can't run on a
  plain Postgres. The autogenerate drift caveat applies as with `0002` — discard any generated
  migration that wants to drop the `auth.users` FK. *(Already applied as of 2026-06-18 — re-verify
  the live DB is at head `0003` before deploy.)*

## Web (added on Windows)

Next.js (App Router) + TypeScript + Tailwind, in [`web/`](../web). It authenticates with Supabase
(same project as iOS) and calls the live backend with a Bearer JWT. Full setup, env vars, and the
Vercel deploy notes live in [`web/README.md`](../web/README.md). Quick start:

```sh
cd web
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

For local dev against the **deployed** backend, add `http://localhost:3000` to the backend's
`CRAM_CORS_ORIGINS` (above). Against a **local** backend, point `NEXT_PUBLIC_CRAM_BACKEND_URL` at it
and set its `CRAM_CORS_ORIGINS=http://localhost:3000`.
