# ADR 0007 — Backend persistence + auth (SQLAlchemy/Alembic on Supabase Postgres, backend-mediated JWT)

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

Through v0.4 the backend is **stateless**: `POST /v1/generate` and `POST /v1/grade` take material
in and return JSON out, holding nothing. Decks, cards, SRS state, quizzes, attempts, and grades
live only in the iOS app's local SwiftData store (PRODUCT-SPEC §5). ADR 0001 already fixed the
stack — FastAPI backend, **Supabase (Postgres + Auth + Storage)**, "backend owns the data model,"
Claude key server-side only — but deferred *how* persistence and auth actually work to v0.5.

v0.5 is that work: the backend becomes the system of record, mirrored in Supabase Postgres, with
per-user accounts so the iOS app (and later the Next.js dashboard, ADR 0001) can sync the same
data. Two architectural forks had to be settled before any schema is committed, because they shape
everything downstream:

1. **How the backend talks to Postgres** — an ORM we own, or the Supabase client.
2. **How per-user access is enforced** — in the backend, or by Supabase row-level security with
   clients talking to Supabase directly.

## Decision

### 1. Persistence: SQLAlchemy + Alembic against the Supabase Postgres connection

The backend uses **SQLAlchemy** models and **Alembic** migrations, connecting to the Supabase
Postgres instance via a `DATABASE_URL`. We do **not** route data access through the Supabase
client / PostgREST.

- Keeps ADR 0001's "backend owns the data model" literal: the schema is defined in code in this
  repo, versioned by Alembic migrations, reviewable in PRs.
- Supabase remains the *host* for Postgres (+ Auth + Storage) but is not a hard coupling at the
  data-access layer — if we ever move off Supabase, the ORM + migrations port to any Postgres.
- Two connection paths (Supabase exposes both): Alembic migrations and admin tasks use the
  **direct/session connection (port 5432)**; the app runtime may use the **transaction pooler
  (port 6543, pgBouncer)**. Pooler caveats (no prepared-statement caching) are handled in the
  engine config; migrations never run through the pooler.

### 2. Auth: backend-mediated Supabase JWT

Supabase Auth issues the JWTs; the **backend verifies them and enforces ownership** in application
code. Clients never touch Postgres directly.

- Clients authenticate with Supabase Auth (email/password to start) and obtain an access-token JWT.
- Every request to a data endpoint carries `Authorization: Bearer <supabase_jwt>`. A FastAPI
  dependency (`get_current_user`) **verifies the JWT** — against the Supabase JWKS endpoint
  (asymmetric keys) when available, otherwise the project JWT secret — and extracts the user id
  (`sub`).
- The backend connects to Postgres with a **privileged role / service-role credential** and scopes
  **every query to `user_id == sub`**. Ownership is enforced in app logic, not delegated to the
  client.
- **RLS as defense-in-depth (not the primary control):** row-level security is enabled on all
  user-owned tables with `auth.uid()`-keyed policies. The backend's privileged role bypasses RLS,
  so RLS protects only against an accidental anon-key/direct path — a safety net, not the gate.

This matches "backend owns the data model" and keeps all Claude calls and all writes flowing
through one FastAPI path that can persist generation/grading output as it returns it. The
alternative (RLS + clients hitting Supabase directly) was rejected: it splits the data path away
from the backend, would duplicate validation, and complicates persisting AI output.

### 3. Auth gate migration: retire `X-Cram-Secret` for clients

Today `/v1/generate` and `/v1/grade` are gated by a shared secret (`X-Cram-Secret`, loopback-only
when unset, mandatory in prod — ADR 0005/0006, H1). Once user auth exists, **client-facing
endpoints require a valid user JWT** and the shared secret is retired from the client path. An
internal secret may be kept for non-user system/admin calls if needed. `/v1/generate` and
`/v1/grade` move under JWT too, since their output becomes user-owned rows.

### 4. Data model → Postgres tables

