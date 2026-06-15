# ADR 0001 — Stack: SwiftUI + SwiftData iOS client, FastAPI + Claude backend

- **Status:** Accepted
- **Date:** 2026-06-15

## Context

Cram is a multi-client exam-prep study app: a native iOS client, a Next.js web dashboard, and a
shared backend that talks to the Claude API. We need a stack that supports a native Apple
experience, a real multi-client API, and a server-side AI integration. The iOS app is built first,
local-only, then wired to the backend.

This stack and project format are carried over from the earlier Pulse project (same author, same
tooling), which validated that the iOS scaffold builds from the command line with stock Xcode.

## Decision

- **iOS UI:** SwiftUI.
- **iOS persistence:** SwiftData (`@Model`), Apple's modern Swift-native store — less boilerplate
  than Core Data and a clean mapping to the shared data model.
- **iOS project format:** a hand-written `.xcodeproj` using `objectVersion = 77` with a
  **PBXFileSystemSynchronizedRootGroup**, so new Swift files in `ios/Cram/` are picked up
  automatically and the project file rarely needs editing.
- **Deployment target:** iOS 18.0 (SwiftData requires iOS 17+; 18 keeps APIs current).
- **Swift language version:** 5.0 build setting, to avoid Swift 6 strict-concurrency friction in
  the MVP.
- **Backend:** FastAPI (Python), owning the data model, auth, ingestion/generation pipeline, and
  all Claude API calls. The AI key is **server-side only**.
- **Database / auth:** Supabase (Postgres + Auth + Storage).
- **Web:** Next.js + React.
- **Repo:** a fresh repo (`~/Developer/cram`), separate from Pulse, since Cram is a distinct
  product even though it reuses the stack.

## Consequences

- No XcodeGen/Tuist dependency; the iOS app builds with stock Xcode.
- SwiftData is local-only first; backend sync layers on top without changing the model shape.
- Backend and web are developed on Windows per the platform split; the Mac builds the iOS app.
- The Claude integration is centralized server-side, keeping the key out of clients and letting
  both clients share one generation/grading pipeline.
