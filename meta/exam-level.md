# Exam level — Subject → Exam → Cards/Quiz

A new hierarchy level added 2026-07-07. A **Subject** now holds many **Exams**; each exam groups
the cards (and generated quiz) studied for one assessment and carries its own optional date.

## Decisions
- **New owned + syncable `exams` table**, sitting between Subject and Card/Quiz. It reuses the same
  mixins (`UUIDPkMixin, OwnedMixin, SyncMixin`) and gets the same treatment as every other domain
  table: `auth.users` FK + owner RLS policy, `user_id`/`updated_at` indexes for owner-scoped
  queries and `?since=` delta pulls, registered in `OWNED_MODELS`. It is the 10th resource in the
  router factory's `SPECS` list (`/v1/exams`, full CRUD via the same generic spec).
- **`exam.subject_id` is a required CASCADE FK** — an exam belongs to exactly one subject and dies
  with it. In the ORM, `Subject.exams` is `cascade="all, delete-orphan"`, and the repository's
  soft-delete `CASCADE` map tombstones exams when a subject is deleted.
- **`cards.exam_id` and `quizzes.exam_id` are NULLABLE FKs, `ON DELETE SET NULL`.** A card/quiz
  *outlives* its exam: an unassigned card belongs to the subject's unsorted **"General"** bucket,
  and deleting an exam leaves its cards/quizzes in place with a now-dangling `exam_id` that the
  client renders as "General". This deliberately mirrors the existing `card → source` relationship.
- **Exam has NO entry in the repository's soft-delete `CASCADE` map** — on purpose. Deleting an exam
  must *not* tombstone its cards/quizzes. (The DB-level `ON DELETE SET NULL` never fires either,
  because deletes are soft; the client does the "General" fallback by seeing a dangling id.)
- **Optional parent-ownership check.** `PARENTS` registers `exam_id` as an *optional* owned parent
  for Card and Quiz (must be owned when present), and `subject_id` as a *required* owned parent for
  Exam — so the anti-parent-stealing guard covers the new links without forcing every card to have
  an exam.
- **`exam_date` lives per exam, not per subject.** When set it drives that exam's countdown + SM-2
  exam compression — scheduling is per assessment, not per subject.
- **`/v1/generate` gains an optional `exam_id` form field.** Malformed → clean 422 parsed in the
  route (not a 500 deep in persistence); ownership enforced by the repository parent check. When
  given, the generated deck's cards + quiz are filed under that exam; otherwise "General". The
  enriched response echoes `exam_id`.
- **Migration `0005_exams`** follows the Supabase-specific pattern of `0002`/`0004`: raw-SQL
  `auth.users` FK + RLS policy, and a documented autogenerate-drift note (autogenerate wants to DROP
  the cross-schema `fk_exams_user` — always discard that diff).
- **`subject.exam_date` retired (2026-07-07, migration `0006`).** The pre-existing per-subject exam
  date is dropped now that exams carry their own — it couldn't express more than one exam and
  duplicated the authoritative per-exam date. Removed from the `subjects` column, `SubjectRead/
  Create/Update`, and the web `Subject`/`SubjectUpdate` types + `createSubject`. The web now derives
  a subject-level countdown from the subject's **soonest upcoming exam** (`subjectExamDate()` /
  `nearestExam(subjects, exams)` in `lib/dashboard.ts`); `loadDashboard` fetches `exams` so the
  dashboard/calendar/review/progress surfaces can compute it. The AI-Decks upload form dropped its
  "Exam date" input (exams are dated on the subject page). Review-session SM-2 compression now uses
  each **card's own exam** date (`card.exam_id → exam.exam_date`), not a subject-wide date.
- **Web: a reusable accessible `Modal` primitive** (`components/Modal.tsx`) — `position: fixed`,
  Escape/backdrop close, body-scroll lock, focus-move, `motion` enter/exit, reduced-motion aware.
  Built once, then used by new **`ExamFormModal`** and **`SubjectFormModal`** (create/edit with an
  inline-confirm Delete).
- **Web data layer:** `Exam`/`ExamCreate`/`ExamUpdate` types; `listExams/createExam/updateExam/
  deleteExam` + `deleteSubject` client fns; `loadSubjectBundle` now fetches `exams` in the same
  parallel fan-out and filters by `subject_id`. `GenerateMaterialForm` gains `examId` (file the deck
  under an exam) and `hideHeader` (so an embedding modal owns the title).

### Grade ↔ exam link + "Past exams" archival (2026-07-08, migration `0007`)
- **`grade_entries.exam_id` is a NULLABLE FK, `ON DELETE SET NULL`** — the same shape as
  `cards.exam_id`/`quizzes.exam_id`. A grade that records an exam's result points at that exam; a
  standalone mark (homework, participation) leaves it null. The grade *outlives* its exam.
  `PARENTS[GradeEntry]` registers `exam_id` as an *optional* owned parent (owned when present).
- **"Done" is DERIVED, not a stored flag.** An exam is finished ⇔ a live `grade_entries` row points
  at it. There is no `status`/`archived_at` column and no explicit archive action: recording the
  grade *is* the archive, and deleting the grade un-archives it (fully reversible). The client
  computes active-vs-past exams from the grade set it already loads.
- **Client archival behaviour (web):** a graded exam drops out of the subject page's active **Exams**
  list into a collapsed **"Past exams"** section (still openable to study its cards/quiz, shows the
  earned grade as a pass/fail badge). Its cards are also excluded from the subject's active due-count
  and "Study whole subject" set, so grading actually *reduces* revision load. General (exam-less)
  cards and active-exam cards are unaffected.
