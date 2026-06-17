# Cram backend (v0.3 generation + v0.4 grading)

Minimal FastAPI service with two server-side Claude endpoints:

- **`POST /v1/generate`** — uploaded course material (PDF/photos) → a flashcard + quiz deck
  ([`../docs/adr/0005-generation-api-contract.md`](../docs/adr/0005-generation-api-contract.md)).
- **`POST /v1/grade`** — a student's short-answer response → score + feedback
  ([`../docs/adr/0006-grading-api-contract.md`](../docs/adr/0006-grading-api-contract.md)).
  Multiple-choice is graded on-device and never sent here.

**No database yet** — these are the minimal endpoints (ADR 0003 amendment). Access is gated
by a shared secret, or loopback-only when no secret is set (see Access control below). The
Claude API key is server-side only and lives in a gitignored `.env`.

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
`{"ok": true, "model": "claude-sonnet-4-6", "key_configured": true}`.

`--host 127.0.0.1` and `--reload` are for local dev. To reach the server from your
iPhone, bind `--host 0.0.0.0` **and set `CRAM_SHARED_SECRET`** (see below). Don't run
`--reload` in a deployed config.

## Access control

- **Loopback (default):** with `CRAM_SHARED_SECRET` unset, only `127.0.0.1` is served —
  local curl/dev works with no secret, and the endpoint is never reachable
  unauthenticated from the LAN.
- **Device / LAN / deploy:** set `CRAM_SHARED_SECRET` (generate one with
  `python -c "import secrets; print(secrets.token_urlsafe(32))"`). Every request must
  then send it in the `X-Cram-Secret` header. The iOS `RemoteGenerationService` sends
  this header from `AppConfig.sharedSecret` (the `CRAM_SHARED_SECRET` env var in the Run
  scheme); keep the value out of source.

There is still no per-user auth or rate limiting — add a spend cap / rate limit and put
the service behind a reverse proxy (with a hard body-size cap) before any public deploy.

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

## Point the iOS app at it

Set `CRAM_BACKEND_URL` in the Xcode Run scheme to `http://<this-PC-LAN-ip>:8000`. The
`GenerationServiceFactory` then uses `RemoteGenerationService` automatically — no code
change.

## Tuning generation

The prompt lives in [`app/prompt.py`](app/prompt.py); the output schema in
[`app/schemas.py`](app/schemas.py). Iterate on the prompt against real material — this
is where card quality is won.
