# Web redesign — clarity pass (2026-07)

Ongoing redesign of the authenticated web app for legibility ("too much on screen, I lose the
overview"). Driven from an interactive mockup the owner approved surface-by-surface. This file
captures the cross-cutting decisions; per-surface visual history stays in
[web-dashboard.md](web-dashboard.md).

## Decisions

- **One meaning per colour, enforced through shared helpers.** Semantic green/amber/red = *quality
  and urgency only*; the violet `brand` = *actions and current selection only*; a subject's own
  `--sc-*` accent survives **only in its monogram tile**. Readiness bars now fill from
  `VERDICT_FILL` / `scoreFill` (added to `lib/readiness.ts`, keyed on the same verdict thresholds
  that already existed), never from `--sc-solid`.
- **The SM-2 scheduler is immutable relative to iOS.** `lib/srs/scheduler.ts` must stay
  behaviourally identical to `ios/Cram/Study/Scheduler.swift` (last-writer-wins sync would otherwise
  flip-flop a card's schedule; `scheduler.test.ts` pins the vectors). Where all four rating previews
  are identical (a fresh card → 1 day for Again/Hard/Good/Easy), **hide the interval preview** rather
  than fake a spread; it reappears once the card has history and the intervals genuinely diverge.
- **Grades render in each subject's own scale; one weighted average.** Current/Target/Latest all show
  the native grade (German 1.7, Swiss 5.5), never a normalized %. The headline average is **weighted
  by each entry's `weight`** (a 40% final outweighs a 10% quiz). The freed KPI slot became "Below
  target". (Owner decision, 2026-07-13.)
- **Quizzes stays a separate surface from Review** (merge deferred, not rejected). (Owner decision.)
- **Dates are pinned to `en-GB` (`DATE_LOCALE` in `lib/format.ts`).** The app copy is hard-coded
  English; `toLocaleDateString(undefined, …)` was picking up the browser locale ("13. Juli 2026").
- **Sidebar nav is grouped: Dashboard · Study · Library · Insights · Settings.** Ten flat items read
  as unranked doors; `nav-items.ts` gained a `group` field and a `badge` field (Review shows a live
  due-count from the shared library snapshot, rendering nothing when zero).
- **The whole rail must fit without scrolling at ~660px of `svh`** (a maximized browser on a 768px
  laptop). The Go Premium card and the sidebar streak were compacted to single rows and the nav's
  vertical rhythm tightened. The rail keeps `overflow-y-auto` only as an extreme-zoom safety net.
- **Dashboard is one stacked column of four regions, no right rail:** hero (workload sentence +
  primary/secondary CTA) → hairline **figures strip** → 3-up subject cards (each with a
  weakest-topic footer) → full-width weekly-activity chart. "Add material" moved to a **persistent
  top-bar button** (reachable from every page); the duplicate weekly chart and "Upcoming reviews"
  were removed; "Focus areas" folded onto each subject card.
- **Flashcards (2026-07-13):** the practice contract stated in the header ("Free practice · doesn't
  change your score"), stat cards → the same hairline figures strip (Mastered green, Shaky red), the
  right rail deleted (its mastery ring, deck list and "Suggestions" all duplicated existing
  controls), and the card grid replaced by dense rows carrying a single three-state chip
  (Mastered/Learning/Shaky). The **internal SM-2 difficulty scalar is gone from the UI** — the D1–D5
  filter, the "Hardest" sort (now "Weakest first", by mastery bucket) and the per-card D-badge +
  progress bar all removed. The topic pill is **neutral, not the subject accent**, since this is a
  single-subject view with no monogram and a rose tint sat beside the red Shaky chip. The disabled
  "Edit (coming soon)" affordance was removed entirely.
- **`estimateReviewMinutes` is one shared helper** (`lib/dashboard.ts`), used by the dashboard hero
  and the Review hub so the "~X min" figure can't disagree between them.

## Reasoning

- **The bug list that started this was mostly wrong — verification method matters.** Three of five
  reported "bugs" (quiz score reading 33%, "1 days" exam tile, a 3-vs-8 due-count contradiction) were
  **screenshot artifacts**: `useCountUp` animates every figure up from 0, and headless screenshots
  captured them mid-animation. `useCountUp` honours `prefers-reduced-motion` by jumping to the final
  value, so **visual verification of any number must force reduced motion** (or wait out the ramp).
  Only two of the five were real (readiness-bar colour, calendar locale). Lesson recorded so a future
  session doesn't "fix" a working component.
- **Why not Anki-style learning steps** (`<10 min / 1 day / 3 days / 6 days`) to differentiate the
  ratings: it would require changing `scheduler.ts` **and** `Scheduler.swift` together plus a new ADR
  and new test vectors. Out of scope for a web clarity pass; hiding the degenerate preview is the
  honest, zero-risk move.
- **Why grades in native scale:** a 1.7 German target is not "86%" to anyone using it; mixing a
  normalized % (Current/Target) with a raw mark (Latest) in one row was the actual confusion. The
  device-local `displayScale` preference still governs *aggregate* numbers (see web-dashboard.md);
  per-subject rows are always native.
- **Why the figures strip and subject grid use a `-m-px` divider trick:** each cell carries
  `border-l border-t` and the grid is pulled out by `-m-px` under an `overflow-hidden` container, so
  the outermost borders tuck under the container border and every internal seam is a single hairline
  at any responsive column count (2-up mobile → 4-up desktop). Avoids the `divide-x`/`divide-y`
  wrong-edge problem on wrapping grids.
- **Why the subject card shows "Weakest: <topic>" as text, not a "Review N →" link:** the whole card
  is already a `<Link>` to the subject detail, and nesting an `<a>` in an `<a>` is invalid. The
  review action lives on the subject detail page instead.

## Implications

- Any new readiness/quality bar must use `VERDICT_FILL`/`scoreFill`, never a subject accent. A
  future foreign design dropped into the app inherits the same colour law.
- `estimateReviewMinutes` and the readiness verdict thresholds are now single-source; changing the
  per-card time or the ready/almost cutoffs is a one-place edit.
- The grouped `nav-items.ts` is the one source for the sidebar and any future command palette.
- Removing the dashboard right rail deleted `AddMaterialCard`, `UpcomingReviewsCard`,
  `FocusAreasSection`, `RailCard` and the `StatTile`/`Quiz`/`ExamStatTile` trio; the dashboard is now
  a single-column `DashboardView` + a `FiguresStrip`.

## Open questions

- **Focus areas as its own cross-subject row** was folded into the subject cards per the approved
  mockup; reversible if the owner wants the standalone view back.
- **Quizzes ⇄ Review merge** is deferred, not decided. Review already ends with a test phase, so
  Quizzes may reduce to "Review, test phase only" — a decision that reshapes three surfaces.
- **Partial credit toward readiness:** grading stays a simple percentage + sentence (owner
  decision); whether a 0.7 should contribute 0.7 to readiness vs pass/fail at 0.6 is unresolved.
- **Review / Quizzes session flows** and the shared focus-shell concept from the mockup are not yet
  built in the app. The owner is happy with Review/Quizzes for now and will decide later whether to
  touch them; Flashcards (the hub) is done.

## Last updated
2026-07-13
