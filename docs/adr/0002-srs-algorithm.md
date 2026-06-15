# ADR 0002 — Spaced-repetition algorithm: SM-2 with exam-date compression

- **Status:** Accepted
- **Date:** 2026-06-15

## Context

Cram's core value is that reviews are scheduled so knowledge sticks **by the exam date**. We need a
spaced-repetition scheduling algorithm for v1. Options considered:

- **SM-2** — the classic SuperMemo 2 algorithm (also the basis of Anki's default). Simple,
  well-documented, easy to implement and reason about. State per card: ease factor, interval,
  repetitions.
- **FSRS** — a modern, ML-tuned scheduler with better retention/efficiency, but more complex,
  heavier to implement, and harder to explain in a portfolio context.

Cram also has a constraint generic SRS lacks: a **fixed deadline** (the exam). Standard SRS spaces
reviews out indefinitely; we need the schedule to **converge before the exam**, not after.

## Decision

- Use **SM-2** for v1. Each `Card` stores `easeFactor`, `intervalDays`, `repetitions`, `lapses`,
  and `dueDate`; a user recall rating updates these per the standard SM-2 formula.
- Add **exam-date compression**: cap/scale intervals so a card's reviews fit before `examDate`,
  front-loading weaker cards and weaker subjects (informed by the Grades section).
- Keep a **ReviewLog** of every review so we can later evaluate scheduling and migrate to FSRS
  without losing history.

## Consequences

- Fast to implement and easy to explain — good for an MVP and a portfolio.
- Exam-date compression is a Cram-specific extension on top of SM-2; the exact compression curve is
  an open question (see PRODUCT-SPEC §9) to tune with real use.
- The ReviewLog makes a future **migration to FSRS** possible without discarding study history.
