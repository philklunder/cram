# Setup

No secrets live in this repo. API keys go in a local `.env` (gitignored); a `.env.example` with
blank placeholders will be added alongside the backend.

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

## Web (added on Windows)

Next.js. Will document `npm install` / `npm run dev` when it lands.
