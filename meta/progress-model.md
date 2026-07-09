# Progress model — practice vs assessment

How Cram decides what you know. This is the app's measurement contract; it constrains every surface
and both clients. Implemented in `web/src/lib/readiness.ts` (2026-07-09).

## Decisions

- **Practice is activity; only a Review is progress.**
  - **Flashcards** (`FlashcardPractice.tsx`) and **Quizzes** (`QuizRunner` with `mode="practice"`) are
    for viewing and learning. They record study time (`POST /v1/study-sessions`) — so they feed the
    streak and the weekly-activity chart — and write **nothing else**.
  - **Review** (`ReviewRun.tsx`) is the assessment, in two phases:
    1. *Recall* — `ReviewSession.tsx`, rate Again/Hard/Good/Easy → `PATCH /v1/cards` + `POST /v1/review-logs`
    2. *Test* — `QuizRunner` with `mode="test"` → `POST /v1/attempts`
  - Those two writes are the **only** inputs to progress. No other surface may emit them.
- **Readiness = 0.5 × cardMastery + 0.3 × quizAccuracy + 0.2 × coverage.**
  - `cardMastery` = `(mastered + 0.5 × learning) / total` over SM-2 state (`lib/progress.ts` buckets).
  - `quizAccuracy` = mean score of the **last 20** in-scope attempts.
  - `coverage` = fraction of in-scope topics with ≥1 reviewed card or ≥1 answered question.
  - A **missing signal's weight is redistributed** across the signals that exist.
  - `verdict: "untested"` is a first-class state, distinct from a score of 0.
- **Quiz answers never touch a card's SM-2 schedule.** The two signals stay separate and are only
  combined at the readiness layer.
- **One definition, app-wide.** Dashboard, Progress, Calendar and the Review hub all call
  `computeReadiness` / `readinessBySubject` / `overallReadiness`. No surface derives its own.
- **`examReadiness()` falls back to the subject** when an exam has no material of its own, and returns
  `scope: "exam" | "subject"` so the UI can say which it scored.
- **Review settings are device-local** (`lib/reviewSettings.ts`): `sessionSize`, `order`, and
  `questionCount` (0 · 3 · 5 · 10; `0` = cards-only Review). `questionCount` is what bounds the paid
  grading spend of a daily review.

## Reasoning

- **Why practice can't count.** Rehearsing a card until you can parrot it says nothing about cold
  recall in three weeks. If practice moved the score, readiness would measure *effort*, not knowledge —
  and the number a learner leans on before an exam would be systematically inflated by the cheapest
  possible activity.
- **Why quiz answers don't move cards.** A `Question` has **no SM-2 state and no foreign key to a
  `Card`**; they share only a `topic` string. Folding a quiz answer into a card's schedule would mean
  inventing a join on that string, where one wrong answer penalises cards the learner demonstrably
  knows. *Rejected:* topic-overlap joins. *Rejected:* mastery-from-cards-only (then the test phase
  measures nothing).
- **Why practice writes no attempts rather than tagged attempts.** `attempts` has no source column.
  Distinguishing practice from test server-side needs a migration **plus iOS parity**. Simply not
  writing the row is free, needs no schema change, and is equally correct — `attempts` then *means*
  "answered under test conditions", which is exactly what readiness wants.
- **Why weight redistribution.** A subject with flashcards but no quiz would otherwise be permanently
  capped at 70% through no fault of the learner. Scoring only the signals that exist is the honest read.
- **Why `untested` is not 0%.** An untested subject is an *unknown*, not a failure. Rendering it as 0%
  is a lie that makes a fresh subject look catastrophic and a reviewed one look barely better.
- **Why the exam→subject fallback.** The AI Decks upload defaults its exam picker to "General"
  (`exam_id: null`), so **most material has no exam**. Strict per-exam scoping would report "Untested"
  for an exam whose subject the learner has reviewed heavily. Falling back and labelling the scope is
  more useful than either a wrong number or a blank.
- **Why `(mastered + 0.5 × learning)`, not `mastered / total`.** "Mastered" requires
  `repetitions >= 2 && interval_days >= 21`. Under `mastered / total` a fresh deck reads **0% for the
  first ~4 successful reviews of each card, spread over ~3 weeks** — reviewing appears to do nothing.
  Partial credit for a card in learning makes a single honest Review visibly move the number.

## Implications

- **Any new surface that studies cards must be a Review, or write nothing.** Adding a "quick rate"
  affordance to Flashcards would silently re-couple practice to progress.
- **The four-button rating is Review-only.** All SM-2 ratings (1/3/4/5) are still reachable on web, but
  only inside a Review — matching iOS. The Flashcards Missed/Got-it tally is ephemeral and emits nothing.
- **`attempts` rows are now assessment-grade data.** The dashboard's "quiz average" changes meaning
  from "how I did while practising" to "how I did when tested" — a better stat, but not comparable to
  historical rows written before 2026-07-09.
- **iOS has no parity yet.** It has no Review-run concept, no `questionCount` setting, and its practice
  surfaces (if any) must not write SM-2 or attempts once they exist.
- **Readiness needs the quiz side.** Any page showing it must load `questions`, `quizzes` and
  `attempts`, not just `cards`. `loadDashboard()` already returns all four.
- **Short-answer questions in a Review cost money** (`POST /v1/grade`, behind the spend cap).
  `questionCount` is the only lever bounding that; a `0` setting makes a Review free.

## Open questions

- **Readiness weights (0.5 / 0.3 / 0.2) are a considered guess, not calibrated.** Nothing validates
  them against real exam outcomes. The grade↔exam link (migration `0007`) is the data that could
  eventually calibrate them — a recorded grade is ground truth for the readiness that preceded it.
- **General material can't score a specific exam.** Options: attribute by topic overlap, or default the
  AI Decks exam picker to the soonest upcoming exam. Until then `examReadiness()` falls back.
- **Practice short answers still spend.** `POST /v1/grade` is what grades free text, so a practice
  short-answer question costs a call even though no attempt is written. Only the row is suppressed.
  Open: a local heuristic grader for practice.
- **`StudyKind` has no flashcard member.** Flashcard practice records `kind: "other"`; `"review"` would
  inflate the review count. A `"flashcards"` member needs a backend enum change + iOS parity.
- **iOS parity for the whole model** is unscheduled (Phase 5 territory).

## Last updated

2026-07-09
