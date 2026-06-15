# ADR 0004 — Exam-date compression of the SM-2 schedule

- **Status:** Accepted
- **Date:** 2026-06-15

## Context

Standard SM-2 (ADR 0002) spaces reviews out indefinitely with no notion of a deadline. Cram's
differentiator is that the schedule must **converge before the exam date**, peaking on the day it
matters. We need a defined rule for how a card's SM-2 interval is bent toward `examDate` — and how
the Grades section (weak vs. strong subjects/topics) shifts that emphasis. The exact curve is an
open tuning question; this ADR records the *approach* so it's tracked, not the final constants.

Constraints and inputs:

- A card's next review may not land after `examDate` — late reviews are worthless.
- Time remaining shrinks every day, so compression must be a function of **days-to-exam**, not a
  fixed factor.
- Weak subjects/topics (from grades + in-app mastery) should be reviewed **earlier and denser**;
  strong ones can keep wider spacing.
- Subjects with **no exam date** fall back to plain SM-2 (no compression).

## Decision

- **SM-2 stays the source of truth.** A card's canonical state (`easeFactor`, `intervalDays`,
  `repetitions`, `lapses`) is updated only by the standard SM-2 formula and is never overwritten by
  compression. Compression is a **separate scheduling layer** that derives an *effective due date*
  from the SM-2 interval; this prevents repeated compression from compounding and corrupting the
  ease math.
- After SM-2 proposes `intervalDays`, apply a **compression step** that scales that interval down as
  `examDate` nears to produce the effective `dueDate`, and **clamps it to on/before `examDate`**.
- Model compression as a multiplier on the proposed interval driven by `daysToExam` and a
  per-card/per-topic **strength weight** (lower strength → stronger compression → earlier reviews).
- Keep the curve and its constants **configurable and isolated** in the scheduler, so they can be
  tuned against real `ReviewLog` data without touching call sites.
- Start simple (e.g. an interval cap proportional to remaining days, biased by strength) and refine
  empirically; the `ReviewLog` provides the data to evaluate and adjust.

## Consequences

- Reviews provably finish on or before the exam, with weak material front-loaded.
- Because SM-2 state is preserved, a subject's schedule degrades cleanly to plain SM-2 if the exam
  date is removed or after it passes — no accumulated distortion to undo.
- The exact multiplier/curve remains an open tuning question (PRODUCT-SPEC §9) pending real usage.
- Isolating the curve keeps a later move to FSRS (ADR 0002) or a re-tuned curve low-risk.
- No-exam-date subjects degrade gracefully to standard SM-2.
