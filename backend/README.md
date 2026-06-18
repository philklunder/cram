# Cram backend (v0.5 — persistence + auth)

FastAPI service. Two server-side Claude endpoints plus a per-user CRUD + delta-sync API
over Supabase Postgres:

- **`POST /v1/generate`** — uploaded course material (PDF/photos) → a flashcard + quiz deck
  ([`../docs/adr/0005-generation-api-contract.md`](../docs/adr/0005-generation-api-contract.md)).
  As of v0.5 it **persists** the source (files → Supabase Storage), cards, quiz, and questions
  under the caller and returns the deck enriched with their row ids.
- **`POST /v1/grade`** — a student's short-answer response → score + feedback
  ([`../docs/adr/0006-grading-api-contract.md`](../docs/adr/0006-grading-api-contract.md)).
  Multiple-choice is graded on-device and never sent here. Pass `question_id` to **persist**
  the result as an append-only attempt.
- **`/v1/{resource}`** — CRUD + delta-sync for the eight owned resources (Phase 3, below).

All endpoints are gated by **Supabase JWT auth** (ADR 0007 §2). The Claude API key and all
Supabase credentials are server-side only and live in a gitignored `.env`.

## Run it (Windows)

```sh
cd backend
py -m venv .venv
.venv\Scripts\activate
py -m pip install -r requirements.txt

cp .env.example .env        # then edit .env and set ANTHROPIC_API_KEY
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Health check: `GET http://localhost:8000/healthz` →
`{"ok": true, "model": "claude-sonnet-4-6", "key_configured": true, "db": "ok"}`
(`db` is `not_configured` until `DATABASE_URL` is set). Run migrations and tests per
[`../docs/SETUP.md`](../docs/SETUP.md#backend).

`--host 127.0.0.1` and `--reload` are for local dev. To reach the server from your
iPhone, bind `--host 0.0.0.0` **and configure Supabase JWT auth** (see Access control
below) — non-loopback requests are refused otherwise. Don't run `--reload` in a deployed
config.

## Access control (v0.5 — Supabase JWT)

Every request to `/v1/*` carries `Authorization: Bearer <supabase_jwt>`. The backend
verifies it (ADR 0007 §2, [`app/auth.py`](app/auth.py)) against the Supabase JWKS endpoint
(`SUPABASE_JWKS_URL`, asymmetric keys, preferred) or the project secret
(`SUPABASE_JWT_SECRET`, HS256), checking signature, expiry, audience, and issuer.

- **Dev (no auth configured):** loopback (`127.0.0.1`) requests are served as a fixed dev
  user, so local curl/dev needs no Supabase. Non-loopback unauthenticated access is always
  refused.
- **Prod (`CRAM_ENV=prod`):** the server refuses to start unless JWT auth is configured —
  the dev fallback fails open behind a reverse proxy.

The `X-Cram-Secret` shared-secret gate is **retired** (ADR 0007 §3). Rate limiting and an
Anthropic spend cap are still TODO — add them, set `CRAM_ENV=prod`, and put the service
behind a reverse proxy with a hard body-size cap before any public deploy (v0.5 Phase 4).

## The endpoints

### `POST /v1/generate` — `multipart/form-data`

| Field          | Type            | Notes                                          |
|----------------|-----------------|------------------------------------------------|
| `subject_name` | text            | Subject name, so generation can tailor topics. |
| `title`        | text            | Display title of the captured material.        |
| `kind`         | text            | `pdf` or `photo`.                              |
| `files`        | file (repeated) | One PDF, or one part per photo page.           |

Returns `200` with the deck (`source_title`, `cards`, `questions`) — see the ADR for
the exact shape. Errors return a non-2xx with a `detail` message, which the iOS client
surfaces via `GenerationError`.

Supported file types: PDF, JPEG, PNG, GIF, WebP. **HEIC is not supported by the Claude
API** — convert iOS photos to JPEG client-side, or send PDFs.

### `POST /v1/grade` — `application/json`

Grades one **short-answer** response (the client grades multiple choice locally).

```json
{
  "prompt": "Why does adding salt raise water's boiling point?",
  "model_answer": "Dissolved particles lower the vapor pressure, so a higher temperature is needed to boil (boiling-point elevation).",
  "response": "the salt makes it harder to boil so it needs more heat",
  "topic": "Colligative properties"
}
```

Returns `200` with `{ "score": 0.0–1.0, "is_correct": bool, "feedback": "…" }`. `is_correct`
is derived server-side (`score >= 0.6`). A blank `response` is valid and scores `0.0`. Errors
return a non-2xx `detail` message, same as `/v1/generate`. See the ADR for the full contract.
When `question_id` is supplied, the response also carries the persisted `attempt_id`.

## CRUD + delta-sync API (v0.5 Phase 3)

Per-user REST over the eight owned resources: `subjects`, `sources`, `cards`, `quizzes`,
`questions`, `grade-entries`, `attempts`, `review-logs`. **Every row is owner-scoped in
application code** — the backend connects as the table-owner role, which bypasses RLS, so
ownership is enforced in [`app/repository.py`](app/repository.py), the single data-access
path (ADR 0008 §3). All routes require a valid JWT and act only on the caller's rows.

| Method & path                | Purpose                                                        |
|------------------------------|----------------------------------------------------------------|
| `GET /v1/{resource}?since=`  | **Delta pull** — rows changed after the cursor, tombstones included; returns `{items, next_cursor, has_more}`. |
| `GET /v1/{resource}/{id}`    | Fetch one owned row (404 if absent or soft-deleted).           |
| `POST /v1/{resource}`        | Create one (client may supply the UUID `id`).                  |
| `POST /v1/{resource}/batch`  | **Push** — idempotent upsert by client `id` (insert for append-only logs). |
| `PATCH /v1/{resource}/{id}`  | Update mutable fields (sync resources only).                   |
| `DELETE /v1/{resource}/{id}` | **Soft-delete** — sets `deleted_at` and cascades the tombstone to descendants (sync resources only). |

`attempts` and `review-logs` are **append-only** events: create + read only (no PATCH /
DELETE). The `since` cursor is opaque (a keyset of `updated_at`/`created_at` + `id`); a
batch upsert shares one timestamp, so the keyset cursor — not a bare timestamp — is what
makes pagination exact. Sync contract: ADR 0007 §5.

## Point the iOS app at it

Set `CRAM_BACKEND_URL` in the Xcode Run scheme to `http://<this-PC-LAN-ip>:8000`. The
`GenerationServiceFactory` then uses `RemoteGenerationService` automatically — no code
change.

## Tuning generation

The prompt lives in [`app/prompt.py`](app/prompt.py); the output schema in
[`app/schemas.py`](app/schemas.py). Iterate on the prompt against real material — this
is where card quality is won.
