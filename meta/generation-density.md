# Generation density — how much of the material a deck covers

Added 2026-09-25. The learner now picks a **coverage level** each time they generate a deck:
test them on just the core ideas, on the main ideas plus supporting detail, or on everything.

## Decisions
- **Three fixed levels, one optional wire field.** `POST /v1/generate` takes an optional
  multipart `density` field: `essentials` | `balanced` | `comprehensive`. An omitted field means
  **`balanced`**, and `balanced` keeps the wording and 8k output budget that every deck had before
  the field existed. iOS (which doesn't send it yet) and any older client get unchanged output.
- **Allow-list, not free text.** Anything other than the three values gets a 422 in the route
  **before** the spend-cap check and the paid call. Each value selects a fixed server-side
  instruction (`DENSITY_GUIDANCE` in `backend/app/prompt.py`), so no client text reaches the prompt
  through this field.
- **The instruction goes in the user turn, not the system prompt.** The system prompt only says
  "follow the coverage level in the user message". The three variants are short paragraphs next to
  the subject/title lines in `build_user_text`.
- **Relative instructions, no card counts.** The levels say *what* to test ("only the central
  concepts…", "every definition, fact, mechanism…"), never "write N cards". The system prompt's
  "if the material is thin, generate fewer, higher-quality items" still applies at every level.
- **Output budget scales with the level.** `MAX_OUTPUT_TOKENS_BY_DENSITY` is 8k / 8k / **16k**.
  A comprehensive deck from a long PDF passed 8k, and a truncated structured-output response is
  invalid JSON.
- **Truncation is its own error.** `stop_reason == "max_tokens"` now raises a client-safe
  `GenerationError` ("too long to cover at this level… try a lighter coverage level, or upload it
  in smaller parts"), not the generic "malformed deck data".
- **Billed failures are metered.** The security review of this change found that a truncated,
  refused or malformed response was billed but never counted against the spend cap. The fix
  (`GenerationError.usage` + `_meter_failed_call`) covers both AI endpoints. See cost-controls.md.
- **The level is not stored on the deck.** No column and no migration. The web success line shows
  the level that was used; nothing reads it after that.
- **Web: remembered per device.** `web/src/lib/generationDensity.ts` uses the same
  localStorage + `useSyncExternalStore` pattern as `reviewSettings.ts`. It's a working preference,
  not account data, so it isn't synced. The owner chose "remember" over "reset to Balanced each
  time". A stored value that doesn't parse falls back to `balanced`, so a tampered or stale entry
  can never cause a 422.
- **Picker UI: three radio tiles** (`CoveragePicker` in `UploadWork.tsx`), shaped with
  `/impeccable shape` and confirmed by the owner. The tiles are native `<input type="radio">`s,
  visually hidden inside `<label>`s in a `<fieldset>`/`<legend>`, so arrow keys, Tab and screen
  readers get standard radio-group behaviour with no custom key handling. The selected style
  copies `ThemeToggle`, so it reads as the same control family. A three-bar rising glyph is the
  only visual "how much" signal. A note about cost appears only when **Everything** is selected.
- **User-facing labels are not the wire values:** Key concepts / Balanced / Everything. The wire
  names describe the intent to the model; the UI names describe the result to a student.

## Reasoning
- **Why a setting at all:** one fixed density fits nobody. A student cramming the night before
  wants the essentials. A student with weeks left wants every detail in the SRS queue. The
  deck's size also sets the daily review load for weeks, so it should be the student's call.
- **Why three levels, not a slider or a card count:** the model can't hit a precise number
  reliably across a 1-page photo and a 60-slide PDF, so a count or a fine slider would promise
  something the backend can't keep. Three named levels are honest and easy to pick from.
- **Why `balanced` equals the old behaviour:** it keeps the rollout safe and needs no iOS change.
  The contract stays additive (ADR 0005 amendment).
- **Why 16k and not more:** the Anthropic SDK refuses non-streaming requests whose `max_tokens`
  could take more than ~10 minutes (about 21k tokens). 16k fits a thorough deck, and a unit test
  pins the ceiling under 21k. Moving generation to streaming was rejected as out of scope for a
  prompt knob.
- **Why the spend cap needed only the failure-path fix:** output tokens are metered after every
  billed call (ADR 0009), including failed ones since this change, so a comprehensive deck costs
  the caller exactly what it generates. The worst case per call rises
  from about 8k to about 16k output tokens. The global cap's overshoot bound (8 concurrent calls)
  scales the same way. This is accepted and noted in the UI ("uses more of your daily AI
  allowance").
- **Rejected: a per-subject or account-level setting.** It would need a column, a migration and
  iOS parity for what is really a choice made for each upload.
- **Rejected: a custom listbox or segmented buttons with `aria-pressed`.** Native radios give the
  correct semantics and keyboard model for free (PRODUCT.md: "standard controls").

## Implications
- **Backend deploy order:** the web sends `density` on every generate. A backend without this
  change would silently ignore the extra form field and generate `balanced`, so the order isn't
  critical. Still deploy the backend first so the setting takes effect.
- **iOS parity is outstanding.** `RemoteGenerationService` should send `density` once iOS gets a
  picker. Until then iOS decks are `balanced`. Not done this session: it can't be built or tested
  on Windows.
- Adding a level means updating `Density`, `DENSITY_GUIDANCE`, `MAX_OUTPUT_TOKENS_BY_DENSITY` and
  `DENSITY_OPTIONS` (web) together. Tests on both sides assert that the sets match.
- Prompt iteration for each level happens in `DENSITY_GUIDANCE` only. The system prompt and
  schema stay shared.

## Open questions
- The level wording hasn't been checked against a large batch of real material. Check whether
  `essentials` really yields a noticeably smaller deck on typical lecture slides, and whether
  `comprehensive` ever hits 16k on real uploads (watch the `deck truncated` warning log).
- Should a comprehensive run on very long material be split into chunked calls rather than
  capped? Not worth doing unless the truncation log shows it happening.

## Last updated
2026-09-25