The tables mirror PRODUCT-SPEC §5, scoped per user. All user-owned tables carry `id` (UUID PK,
**client-generatable** so offline-created rows have stable ids and upserts are idempotent),
`user_id` (FK → `auth.users`), `created_at`, and — for syncable mutable tables — `updated_at`
(server-maintained) and `deleted_at` (soft-delete tombstone, so deletes propagate on pull).

- `subjects` — `name`, `exam_date?`, `grading_scale`, `target_grade?`, `current_grade?`
- `sources` — `subject_id`, `kind` (`pdf`|`photo`; later `web`|`youtube`|`audio`), `title`,
  `storage_path` (Supabase Storage object), `added_at`
- `cards` — `subject_id`, `source_id?`, `front`, `back`, `topic`, `difficulty` (1–5) + SRS state
  (`ease_factor`, `interval_days`, `due_date`, `repetitions`, `lapses`)
- `quizzes` — `subject_id`, `title`
- `questions` — `quiz_id`, `prompt`, `kind` (`multipleChoice`|`shortAnswer`), `topic`,
  `options` (jsonb), `answer_key`
- `attempts` — `question_id`, `response`, `is_correct`, `score` (0–1), `feedback`, `graded_at`
  *(append-only event; `feedback` is the v0.4 addition)*
- `grade_entries` — `subject_id`, `title`, `kind` (`exam`|`test`|`assignment`|`overall`),
  `score`, `weight`, `date`
- `review_logs` — `card_id`, `reviewed_at`, `rating` *(append-only event)*

Wire format stays **snake_case** (ADR 0005/0006); the iOS client maps to its camelCase domain
types as it already does. Enums are stored as Postgres enums or checked text, matching the values
the iOS models and existing contracts already use.

### 5. Sync model (backend contract; client lands on Mac later)

The backend exposes the primitives; the iOS sync client is built later on the Mac (out of this
Windows session), so v0.5 only commits the *server* side and the *contract*:

- **Pull** — `GET …?since=<cursor>` returns rows changed after the cursor (including tombstones via
  `deleted_at`), newest `updated_at` as the next cursor.
- **Push** — batch **upsert by client-generated UUID** (idempotent); append-only logs (`attempts`,
  `review_logs`) are insert-only.
- **Conflict policy** — last-writer-wins on `updated_at` for mutable rows; event logs never
  conflict. Offline behavior (cache decks locally, queue reviews/grades, sync on reconnect) is
  defined when the client is built and may be promoted to its own ADR then (PRODUCT-SPEC §9 open
  question).

### 6. Storage

Uploaded source files go to a **private Supabase Storage bucket**, keyed `{user_id}/{source_id}/…`.
The generation pipeline — which today reads uploads in-request and persists nothing — will write
them to Storage and record `storage_path` on the `source` row. The backend uses the service-role
credential for Storage; signed URLs are minted when a client needs to read a file back.

## Consequences

- New backend dependencies: `sqlalchemy`, `alembic`, a Postgres driver (`psycopg[binary]`), and a
  JWT verification path (`pyjwt` + JWKS, or the project secret). New env vars (server-side only):
  `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET` *or* JWKS URL, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_STORAGE_BUCKET`.
- Creating the Supabase project, getting the connection string/keys, and creating the Storage
  bucket are **manual dashboard steps** the owner does once; the repo holds migrations + config,
  not the project itself.
- Client UUID PKs + `updated_at`/`deleted_at` are designed in from the first migration so the sync
  layer doesn't force a later schema break. Append-only logs keep the highest-volume writes
  (reviews, attempts) trivially syncable.
- Pre-public-deploy hardening carried from the ADR 0005/0006 security passes lands in this version:
  **O1** request rate-limit + Anthropic spend cap, **M1** hard reverse-proxy body cap, and setting
  **`CRAM_ENV=prod`** (which already forces the shared-secret/JWT gate closed). Tracked in the v0.5
  plan, gating any public deploy.
- The iOS app keeps SwiftData as its local store (ADR 0001); the backend mirror converges on the
  same shape, so sync layers on without changing the model. The iOS sync client + the v0.4 iOS work
  remain Mac/Xcode tasks, unblocked by this backend.
