# iOS client UI — identity, hierarchy, per-tab model

Covers the 2026-07-21→22 iOS redesign: the visual identity, the local Program→Semester→Subject→Exam
hierarchy, and the per-tab "face" capability model. The backend contract is unchanged by all of this.

## Decisions

- **Visual identity = the web's iris-violet brand, not a separate iOS look.** `DesignSystem/Theme.swift`
  carries the *exact* tokens from `web/globals.css` + `tailwind.config.ts` (cool-slate neutrals, deep
  violet-ink dark `14 14 27`, `brand` iris `#6a2ff0`). Earlier iOS-only palettes (a warm amber "Ink &
  Marker" system, then a lavender/magenta first pass) were **scrapped**.
- **The signature is a violet gradient + a lit canvas.** `Theme.brandGradient` (3-stop iris sweep, fixed,
  white ink) fills the one hero card / primary CTA / sign-in mark; `CanvasBackground` renders the web's
  two fixed violet radial glows so surfaces float on light, not grey.
- **Reused the real app icon**, not an SF Symbol: `Assets.xcassets/AppLogo.imageset` (copied from
  `AppIcon`), rendered clean via `AppLogoMark` (scale-up + rounded clip crops the PNG's white margin).
- **A new top-of-hierarchy `Program` and a `Semester`, both LOCAL-ONLY.** Hierarchy is
  **Program → Semester → Subject → Exam**. `Program`/`Semester` are `@Model`s with **no sync metadata**;
  `Semester.program` and `Subject.semester` are on-device links. Subjects/exams/grades sync exactly as
  before; the grouping does not.
- **One shared drill-down, three "faces."** `Views/Hierarchy.swift` (`ProgramsRootView` /
  `ProgramDetailView` / `SemesterDetailView`, parameterised by `StudyFace = .subjects | .grades | .study`)
  renders the same Program→Semester→Subject list with a face-specific metric and leaf:
  - **Subjects** — knowledge *progress* (`ReadinessRing` mastery %, "N/M exams with material"); leaf =
    `SubjectDetailView` → `ExamMaterialsView`.
  - **Grades** — grade *quality* (green→red rail via `GradeQuality`, `GradeValue`, `AverageBar`); leaf =
    `SubjectGradesView`.
  - **Study** — due counts; leaf = `SubjectStudyView` → `ExamView`.
- **Capability separation by tab.** Create structure (program/semester/subject) from Subjects **and**
  Grades (`face.canCreate`; Study has no `+`). **Materials only in Subjects; marks only in Grades;
  studying (Review/Flashcards/Quiz) ONLY in Study.** The exam screen is split: `ExamMaterialsView`
  (progress + add-material) vs `ExamView` (the three study modes).
- **Cross-tab "Study" redirect.** `Services/AppRouter.swift` (`@Observable`, injected by `CramApp`,
  bound to `TabView` selection): `router.study(exam)` switches to the Study tab and deep-links to that
  exam's hub via `ProgramsRootView(.study)`'s `NavigationStack(path:)` + `navigationDestination(for: Exam.self)`.
- **Full CRUD + contextual placement.** Every level is editable/deletable (long-press context menus + a
  `⋯` menu in `SubjectDetailView`). The four `Add*View`s are **add-or-edit**. Parent pickers are **hidden
  on contextual create** (a `preselected*` parent is passed — e.g. adding an exam from a subject only
  asks title+date), **shown on top-level create**, and **always shown on edit** (to move it, via a
  cascading Program→Semester→Subject picker; moving an exam re-parents its cards/quizzes).
- **A default grading scale** lives in a Profile sheet (`@AppStorage`, `GradingScale.preferredDefault`);
  appearance stays **system-only** (no in-app toggle).
- **Today = home dashboard.** A greeting, a 2×2 stats grid (streak from `ReviewLog` dates · cards due ·
  mastery % · reviewed today), then the gradient hero + Upcoming. IA is **5 tabs**: Today · Subjects ·
  Study · Grades · Calendar (a custom month `CalendarView` marking exam days).

## Reasoning

- **Identity from web, not a sibling look:** the owner said amber "doesn't match the Cram theme" and to
  use the *correct* colours + the real app icon. Pulling the literal web tokens guarantees iOS and web
  read as one product and stay AA-checked in both themes; the icon's electric-blue nudges the gradient's
  cool end so mark and app agree.
- **Program/Semester local-only:** the backend has **no** semester/program concept (no model, no column),
  and this client can't deploy schema/endpoint changes. Making them on-device keeps the sync contract
  frozen while still giving the owner the Swiss-style Program→Semester→Subject→Exam structure they asked
  for. Nothing is stranded: deleting a Program/Semester **nullifies** its children into "No program" /
  "Unassigned" buckets rather than cascading.
- **Faces over three separate screens:** Subjects, Grades and Study all drill the same hierarchy but for
  different intents. One parameterised drill-down avoids triplicating navigation while letting each tab
  emphasise its own metric and leaf. The **hard capability split** (materials⇢Subjects, marks⇢Grades,
  studying⇢Study) is the owner's explicit model — so the exam screen had to split, and Subjects "Study"
  buttons *redirect* rather than study in place.
- **Contextual placement:** re-asking "which program/semester?" when you're already inside one is noise;
  edit mode still exposes the full path so anything can be moved later.

## Implications

- The sync layer (`meta/ios-sync-client.md`) and backend are untouched — `Program`/`Semester` never hit
  the wire, so a fresh device restores subjects/grades but **not** their program/semester grouping
  (single-user, single-device is fine for now).
- New model files auto-join the target (Xcode synchronized folders); both `Program.self` and
  `Semester.self` must stay registered in `CramApp`'s `modelContainer` and `PreviewData`.
- Verified by `xcodebuild` + on-sim screenshots of the tab **roots** and Today/Login; deeper drill-downs
  and context-menu/sheet flows are **build-verified only** (the sim can't script taps/long-press here).
- SourceKit shows persistent cross-file "cannot find X"/"No such module UIKit" **false positives** — trust
  the compiler. An Xcode "cannot find" that blocks ⌘R is stale DerivedData, not a code error.

## Open questions

- Should program/semester grouping ever sync? Would need a backend model + migration + endpoint (a real
  ADR), currently out of scope.
- Deep drill-downs, the Study redirect landing, and the move-cascade need real tap testing on device.

## Last updated
2026-07-22
