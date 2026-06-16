# ADR 0005 — Generation API contract (material → deck)

- **Status:** Accepted
- **Date:** 2026-06-16

## Context

ADR 0003 decided generation is a boundary (`GenerationService`) with a stub for local-only v1 and a
`RemoteGenerationService` calling a minimal FastAPI endpoint pulled forward early. To build the iOS
client (on the MacBook) and the backend (on Windows) independently, both halves need to agree on the
wire shape **before** either is finished. The iOS side already defines the domain shape it needs:
`GeneratedDeck` (`cards`, `questions`) — see `ios/Cram/Services/GenerationService.swift`. This ADR
freezes the HTTP contract that mirrors it, so the backend can be implemented against a fixed target.

## Decision

A single endpoint, **no auth and no database** (per the ADR 0003 amendment).

### Request

```
POST {baseURL}/v1/generate
Content-Type: multipart/form-data
```

| Field          | Type            | Notes                                                        |
|----------------|-----------------|-------------------------------------------------------------|
| `subject_name` | text            | Subject name, so generation can tailor topics.              |
| `title`        | text            | Display title of the captured material.                     |
| `kind`         | text            | `SourceKind` raw value — `pdf` or `photo` for v1.           |
| `files`        | file (repeated) | The raw material. One part for a PDF; one per photo page.   |

The iOS client uploads the bytes stored by `SourceStore` (`Source.fileURLs`). File part
`Content-Type` is set from the extension (`application/pdf`, `image/jpeg`, `image/png`, `image/heic`).

### Response — `200 OK`, `application/json`

snake_case on the wire (FastAPI convention); the client maps it to its camelCase domain types.

```json
{
  "source_title": "Cell Biology — Chapter 3",
  "cards": [
    { "front": "…", "back": "…", "topic": "…", "difficulty": 2 }
  ],
  "questions": [
    {
      "prompt": "…",
      "kind": "multipleChoice",
      "topic": "…",
      "options": ["A", "B", "C", "D"],
      "answer_key": "A"
    }
  ]
}
```

- `difficulty` — integer 1–5.
- `kind` — `QuestionKind` raw value: `multipleChoice` or `shortAnswer`. Short-answer questions send
  `options: []`. The client falls back defensively (options present → multiple choice) on an
  unknown value.
- `answer_key` — for multiple choice, the correct option's text; for short answer, the model answer
  Claude grades against later (v0.4).

### Errors

Non-2xx with a JSON body carrying a message under `detail` (FastAPI default) or `error`. The client
surfaces it via `GenerationError` in the existing "Couldn't generate" alert.

## Consequences

- The backend has a frozen target; the iOS `RemoteGenerationService` is implementable and testable
  (against a mock server) before the backend exists. Built this session on the Mac.
- The wire shape stays an internal detail of `RemoteGenerationService` (private `…DTO` types); the
  rest of the app only ever sees `GeneratedDeck`. The contract can evolve without touching the UI.
- Multipart (not base64 JSON) keeps large PDFs/images efficient and matches FastAPI's `UploadFile`.
- No auth/DB yet — acceptable for the minimal endpoint, but it means the v0.3 backend must not be
  exposed publicly without at least a shared secret. Revisit at v0.5 (full backend + Supabase Auth).
- The Claude key stays server-side; the client only ever holds the backend base URL
  (`AppConfig.backendBaseURL`).
```
