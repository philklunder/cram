# ADR 0006 — Grading API contract (short-answer → score + feedback)

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

Roadmap v0.4 adds quizzes and AI grading. A quiz `Question` is either `multipleChoice` or
`shortAnswer` (see `ios/Cram/Models/Quiz.swift`). Multiple-choice answers are objectively
checkable — the client compares the chosen option to `answerKey` locally, no model call needed.
**Short-answer** responses are open text and need judgement: the same idea phrased differently
should score full marks, and a fluent-but-wrong answer should not. That judgement is the one
short-answer grading does on the server, via Claude (the key stays server-side, ADR 0005).

The iOS side already has the domain shape it records: `Attempt(response, isCorrect, score)` with
`score` a 0…1 partial-credit value. This ADR freezes the HTTP contract the backend exposes so the
iOS `RemoteGradingService` (built later on the Mac) has a fixed target — the same split as ADR 0005.

## Decision

A second endpoint on the same v0.3 service: `POST /v1/grade`. **Short-answer only** — the client
does not call it for multiple choice. **JSON in, JSON out** (no files, unlike `/v1/generate`).
Same access gate as `/v1/generate` (`X-Cram-Secret`, loopback-only when unset; mandatory in prod).

### Request

```
POST {baseURL}/v1/grade
Content-Type: application/json
X-Cram-Secret: <shared secret>   # when configured
```

```json
{
  "prompt": "Why does adding salt raise water's boiling point?",
  "model_answer": "Dissolved solute particles lower the solvent's vapor pressure, so a higher temperature is needed to reach atmospheric pressure (boiling-point elevation, a colligative property).",
  "response": "the salt makes it harder to boil so it needs more heat",
  "topic": "Colligative properties"
}
```

| Field          | Type   | Notes                                                              |
|----------------|--------|--------------------------------------------------------------------|
| `prompt`       | string | The question text (`Question.prompt`).                             |
| `model_answer` | string | The reference answer to grade against (`Question.answerKey`).      |
| `response`     | string | The student's submitted answer (`Attempt.response`). May be blank. |
| `topic`        | string | Optional. Topic label for context (`Question.topic`).              |

All text fields are capped at `CRAM_MAX_FIELD_CHARS` (4096); a blank `response` is valid and
grades to `0.0`.

### Response — `200 OK`, `application/json`

```json
{
  "score": 0.6,
  "is_correct": true,
  "feedback": "You've got the core idea — more heat is needed. To be complete, name the mechanism: dissolved particles lower the vapor pressure (boiling-point elevation)."
}
```

- `score` — float `0.0`…`1.0`, partial credit. Maps to `Attempt.score`.
- `is_correct` — derived **server-side** from `score >= 0.6` (the pass threshold; tunable, not
  model-decided, so the boundary is deterministic). Maps to `Attempt.isCorrect`.
- `feedback` — one or two sentences addressed to the student: what was right, what was missing or
  wrong. Surfaced in the quiz UI; the iOS `Attempt` model gains a `feedback` field in the v0.4 iOS
  work. Always present (never empty).

### Errors

Non-2xx with a JSON `detail` message (FastAPI convention), same as `/v1/generate`. Upstream Claude
errors are logged server-side and returned as a generic client-safe message (no billing/account
leak). The client surfaces it as a "couldn't grade" state and can fall back to letting the user
self-mark.

## Consequences

- The grader is a pure-text Claude call — cheaper and faster than generation; no vision, no files.
  JSON (not multipart) keeps it simple and matches the request having no binary payload.
- `is_correct` is a server-side threshold on `score`, not a separate model output: one fewer thing
  the model can return inconsistently, and the pass bar is a product knob we can tune (`0.6` to
  start) without re-prompting.
- The `response` field is untrusted student input fed into a prompt — a prompt-injection surface.
  The grading prompt instructs the model to treat the response purely as an answer to grade and
  never as instructions; structured output (a fixed score/feedback schema) further constrains it.
  Flagged for the v0.4 security pass.
- Multiple choice never hits the network: instant local grading, and grading spend scales only with
  short-answer volume.
- Reuses the existing access gate, field caps, and error-handling pattern — no new env vars. The
  deferred hardening from ADR 0005's security pass (O1 rate limit / spend cap, M1 body cap) now
  covers this endpoint too and stays a v0.5 pre-deploy item.
