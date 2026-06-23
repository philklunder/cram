# iOS Sync Client (offline-first delta sync)

> The **client side** of v0.5 Phase 5. Pairs with [data-layer-and-sync.md](data-layer-and-sync.md)
> (the backend contract this consumes) and sits beside [ios-auth-client.md](ios-auth-client.md)
> (the auth it rides on). Cross-refs ADR 0007/0008.

## Decisions
- **Offline-first, last-writer-wins.** Local writes always succeed instantly against SwiftData; a
  background engine (`SyncService`) reconciles with the backend. Each cycle is **push-then-pull**:
  send pending local changes first, then apply remote rows authoritatively.
- **Sync metadata lives on the models, set through helpers.** The six syncable `@Model`s gained
  `updatedAt` / `deletedAt` / `needsSync`; the two append-only logs (`ReviewLog`, `Attempt`) gained
  only `needsSync`. All mutations route through `touch()` / `softDelete()` (a `Syncable` /
  `AppendOnlyModel` protocol) rather than raw edits / `context.delete`, so dirty-tracking and
  tombstones are uniform. Fields have inline defaults → SwiftData lightweight migration, no manual step.
- **Deletes are tombstones, not hard deletes.** `softDelete()` sets `deletedAt`; the engine `DELETE`s
  server-side, then hard-removes the local row. A bare local delete would never propagate.
- **Conflict skip rule:** on pull, overwrite local with remote *unless* the local row has an
  un-pushed edit at least as new (`needsSync && updatedAt >= remote.updatedAt`) — it wins next push.
- **Generated decks adopt the server's row ids.** `/v1/generate` already persists the deck under the
  caller and returns the enriched ids; `RemoteGenerationService`/`DeckIngest` use them and mark the
  rows `needsSync = false`. The offline stub leaves ids `nil` → fresh local ids, pushed as new.
- **Cursors are namespaced per user** (`SyncCursorStore`, `UserDefaults`), reset on sign-out; a
  *different* user signing in wipes the local store so a fresh `since=nil` pull rebuilds.
- **Triggers are throttled, 429s are soft.** Automatic triggers (launch / foreground / open-detail /
  post-write) debounce then obey a 15 s minimum interval (a *trailing* throttle — pending work is
  deferred, never dropped); manual pull-to-refresh and the launch sync bypass it. A `429` is parsed
  as `rateLimited(retryAfter:)`, backed off and resumed quietly — not shown as a failure.

## Reasoning
- **Why LWW + push-then-pull.** A single-user-across-devices app doesn't need CRDTs; LWW is the
  simplest correct policy. Pushing first means our own pending edits reach the server before we pull,
  so the pull rarely has to arbitrate — and when it does, the skip rule protects un-pushed local work.
- **Why the server-id adoption is load-bearing.** The backend find-or-creates and persists generated
  decks server-side. If the client kept minting its own ids for the same deck, the *first* pull would
  duplicate every generated subject/source/card/quiz/question. Adopting the returned ids is the only
  thing that makes generation and sync coexist. A subject-push nudge on detail-open further ensures
  the server reuses the local subject id (it find-or-creates *by name*) instead of forking a new one.
- **Why metadata on models + helpers, not a separate change-log table.** SwiftData has no global
  on-save hook, so a dirty flag the mutation sites set explicitly is the least-magic option that can't
  silently miss a write. There are few mutation sites and they're all in-app.
- **Why fetch-all-and-filter for pending rows, and concrete per-type fetches.** `#Predicate` only
  compiles reliably over a *concrete* model's stored-property keypath — a generic `#Predicate { $0.needsSync }`
  over a protocol requirement is fragile. Dataset sizes are modest, so in-memory filtering is fine.
- **Why throttle + soft 429.** Each sync fans out one request per resource (~16), and triggers fire
  often; against the backend's per-minute rate limit (ADR 0009) a trigger storm trips a `429`. The
  trailing throttle collapses storms into one sync without losing pending work; honouring `Retry-After`
  makes a throttled sync self-heal instead of surfacing a scary error. See
  [cost-controls.md](cost-controls.md) for the server side of this interaction.

## Implications
- The HTTP client (`CramAPIClient`) mirrors `RemoteGenerationService`'s hardening exactly (HTTPS-only
  bearer, 401 → re-auth, generic error masking), so the sync surface adds no new security posture.
- Wire is snake_case ↔ camelCase via `.convert*SnakeCase`; a custom ISO-8601 date strategy tolerates
  Postgres microseconds + offset (the built-in `.iso8601` rejects fractional seconds).
- Resources are processed parent→child on both push and pull so foreign-key relinking always finds its
  parent (subjects → sources/quizzes → questions/cards → grade-entries → logs/attempts).
- **Source file *bytes* are not synced** — only the row metadata (`fileNames` ↔ `storage_paths`). A
  fresh device gets the cards but not the original file. Deliberate scope cut.

## Open questions
- File-bytes up/download to Supabase Storage (signed URLs) for true cross-device source fidelity.
- Generate by `subject_id` instead of name, to close the last subject-fork window without the
  detail-open push nudge.
- Whether the per-resource pull (8 GETs every cycle even when nothing changed) is worth coalescing
  behind a single multi-resource delta endpoint if request volume becomes a concern.

## Last updated
2026-06-23
