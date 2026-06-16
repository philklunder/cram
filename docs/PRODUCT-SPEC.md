# Cram — Product Spec

- **Status:** Draft v1
- **Date:** 2026-06-15
- **Owner:** Philipp Klunder

## 1. Summary

Cram is an **exam-prep study app for students**. You give it your course material; it generates
**flashcards and quizzes** and uses a **spaced-repetition engine** to schedule reviews so the
knowledge sticks — with the schedule compressed to **peak on your exam date**. It knows your
**real grades**, so it spends your study time where it actually matters.

The differentiator vs. generic flashcard apps (e.g. Anki): Cram is **deadline-aware** and
**grade-aware**. It doesn't just review forever at a flat pace — it works backward from your exam
and forward from how you're really doing.

## 2. Target user

University and school **students preparing for exams**. They have finite time, multiple subjects,
real deadlines, and real grades they care about. Tone: focused, motivating, honest.

## 3. The core loop

1. **Ingest** — add source material to a subject.
2. **Generate** — Claude extracts key concepts → flashcards (Q/A) and quiz questions, each tagged
   by **topic** and rated by **difficulty**.
3. **Study** — a daily session surfaces due flashcards (and periodic quizzes), driven by the SRS.
4. **Rate & grade** — you rate recall on each card; Claude grades short-answer quiz responses.
5. **Adapt** — the SRS reschedules each card; weak topics and weak subjects get more attention,
   paced toward the exam date.

## 4. v1 scope (iOS-first)

**In scope for v1:**

- **Subjects** with a name and an **exam date** (e.g. "Biology Final · 13 days left").
- **Inputs:** **PDFs / slides** and **photos of pages/notes** (both via Claude's vision +
  long-context — one shared ingestion path).
- **Flashcards** as the daily SRS driver; **quizzes** as a periodic "test yourself" mode.
- **Spaced repetition** using the **SM-2** algorithm (see ADR 0002), with exam-date compression.
- **Grades section** (see §6) — record real marks per subject; informs prioritization & difficulty.
- **Progress** — cards mastered vs. shaky, and an "on track for the exam?" readout.

**Deferred to v2+:**

- **Web articles / YouTube** as input (needs fetching + transcript handling).
- **Lecture audio** as input (needs speech-to-text).
- Backend sync, web dashboard, accounts/auth (built on Windows; clients are local-only first).
- Collaboration / shared decks, notifications/reminders.

## 5. Data model

Shared concepts (the iOS app models these as SwiftData `@Model` classes; the backend will mirror
them in Postgres later).

- **Subject** — a course being studied.
  - `name`, `examDate?`, `gradingScale`, `targetGrade?`, `currentGrade?` (entered or auto-averaged)
- **Source** — a piece of ingested material belonging to a subject.
  - `kind` (`pdf` | `photo`; later `web` | `youtube` | `audio`), `title`, `addedAt`, raw reference
- **Card** — a flashcard generated from a source.
  - `front`, `back`, `topic`, `difficulty`, plus **SRS state**: `easeFactor`, `intervalDays`,
    `dueDate`, `repetitions`, `lapses`
- **Quiz / Question / Attempt** — periodic self-tests.
  - Question: `prompt`, `kind` (`multipleChoice` | `shortAnswer`), `topic`, `answerKey`
  - Attempt: `response`, `isCorrect`, `score`, `gradedAt`
- **GradeEntry** — a real-world mark (see §6).
- **ReviewLog** — one record per card review (`cardRef`, `date`, `rating`) for analytics & SRS.

## 6. Grades section

**Purpose:** give Claude **ground-truth** on how you're actually doing in each subject, so it
calibrates difficulty, prioritizes weak subjects, and paces toward a target. Two signals combined:
**in-app mastery** (flashcard/quiz performance) + **real-world grades** (self-reported). When they
disagree (acing flashcards but bombed the exam), that's the most useful signal of all.

**What you record (per subject):**

- A list of **grade entries**: `{ title, kind (exam | test | assignment | overall), score,
  weight, date }` — e.g. "Midterm · 2.3 · 30% · 2026-05-12".
- A **current grade** (entered, or auto-averaged from the weighted entries).
- A **target grade** you're aiming for.
- A **grading scale** — configurable; **defaults to the German 1.0–6.0 scale** (1 = best), with
  percentage, letter (A–F), and GPA as alternatives.

**How Claude uses it:**

1. **Prioritization** — weaker subjects get more cards and earlier, denser scheduling.
2. **Difficulty calibration** — strong subject → harder, application-style questions; weak
   subject → more foundational ones.
3. **Gap-to-target** — "you're at 3.0, aiming for 1.7 — here's the work to close it," paced toward
   the exam date.
4. **Honest feedback** — progress narratives reference real grades, not just app activity.

**Privacy:** grades are sensitive and self-reported; stored per user, never shared.

## 7. iOS screens (v1)

- **Subjects** — list of courses, each showing days-to-exam and current grade.
- **Subject detail** — sources, topics, grades, and "study now."
- **Add material** — pick a PDF or snap photos → generates a deck.
- **Study** — the daily session: due flashcards + occasional quizzes; rate recall, advance.
- **Grades** — add/edit grade entries and the target; see current standing.
- **Progress** — mastery per topic and exam-readiness.

## 8. AI pipeline (backend + Claude)

Runs server-side (the Claude key never lives in a client). The local-only iOS v1 runs against a
`StubGenerationService` by default; a **minimal backend generation endpoint now exists**
(`POST /v1/generate` — one Claude vision call → structured deck JSON, see ADR 0005), which the iOS
`RemoteGenerationService` targets when configured. The full production backend (persistence, auth)
is still ahead.

1. **Extract** — source material (PDF text / image) → Claude identifies key concepts per topic.
2. **Generate** — Claude writes flashcards and quiz questions, tagged by topic and difficulty,
   returned as structured JSON.
3. **Grade** — Claude grades short-answer quiz responses (so it's not multiple-choice-only).
4. **Schedule** — the SRS engine (SM-2) sets each card's next review, compressed to the exam date
   and weighted by grade/topic strength.
5. **Coach (later)** — periodic plain-language feedback referencing grades and progress.

## 9. Open questions

- Exact exam-date compression: how aggressively to shorten SM-2 intervals as the exam nears
  (approach recorded in ADR 0004; the curve/constants are tuned with real `ReviewLog` data).
- Auto-average vs. manual `currentGrade`, and how weights interact with the chosen scale.
- Where generation runs for the local-only iOS v1 — decided in ADR 0003 (stubbed behind a
  `GenerationService` protocol; real generation via the backend later).
- Offline behavior once the backend exists (cache decks locally, sync reviews later).
