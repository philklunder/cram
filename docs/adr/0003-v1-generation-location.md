# ADR 0003 — Where AI generation runs for the local-only iOS v1

- **Status:** Accepted
- **Date:** 2026-06-15

## Context

The iOS app is built first as a **local-only** client (SwiftData, no backend yet; see ADR 0001).
But the core feature — turning a source into flashcards and quizzes — needs the Claude API, and the
Claude key must **never ship in a client** (see ARCHITECTURE.md, PRODUCT-SPEC §8). That creates a
gap during the v1 window: the app needs generated content before the FastAPI backend exists.

Options:

- **A — Backend from day one.** Stand up a minimal FastAPI generation endpoint on Windows before
  the iOS app can generate, even though everything else stays local. Most production-faithful, but
  front-loads backend work and a network dependency into the "local-only" phase.
- **B — Stubbed generation.** Ship hand-authored sample decks (fixture JSON) in the app so the
  whole study loop — SRS, grades, progress — is buildable and demoable without any Claude call.
  Real generation waits for the backend.
- **C — Direct Claude call from the client (dev only).** Fastest path to real generated content,
  but it puts the key on-device. Unacceptable beyond a throwaway local experiment.

## Decision

- **Build the study loop against stubbed generation (B)** for local-only v1: the SRS engine,
  grades, and progress are exercised by fixture decks and a `GenerationService` protocol with a
  stub implementation.
- **Define `GenerationService` as a protocol** so the stub can be swapped for a real backend client
  with no change to call sites — generation is treated as a boundary from day one.
- When the backend lands, add a `RemoteGenerationService` that calls the **FastAPI** endpoint (A);
  Claude is reached server-side only.
- **Reject on-device Claude calls (C)** — the key never lives in a client, even in development.
- **Pull one slice of the backend forward (amendment):** stand up a *minimal* generation endpoint
  early — a single Claude call (PDF/image → cards/quiz JSON), no auth or database — so the real
  prompts and real generated content can be validated *while* the study loop is built, rather than
  deferring all AI work to the full-backend milestone. This is `RemoteGenerationService` arriving
  early for one route; it does not change the local-only data story. Prompt quality (turning messy
  material into good cards) is the product's real risk, so it should be exercised against real
  Claude output as soon as possible — not only against fixtures.

## Consequences

- The iOS app is fully buildable and demoable before any backend exists, without leaking a key.
- The full SRS / grades / progress logic gets exercised early against deterministic fixtures.
- Fixtures keep the loop deterministic, but the *minimal generation endpoint* means real Claude
  output and prompt quality are validated early, before the UI hardens around an idealized shape.
- Real generation is gated on the backend; until then, content is sample data, not user material.
- This keeps PRODUCT-SPEC §9's "where does generation run" question answered for v1 and defers only
  the *production* generation path to the backend milestone.