- **Grades page is the single grade editor, exam-aware.** "New subject" was removed from Grades
  (subjects are created only in the Subjects section — one home for that action). The logger is a
  guided **Subject → Exam → grade**: the exam picker lists only that subject's *ungraded* exams plus
  a "No specific exam (standalone)" option; picking an exam prefills its title + date. A grade in the
  Grades list deep-links to `/subjects/{id}?exam=<id>`, which opens that exam in Past exams.
- **iOS parity (data only):** `examId: UUID?` added to the `GradeEntry @Model` + `GradeEntryRead/
  PushDTO` + `SyncService` mapping. Stored as a bare id — iOS has no `Exam @Model` yet — so the link
  survives a sync round-trip. No iOS UI change.

## Reasoning
- Users study for *specific exams*, not just a subject as a whole. Grouping cards per exam makes the
  countdown and exam-mode SRS compression meaningful at the granularity people actually revise at.
- **Why nullable / SET NULL / "General" instead of required:** forcing every card into an exam would
  break existing decks (there were none at migration time) and make quick capture heavier. The
  nullable link + "General" bucket is the same proven shape as `card → source`, so the sync client,
  soft-delete model, and offline fallback all already know how to handle a dangling optional FK.
- **Why no cascade tombstone on exam delete:** deleting an assessment you've finished shouldn't
  destroy the flashcards you made — they should survive and rejoin "General". A hard cascade would
  also leave offline clients with ghost rows (no child tombstone is emitted), the same reasoning
  that governs the whole soft-delete-cascade design in [[data-layer-and-sync]].
- **Why parse `exam_id` in the route:** keeps a bad id a clean 422 at the edge rather than a 500 in
  persistence, consistent with how the generate endpoint validates `kind`/file limits up front.
- **Why a shared Modal primitive now:** two dialogs (exam + subject) landed at once; extracting the
  focus/scroll-lock/animation/a11y concerns once keeps every dialog reading and behaving the same.
- **Contract-first for two clients:** the model docstring and migration explicitly mirror a future
  `ios/Cram/Models/Exam.swift @Model`, so the web and iOS clients push to one contract — the same
  discipline used across the sync layer ([[ios-sync-client]]).
- **Why derived archival over a status flag:** "graded" is already the ground truth for "this exam is
  behind me", so a separate `archived` flag would be a second source of truth that could drift from
  the grade. Deriving it keeps one fact, makes un-archiving free (delete the grade), and adds no
  migration surface beyond the FK. Same instinct as reading a card's due-ness from its SM-2 state
  rather than storing a "due" boolean.
- **Why the grade outlives its exam (SET NULL):** a recorded mark is real-world history; deleting the
  exam (or it not yet having synced) must not erase the grade. Identical to why cards outlive exams
  and sources ([[data-layer-and-sync]]).

## Implications
- Sync clients must treat a card/quiz whose `exam_id` points at a missing (deleted or not-yet-pulled)
  exam as **"General"**, never as an error. This is now part of the sync contract.
- The **iOS** client (Phase 5) must add a matching `Exam @Model`, the `exams` resource to its sync
  push/pull set, and the nullable `exam_id` on Card/Quiz — see [[ios-sync-client]]. The backend
  contract is already in place and green.
- **iOS still references `Subject.examDate`** (model + `daysUntilExam`, sync DTOs, `SyncService`, and
  the exam-compression path in `Scheduler.swift`). This retire was **backend + web only** (a
  deliberate scope call — iOS builds/tests on a Mac and has no `Exam` model yet). After migration
  `0006` the backend neither stores nor returns `subjects.exam_date`, so iOS's `examDate` is now a
  **dead field** (never persisted; decodes to `nil` on pull). Phase 5 must, on the Mac, drop
  `Subject.examDate` and move iOS exam compression onto the new `Exam` model to match the contract.
- Exam-scoped countdown + SM-2 exam compression can now be built against `exam.exam_date` on either
  client without further backend work.
- Any future "list cards for exam X" view filters client-side on `exam_id` over the existing delta
  endpoints — no new endpoint needed (consistent with the fetch-and-filter approach in
  [[web-dashboard]]).
- **Migration `0007` applied to prod 2026-07-08** (direct 5432 connection). The DB column exists, but
  the change is **useless until the backend CODE ships** — the currently-deployed FastAPI predates
  `0007`, and Pydantic silently drops the extra `exam_id` on create, so a grade's exam link won't
  persist until the backend is redeployed. Migration-before-code is the safe order (a new nullable
  column sits inert; the reverse would 422 every grade). See [[deployment]].
- **iOS** must eventually add the `Exam @Model` and wire the grade-from-exam UI; the stored
  `GradeEntry.examId` is a forward-compat placeholder until then ([[ios-sync-client]]).

## Open questions
- ~~Should `subject.exam_date` be retired now that exams carry their own date?~~ **Resolved
  2026-07-07:** retired on backend + web (migration `0006`); iOS reconciliation deferred to Phase 5
  (see Implications).
- No UI yet for *moving* an existing card between exams / into "General" (the FK supports it via
  `PATCH /v1/cards {exam_id}`; the surface isn't built).
- Exam-mode SM-2 compression is described in the contract (per-exam `exam_date`) but the scheduler
  behaviour that consumes it is not yet wired on the web review flow.
- Grade-linked archival allows only one grade per exam through the guided logger (a graded exam
  leaves the picker). A second mark for the same exam can still be added as a standalone grade via
  the per-subject panel; whether multiple weighted grades should attach to one exam is unresolved.

## Last updated
2026-07-08
