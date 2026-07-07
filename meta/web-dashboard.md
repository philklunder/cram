# Web Dashboard (v0.6) — architecture & the CORS it required

The **third client** after the iOS app and the backend's own API. A Next.js "study desk" in
[`web/`](../web) that authenticates with Supabase and talks to the **same live backend** the iOS
app uses. Built on the `web` branch so the in-flight iOS work on `main` is never disturbed; merges
to `main` once both halves are done.

## Decisions

- **Scope = "study desk", now a full study surface.** v0.6 web does: Supabase login, browse
  subjects (exam countdown), browse a subject's sources/cards/quizzes, upload material →
  `/v1/generate`, and a progress readout. **As of 2026-06-30 the web also does quiz-taking AND
  spaced-repetition flashcard review** (see the blocks below) — review is the first web feature
  that *mutates* SM-2 scheduling state, closing most of the original "review stays iOS-only" gap.
- **Quiz-taking on web (2026-06-30).** `web/src/components/QuizRunner.tsx` runs a quiz one question
  at a time. **Grading is split by question kind, mirroring the backend's own design:**
  **multiple-choice is graded in the browser** against `answer_key` and persisted via
  `POST /v1/attempts` (append-only, no paid call); **short-answer goes to `POST /v1/grade`** (the
  one paid Claude call), which both grades *and* persists the attempt when `question_id` is sent —
  so the client must **not** also POST `/v1/attempts` for that answer (double-write).
- **Web review = FULL SM-2 PARITY, not practice-only (shipped 2026-06-30).** `Scheduler.swift` was
  faithfully **ported to TypeScript** in [`web/src/lib/srs/scheduler.ts`](../web/src/lib/srs/scheduler.ts)
  — both the SM-2 update *and* the ADR-0004 exam-date compression (`card.mastery` + subject grade
  strength, the latter ported in `grade-strength.ts` incl. the weighted-average `currentGrade`
  fallback) — and the result is written back via `PATCH /v1/cards` + `POST /v1/review-logs`
  (`web/src/components/ReviewSession.tsx`). Rejected: a "practice-only" web review that never mutates
  scheduling (safe but doesn't advance the real schedule). **Guardrail:** the canonical SM-2 integer
  state is pure arithmetic, pinned to **34 parity vectors hand-derived from the Swift source**
  (`scheduler.test.ts`, `grade-strength.test.ts`); a future change to the Swift scheduler now fails a
  web test instead of silently diverging synced cards. `due_date` is inherently review-time-dependent
  (now + interval) so it isn't expected to match cross-device to the second — only the algorithm is.
- **Grades section on web (2026-06-30) — the differentiator, last major gap vs. iOS.**
  `web/src/components/GradesPanel.tsx` adds a **Grades tab** to the subject detail. List / add /
  **soft-delete** (tombstone, so the deletion converges to iOS rather than resurrecting) real marks via
  `POST`/`DELETE /v1/grade-entries`; a summary shows **current vs. target** with a Pass/Fail badge; an
  inline editor sets `target_grade` + an optional manual `current_grade` override via
  **`PATCH /v1/subjects`** (blank field ⇒ `null`, clearing it). Display + pass/fail logic is a TS port
  of `GradeFormat.swift`/`GradingScale` in [`web/src/lib/grades.ts`](../web/src/lib/grades.ts), but the
  current-grade/strength derivation is **reused from `grade-strength.ts`** (the scheduler already needed
  it) — **not** re-ported — so there is one source of truth for "what is this subject's grade." No
  in-place entry edit (delete + re-add), mirroring iOS `GradesView` (add + swipe-delete only).
- **`web/` gets a test runner for the first time: Vitest (2026-06-30).** Added with the scheduler
  port specifically to host the parity suite (`npm test` → `vitest run`; `vitest.config.ts` mirrors
  the `@` alias). DevDependency only — `npm audit --omit=dev` is clean; the esbuild/vite advisories
  in its tree are dev-server-only and never shipped.
- **Direct browser → backend calls with a Supabase Bearer JWT** — the web mirrors the iOS client's
  model (`Authorization: Bearer <access_token>`), *not* a Next.js BFF/proxy. See
  [`web/src/lib/api/client.ts`](../web/src/lib/api/client.ts).
- **This forced a backend CORS change.** Added an env-driven allowlist `CRAM_CORS_ORIGINS`
  (`backend/app/config.py`) + `CORSMiddleware` (`backend/app/main.py`). Default **empty ⇒ CORS off**;
  `allow_credentials=False`; methods GET/POST/PATCH/DELETE/OPTIONS; headers Authorization +
  Content-Type. Added **last** so it is the outermost middleware (handles preflight + stamps headers
  on errors).
- **Auth via `@supabase/ssr` cookies + a server-layout gate.** `src/middleware.ts` refreshes the
  session each request; the `(app)/` route-group server layout calls **`supabase.auth.getUser()`**
  (server-validates the token, not just a decoded session) and redirects to `/login`.
- **Client-side fetch + filter, paging the delta endpoints.** The CRUD list routes are not filtered
  server-side (delta-pull only), so the client `listAll`-pages a resource and filters by
  subject/quiz in the browser.
- **Zero runtime dependencies beyond Next/React/Supabase + Tailwind.** A local `cn()` instead of
  `clsx`; a **system font stack instead of `next/font/google`**; a shared design-system primitives
  file (`web/src/components/ui.tsx`).
- **Same Supabase project as iOS**; only the **anon** key ships to the browser (public by design).
  Backend base URL defaults to the live Railway deploy, overridable via
  `NEXT_PUBLIC_CRAM_BACKEND_URL`.
- **Brand identity (design pass, 2026-06-26).** Ships a real app icon — a calendar + flashcards
  squircle — at `web/public/cram-logo.png` and `web/src/app/icon.png` (the browser-tab favicon, via
  App Router file convention). `BrandMark` renders it with a plain `<img>` (deliberately **not**
  `next/image` — a tiny static logo needs no optimizer/runtime). The supplied art sat on a black
  canvas; the corners were cut with a **geometric squircle mask** (radius measured off the icon),
  **not** a luminance/color key, because the icon's gradient darkens to near-black in one corner and
  a brightness key would punch holes in the icon itself.
- **Accessibility floor.** Informational text on white is **`text-gray-500` minimum** (≈4.6:1, WCAG
  AA); `gray-400` is reserved for decorative/placeholder/icon use only. Async actions use a shared
  `Button` `loading` state (spinner + `aria-busy` + auto-disable) rather than swapping label text, so
  the layout never shifts mid-action.
- **Per-subject color identity (redesign, 2026-07-02).** Each subject deterministically maps (djb2
  hash of its stable `id`) to one of **10 curated color families** in
  [`web/src/lib/subjectColor.ts`](../web/src/lib/subjectColor.ts), so the *same subject wears the
  same accent everywhere* (list card, detail hero, tab underline, topic badges). Colors are shipped
  as **`--sc-*` CSS custom properties** via a `style` object and read through Tailwind
  arbitrary-value utilities (`bg-[var(--sc-soft)]`, `text-[color:var(--sc-ink)]`) — **not** Tailwind
  color classes, because the family is chosen at runtime and Tailwind can't JIT dynamic class names.
  Each family's `ink` (text) tone is contrast-checked ≥4.5:1 on both white and its own tint. This
  content accent is deliberately **separate from** the cobalt `brand` chrome (nav, primary buttons,
  focus) and from the semantic green/amber/red (grade quality, exam urgency).
- **Adopted `motion` (framer-motion) — the first animation library dep (2026-07-02).** Used for
  physical interaction motion the CSS keyframes couldn't cover cleanly: spring card-entrance stagger
  on the subjects grid, a `layoutId` sliding tab underline, and `AnimatePresence` panel crossfades on
  the subject detail. Existing CSS keyframes (`rise`/`fade-up`/`aurora`/`float`/`shimmer`) were kept
  for the simpler entrances. All motion is gated on `useReducedMotion()` + the global
  `prefers-reduced-motion` clamp in `globals.css`.
- **Design source-of-truth docs.** Added [`web/PRODUCT.md`](../web/PRODUCT.md) (register=product,
  users, principles) and [`web/DESIGN.md`](../web/DESIGN.md) (the cobalt + per-subject visual system),
  seeded from the impeccable skill's `init` flow so future design work stays on-brand.
- **Light + dark theming via a semantic token layer (2026-07-03).** Replaced raw `gray-*`/`white`
  utilities app-wide with **semantic tokens defined as RGB-triple CSS variables** per theme in
  `globals.css` (`--canvas / surface / surface-2 / ink / ink-2 / muted / subtle / line / line-strong`),
  exposed as Tailwind colors (`bg-surface`, `text-ink`, `border-line`) with `darkMode: "class"`. One
  class is then correct in both themes **and** alpha modifiers still work (`bg-surface/80`). A
  `ThemeToggle` persists `localStorage['cram-theme']`; an inline no-flash script in `layout.tsx` sets
  the `.dark` class on `<html>` before paint. Per-subject families gained `inkDark` / `soft-dark`
  variants so the runtime accent reads on dark too. Every token pair is AA-checked in both themes.
- **Linear-inspired restraint pass (2026-07-03).** Retuned the whole app toward a Linear aesthetic:
  neutral surfaces carry the UI, and the per-subject color is demoted from a full gradient **band** to
  one quiet identity **tile** — the single accent moment per card / hero. Crisp hairline borders over
  heavy shadows; motion is state-driven only (retired the login's infinite `aurora`/`float` loops for
  a static deep-cobalt field; review/quiz progress bars use a solid accent, not a gradient; dropped
  hover-lifts on non-interactive tiles; `Panel` is now a calm static `rounded-xl` container). Direction
  confirmed with the owner (north star = Linear, refine cobalt, keep per-subject) and recorded in a
  rewritten `DESIGN.md` (the old "light theme locked" line was stale once dark mode shipped).
- **Reveal animations must not gate visibility.** The subject card's entrance was a `motion`
  `initial={{opacity:0}}` spring — which renders the card **blank** until JS hydrates (a headless
  crawler, a background tab, JS disabled). Moved it to a declarative CSS `animate-fade-up` (staggered
  by index), so the resting state is always visible and the motion is pure enhancement. This is now
  the rule for the app: an entrance decorates an already-visible default, never gates it.
- **Bolder, higher-contrast evolve pass — brand hue swap cobalt → electric-violet "iris" (2026-07-04).**
  The owner asked to push *past* the Linear-restraint pass toward a bolder, higher-contrast language
  **on top of** the existing token architecture (not a rebuild). The single load-bearing change:
  `brand` was retuned from cobalt (`500 #3b6cf6`) to an electric violet/iris (`500 #7c4dff`,
  `600 #6a2ff0`) in `tailwind.config.ts` + the `globals.css` canvas glows — a one-line-per-file token
  swap that re-hues the whole app. Layered on: heavier type (`font-bold` headings, `text-3xl`), wider
  shells (`max-w-6xl`), bigger `rounded-xl` tiles, top-edge accent hairlines on cards (never a
  side-stripe), uppercase-tracked KPI strips. AA re-checked in both themes (white-on-600 ≈ 6.4:1).
- **Login rebuilt to a provided reference mock (2026-07-04).** The owner supplied a PNG comp and asked
  for an exact match. `LoginForm.tsx` was rebuilt to it: centered "Welcome back" card, leading-icon
  inputs (mail/lock) + password show/hide, Remember-me + Forgot-password row, arrow CTA, "or" divider,
  Continue-with-Google, Sign-up toggle, a top-bar Dark-mode toggle + Need-help link, and a "Trusted by
  students" footer; the brand panel gained a security callout and a **floating product illustration
  built entirely in CSS/SVG** (two 3D-perspective-tilted glass cards — a "Swiss scale" flashcard stack
  + a "Your progress" chart card with an amber A- badge, glowing violet line, and day-gridlines — plus
  a mortarboard and a field of static glowing sparkles). Illustration is `aria-hidden`, gated
  `min-[1400px]:block` so it only shows when the panel has room.
- **Auth affordances: some wired, some visual (2026-07-04).** Continue-with-Google → Supabase
  `signInWithOAuth({provider:"google"})`; Forgot-password → `resetPasswordForEmail`; password
  show/hide + mode toggle are local state. **Remember-me is UI-only** (Supabase persists sessions by
  default; no persistence switch wired). Added a `label` variant to the shared `ThemeToggle` for the
  login top bar rather than duplicating its localStorage/no-flash logic.
- **Sidebar-shell architecture replaces the top-nav (2026-07-06).** The whole app moved from a
  centered `max-w-5xl` top-nav to a persistent **left sidebar + sticky top bar** (`AppNav.tsx`
  DELETED). New `components/shell/` (`AppShell` composes `AppSidebar` [wordmark → primary nav →
  streak card + Go-Premium] + `AppTopbar` [global `⌘K` search, theme toggle, notifications, account
  chip]; mobile drawer), plus `components/dashboard/` and `components/pages/` component trees and
  routed `(app)/{dashboard,calendar,flashcards,grades,progress,quizzes,review,settings,upload,premium}/`
  destinations. Most surfaces are a two-column grid (primary column + right rail of supporting cards)
  that collapses to one column under `lg`.
- **All surfaces matched to owner reference mocks (2026-07-06).** The owner supplied 8 labelled PNGs
  (Dashboard, Review runner, Flashcards, Quiz session, AI Decks, Progress, Grades, Study-planner/
  Calendar); each surface was built/tuned to its reference in the electric-violet system and verified
  in **light + dark** via the dev-only `web/src/app/preview/` harness (headless-Edge screenshots;
  the `?p=<slug>` preview page reads the slug **server-side from `searchParams`** as of 2026-07-07 —
  split into a `page.tsx` server wrapper + `PagesPreviewClient` — so a plain headless shot captures the
  right surface on first paint; the old client `useEffect` slug-switch never fired before capture, so
  every `?p=` shot silently rendered the default Review page). The bolder-violet pass is complete
  across the app, not just login.
- **`study_sessions` — a new append-only owned resource for the weekly-activity chart (2026-07-06).**
  Backend gained `study_sessions` (model + `alembic/0004_study_sessions` + full wiring: enums/models/
  repository `OWNED_MODELS`+`PARENTS`/routers `SPECS`/api_schemas), an immutable per-block record of
  study time (`started_at` domain event time, bounded `duration_seconds` 0–86 400, `kind` enum,
  optional owned `subject_id`) feeding the dashboard's weekly-activity aggregate. It reuses the exact
  owned-model + RLS-owner-policy pattern of the other domain tables. **Migration 0004 was applied to
  live Supabase 2026-07-06** (was at `0003`, now `0004_study_sessions (head)`). `client.ts` added the
  read helpers `listSources`/`listGradeEntries`/`listAttempts`/study-session + `createSubject`.
- **`web/DESIGN.md` rewritten to the shipped violet sidebar system (2026-07-06).** Replaced the stale
  cobalt/Linear/top-nav copy with the electric-violet tokens, the sidebar-shell + two-column-rail
  layout pattern, motion rules, and a per-surface catalog. A `/security-review` + `/code-review` of
  the whole pending diff found **no Critical/High/Medium** (study_sessions reuses the audited
  owned-model/RLS pattern; the only `dangerouslySetInnerHTML` is the static no-flash theme script).
- **Global "display grading scale" preference (2026-07-06).** A **device-local** setting
  (Settings → Grading scale; [`web/src/lib/useDisplayScale.ts`](../web/src/lib/useDisplayScale.ts),
  `localStorage['cram-grade-scale']`, default `percentage`) that controls how **aggregate,
  cross-subject grade numbers** are shown: the Grades page's Overall/Average-by-subject stats and its
  Current/Target table columns, the Progress "Current average" + its 7-day delta, the grade-trend
  chart's Y-axis, and the per-subject "Average". Picking `swiss` shows those as **6.0–1.0 grades**
  instead of `%`. **Presentation only** — each subject keeps its own `grading_scale` for *entry*, raw
  grade *entries* still render in their native scale (a German mark stays `2.0`), and non-grade
  metrics stay in `%` (exam weight, pass rate, card-mastery/readiness, topic-mastery donut). Built on
  the existing normalize-to-0–100-performance layer: `grades.ts` gained the **inverse**
  (`gradeFromPercent` / `formatPercentInScale` / `formatPercentDeltaInScale`) so any averaged % maps
  back to a grade on the chosen scale — no new grade math. Read via **`useSyncExternalStore`** so a
  change on Settings updates a mounted Grades/Progress view live and across tabs; the server + first-
  paint snapshot returns the default, so there's no hydration mismatch. The `/preview` harness gained
  a dev-only `?scale=` override to screenshot the conversion.
- **HTTP security headers via `next.config.mjs` `headers()` (2026-07-06 security pass).** Every route
  ships a `Content-Security-Policy` + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` +
  `Referrer-Policy: strict-origin-when-cross-origin` + `Permissions-Policy` (camera/mic/geo off) +
  `Strict-Transport-Security` (2yr, preload). `frame-ancestors 'none'` is the load-bearing clickjacking
  defense. The CSP's `connect-src` is **derived at build time from the same `NEXT_PUBLIC_SUPABASE_URL`
  / `NEXT_PUBLIC_CRAM_BACKEND_URL`** the client uses (plus a `wss://` variant for Supabase realtime), so
  it tracks the real deployment instead of a hard-coded list. `script-src`/`style-src` keep
  **`'unsafe-inline'`** — the App Router bootstraps hydration with inline scripts (+ the no-flash theme
  script in `layout.tsx`) and the UI uses inline `style={{…}}` extensively; a nonce-strict CSP is a
  larger change deferred as an open question.
- **Login form hardened against account enumeration + weak passwords (2026-07-06).** `LoginForm.tsx`:
  sign-up now shows the **same neutral "check your email" notice** whether or not the address is already
  registered (the `signUp` "already registered" error is caught and mapped to the confirmation, not
  surfaced); **password reset always** shows "if that email has an account…" regardless of outcome (any
  real error is `console.warn`'d, never shown) — so neither flow reveals whether an email is registered.
  Password `minLength` is raised to **8 on sign-up only** (sign-in stays unconstrained so a legacy
  short password can still log in); the authoritative strength + leaked-password check is a **Supabase
  Auth project setting** (dashboard-side, enabled by the owner 2026-07-06), not client-enforceable.
- **The HTTPS-forcing directives are gated on `NODE_ENV` so local dev works over plain http (2026-07-07).**
  `next.config.mjs` now drops three things under `next dev` and keeps them under `next build`/`next start`:
  the **HSTS** header, the CSP **`upgrade-insecure-requests`**, and (inversely) it *adds* a dev-only
  **`'unsafe-eval'`** to `script-src`. In production (Vercel, HTTPS) the emitted header set is
  byte-identical to the pre-2026-07-07 config — no hardening lost. `NODE_ENV` is `"development"` under
  `next dev` and `"production"` under `next build`/`next start`, so a single `const isProd` toggles all
  three.
- **Polish pass across the app (2026-07-07).** A broad impeccable/product-register refinement,
  **presentational only — no data-flow or API changes**: the dashboard hero greets by name
  (`greetingName()` in `lib/format.ts` prefers OAuth `full_name`/`name`, else a capitalized email
  local-part, else nothing; `(app)/dashboard/page.tsx` now reads the session server-side and is
  `force-dynamic` like `/settings`); **Settings** rebuilt to two-column rows + an account avatar chip +
  a Light/Dark **segmented control** (`ThemeChoice`, sharing extracted `readTheme`/`applyTheme` with
  `ThemeToggle` so there's one theme source of truth); **AI Decks** preview pipeline redrawn as a
  horizontal connected stepper; **Quizzes hub** rows widened to full-width with a "Practice" CTA to
  match the Review hub. Verified typecheck + 34 tests + prod build + light/dark screenshots.
- **Information-architecture cleanup — thin "funnel" pages made self-contained (2026-07-08).** The
  owner's audit found several sidebar pages were **redundant funnels**: Quizzes' "Practice" and
  Flashcards' "Study" only linked back to `/subjects/[id]`, and Calendar showed **fabricated**
  review/quiz suggestions (no scheduling backend). Chosen direction (owner): **don't delete pages —
  make the thin ones do their job in place** via a consistent **Subject → Exam scope picker**. New
  [`web/src/lib/scope.ts`](../web/src/lib/scope.ts) (`WHOLE_SUBJECT`/`GENERAL_SCOPE` sentinels +
  `examsForSubject`/`inExamScope`/`scopeLabel`) + a shared `ScopePicker` in
  [`components/pages/shared.tsx`](../web/src/components/pages/shared.tsx) are the single source of
  scoping; `loadLibrary` now also pages **`/v1/exams`** so the hubs can scope. Changes: **(1) AI Decks
  is the single "add material" surface** — Subject is a dropdown (+ "New subject") that reveals an Exam
  dropdown, reads a `?subject=<name>&exam=<id>` **deep-link** to pre-select, and passes `exam_id` to
  `/v1/generate`. **(2) Subject page** — all three "Add material" buttons now `router.push` to AI Decks
  pre-filled; the inline upload modal + `GenerateMaterialForm.tsx` were **deleted**. **(3) Quizzes** —
  scope picker → launches the existing `QuizRunner` in place (merges all in-scope questions), no more
  funnel-to-subject. **(4) Flashcards** — added exam scope + a new **free cram flip-through**
  ([`FlashcardCram.tsx`](../web/src/components/FlashcardCram.tsx)): a self-check that **does NOT mutate
  SM-2** (deliberately distinct from Review/subject-study). **(5) Grades** — the **Grades page is now
  the single editor**: each subject row expands into the full `GradesPanel` (targets/add/delete moved
  off the subject page); the subject page shows a read-only `SubjectGradesSummary` + a "Manage in
  Grades" link. **(6) Calendar** — removed the fabricated suggestions; shows **real exam dates** + user-
  added study blocks persisted **localStorage-only** (`cram:planner:blocks`, flagged "not synced to
  iOS"); "Plan with Claude" is a labelled coming-soon stub. **Presentational/IA only — the sole data-
  layer change is `loadLibrary` adding `exams`; `loadDashboard`/`loadSubjectBundle`/auth are untouched.**
  Verified typecheck + prod build + light/dark preview screenshots of all five rebuilt surfaces.

## Reasoning

- **Mirror iOS, don't build a BFF.** The backend already speaks Bearer-JWT to a native client; a
  second client over the same contract keeps one auth model and one API surface. A Next.js proxy
  would hide the token from browser JS but adds a server hop, duplicates the API in route handlers,
  and diverges from the iOS shape — not worth it when the token is already browser-resident via
  Supabase and every `/v1/*` is owner-scoped server-side regardless.
- **CORS allowlist defaults closed.** iOS/native need no CORS, so an empty default keeps any deploy
  locked to same-origin/native until a web origin is *explicitly* allow-listed — consistent with the
  project's fail-closed posture ([auth-security-posture.md](auth-security-posture.md)). It is **not**
  wired into `check_production_config` (the app boots fine without it; it just disables the web).
  **Credentials are off** because auth is a Bearer header, not a cookie — so even a worst-case `*`
  misconfig can't drive a CSRF/ambient-credential attack (no cookie is ever attached cross-origin).
  CORS is **not** an authz layer; it gates browsers, the JWT gates data.
- **`getUser()` over `getSession()`** at the gate: `getSession()` trusts the cookie as-is;
  `getUser()` validates the token with Supabase Auth, so a tampered/expired cookie can't slip past
  the server gate. Same hardening choice as the iOS client
  ([ios-auth-client.md](ios-auth-client.md)).
- **Client-side filtering is fine at single-user scale.** The list endpoints return only the
  caller's rows; paging + in-browser filtering avoids adding server-side query params now. Revisit if
  a user ever accrues thousands of rows.
- **No `next/font` / zero deps** because the build runs where a build-time Google Fonts fetch can't
  be relied on, and a portfolio app doesn't need the extra supply-chain surface. A system stack is
  instant and dependency-free; a real typeface is a later, online refinement.
- **Why full SM-2 parity (not practice-only).** "Review" that doesn't advance the schedule isn't
  spaced repetition — it's flipping cards. To make web review *real*, the web must write the same
  SM-2/`due_date` state the iOS app does. The cost is a genuine hazard: **two schedulers in two
  languages must stay in lockstep**, or the *same* card synced between web and iOS gets different
  due dates (last-writer-wins would then flip-flop the schedule). The parity test suite is the
  mitigation — it makes drift a failing test, not a silent production bug. This is exactly the
  divergence the original v0.6 README avoided by keeping review iOS-only; we're now taking it on
  deliberately, with a guardrail.
- **Grades reuse the scheduler's grade math — no second port.** `grade-strength.ts` already ported
  `currentGrade` (manual `??` weighted-average of entries) + `strength` for the ADR-0004 exam
  compression; the Grades UI imports the *same* functions, so the number shown in the Grades tab is
  exactly the number the scheduler compresses on. Only the *display* helpers (formatting, pass-mark,
  scale/kind labels) are new in `grades.ts`. This deliberately avoids the two-ports-must-agree hazard
  the scheduler has — there's only ever one grade derivation.
- **MC grading is client-attested, and that's fine here.** The browser computes `is_correct`/`score`
  for multiple choice and the backend stores what it's told (the iOS client does the same). A user
  could forge their own attempt via devtools — but it only falsifies *their own* progress stats, no
  cross-user impact, at single-user scale. Likewise `answer_key` is returned by the backend and used
  in the browser (needed for local grading + the post-answer reveal). Both are acceptable **only**
  while the app is single-user with private, per-owner quizzes; a shared/multi-tenant quiz model
  would require moving MC grading server-side and withholding `answer_key` until submission. The
  2026-06-30 security pass confirmed no Critical/High and flagged these two as by-design.
- **Why CSS variables, not Tailwind color classes, for per-subject color.** Tailwind v3 JIT only
  emits classes it can see as literal strings at build time; a runtime-chosen `bg-emerald-50` /
  `bg-violet-50` per subject would be purged. Emitting the family as `--sc-*` custom properties and
  reading them through *static* arbitrary-value utilities keeps every class literal (so it survives
  purge) while the actual color is swapped at runtime via one inline `style`. Rejected alternatives:
  safelisting all 10 families × every shade (bloats the CSS and still hard-codes the set in two
  places), or inline styling every colored element (loses Tailwind's state variants like `hover:`).
- **Why a motion library at all, given the zero-extra-deps stance.** The `layoutId` sliding tab
  underline and springy shared-element/enter-exit choreography are genuinely painful to do correctly
  in hand-rolled CSS/JS (measuring positions, interrupting transitions, cleanup). `motion` is
  tree-shakeable and scoped to the two client leaves that need it; it's the one deliberate exception
  to the "system font / local `cn` / no runtime deps" rule, justified by the interaction quality.
- **Why a token layer, not `dark:` variants everywhere.** Dark mode written as per-utility
  `dark:bg-gray-…` overrides would double every color class and drift out of sync the moment one is
  missed. One semantic RGB-triple variable per role, swapped by a single `.dark` class on `<html>`,
  makes each component theme-agnostic and preserves Tailwind's alpha-modifier syntax — the load-bearing
  simplification that made full light/dark parity tractable across ~15 components at once.
- **Why demote per-subject color rather than remove it.** The color still earns its place as
  *navigation* (a learner finds a subject by hue), but a full gradient band on every card read as
  gamified/SaaS-loud and fought the "tool disappears into the task" principle. Concentrating it in one
  tile keeps the identity signal while the surface stays neutral — chosen over both a monochrome strip
  (loses the identity) and the old full band (too loud for the Linear target).
- **Why a token swap carried the whole rebrand.** Because every component already reaches for the
  `brand` scale (never a raw color), retuning the 50–900 ramp in one config file re-hued the entire
  app cobalt → violet with no per-component churn — the payoff of the semantic-token layer. The
  "bolder" direction sits *on top of* that architecture, not against it; the Linear restraint pass is
  now partially superseded but the token/theming plumbing is unchanged.
- **Why the login illustration is CSS/SVG, not a raster crop or a real 3D asset.** The reference cards
  are translucent glass over the panel gradient, so cropping them from the comp would bake in the
  background (double-composite) and can't theme or stay crisp at any DPI. A literal 3D render would add
  an image asset + export pipeline. Recreating with CSS `perspective`/`rotateY` + inline SVG keeps it
  vector-crisp, themeable, dependency-free, and editable in code — consistent with the zero-extra-deps
  stance. The trade-off accepted: it *evokes* the comp's 3D render rather than pixel-matching it.
- **Why wire Google/Forgot for real but leave Remember-me visual.** OAuth and password-reset are
  one-call Supabase primitives with obvious correct behavior, so wiring them is cheaper than faking
  them. Remember-me's honest implementation (opting *out* of session persistence) needs a custom
  storage adapter on the Supabase client — real work for a control most users leave checked — so it
  ships as UI-only for now and is flagged, rather than shipped mislabeled.
- **Why the grading scale is a display-only preference, not per-subject or a data change.** Subjects
  already carry their own `grading_scale` (how marks are *entered*); the owner's ask was purely "show
  my **averages** in Swiss." Converting the normalized 0–100 performance back to a grade at the
  display layer means zero migration, no backend change, and the single grade-derivation source
  (`grade-strength.ts`) stays untouched — the number shown is still the number the scheduler
  compresses on. Rejected: (a) storing the display scale server-side — a device preference doesn't
  warrant a settings resource/schema; (b) reformatting the raw grade *entries* — they're already
  grades in their own scale, so converting them would double-convert and hide the real mark. Non-grade
  figures (readiness, mastery %, exam weight, pass rate) are deliberately **excluded** because they
  aren't grades — pinning them to a 1–6 axis would be misleading, and the owner explicitly wanted
  weight/pass-rate to stay `%`.
- **Why scope-in-place beats the funnel, and why the cram mode is schedule-neutral (2026-07-08).**
  The hubs previously *were* just alternate indexes into `/subjects/[id]`, so Quizzes/Flashcards
  earned their sidebar slot back only by doing the actual task (pick subject+exam → quiz/cram right
  there), with the subject page kept as the deep per-exam view. Chosen over **deleting** them (owner
  wanted the entry points) and over **leaving them as funnels** (the redundancy the audit flagged).
  The Flashcards "cram" is deliberately a **practice flip-through that never writes SM-2**: the app
  already has two scheduled-review surfaces (the Review hub + the subject-page "Study"), and a third
  that mutated `due_date` would both duplicate them and let the *same* card advance from multiple
  entry points — exactly the multi-writer hazard the scheduler-parity work guards against. Cram fits
  the product's name (last-minute practice over any cards, due or not) while SM-2 mutation stays owned
  by Review.
- **Why Grades consolidated to one editor.** Grades were editable in two places (the subject page's
  `GradesPanel` *and* the global page), so target-setting/entry-deletion had two homes. Making the
  **Grades page the sole editor** (expandable rows) and the subject view **read-only** removes the
  duplicate editor while keeping an at-a-glance read in subject context — and `grade-strength.ts`
  stays the one grade derivation (unchanged).
- **Why the calendar's study blocks are localStorage-only, not faked or backend-backed.** There is no
  planned-sessions backend yet. Fabricated suggestions (the old behaviour) are misleading; a new owned
  resource is out of scope for a presentational pass. So real exams are shown truthfully and the
  learner's own study blocks persist **locally, clearly flagged as not-synced** — an honest interim
  that survives refresh without pretending to be real synced data. "Plan with Claude" ships as a
  labelled stub rather than a fake feature.
- **Why gate the HTTPS headers on `NODE_ENV`, not drop them or exempt localhost.** HSTS and
  `upgrade-insecure-requests` are correct and wanted in production, so removing them outright would
  weaken the live site. A per-host exemption in `headers()` doesn't help: `source` matches the path, not
  the scheme, so an HSTS header would still be sent on the `http://localhost` response — and that
  single response is what pins the browser to https for the whole `max-age`. Gating on build mode is
  the one clean seam (dev never emits, prod always does). The reciprocal `'unsafe-eval'` is added
  *only* in dev, so the shipped policy is never widened. A local HTTPS cert for `next dev` was rejected
  as more setup than the problem warrants.

## Implications

- **Going live needs `CRAM_CORS_ORIGINS` set in Railway** (raw, no quotes — Railway doesn't strip
  them, see [deployment.md](deployment.md)) to include `http://localhost:3000` and the Vercel URL,
  **and a backend redeploy**. Until then every browser `/v1/*` call fails as a CORS error. This is
  the one cross-cutting coupling between the web client and the deployed backend.
- **Open sign-up is exposed** (`signUp` in the login form). Blast radius is bounded by the existing
  per-user/global daily token caps + rate limit ([cost-controls.md](cost-controls.md)) and the
  Anthropic Console hard cap ([edge-and-budget-backstops.md](edge-and-budget-backstops.md)) — worst
  case is feature-DoS within budget, not a cost blowout. Decide at deploy: disable public sign-up in
  Supabase, or rely on the caps.
- **Web now writes study events AND mutates scheduling.** Quiz-taking appends attempts
  (`/v1/attempts` for MC, `/v1/grade` for short answer); review now **mutates** card SM-2 state
  (`PATCH /v1/cards`) and appends review-logs. The web is therefore bound by the same sync semantics
  as the iOS client ([ios-sync-client.md](ios-sync-client.md)) — last-writer-wins — and by the
  scheduler parity guarantee above: the two ports MUST agree, or a card reviewed on both devices
  would flip-flop its schedule. The parity test suite is the enforcement mechanism.
- **Review needs grade entries client-side.** To derive subject strength exactly as iOS does (its
  `currentGrade` falls back to the weighted average of grade entries when no manual grade is set),
  `loadSubjectBundle` now also pages `/v1/grade-entries`. They're the user's own owner-scoped rows.
- **`grade-strength.ts` is now shared by two features** (the SM-2 scheduler *and* the Grades UI). A
  change to how a subject's current grade is derived affects **both** exam compression and the Grades
  display — keep it the single source. Setting a manual `current_grade` via the Grades editor
  **overrides** the entry average everywhere (display *and* SM-2 strength), matching iOS
  `Subject.currentGrade`.
- **Short-answer grading spends real budget.** Each short-answer check is a Claude call against the
  per-user/global daily token cap ([cost-controls.md](cost-controls.md)); the UI surfaces the
  backend's 429 message and disables the control while in-flight, but the authoritative throttle is
  server-side.
- Deploy target is **Vercel** with root directory `web/`; the backend stays on Railway.
- **`subjectColor.ts` is the single place to tune the palette.** Adding, removing, or recoloring a
  family (or changing the hash) reshuffles which subjects get which hue — one file, no per-component
  churn. `motion` is now in the shipped bundle for the `/subjects/[id]` route (~110 kB first-load);
  keep it confined to client leaves so server components stay static.
- **Theming is now token-mediated end-to-end.** New UI must reach for the semantic tokens
  (`bg-surface`/`text-ink`/`border-line`…), never raw `gray-*`/`white`, or it will be wrong in one
  theme. Semantic green/amber/red and the per-subject accent each carry their own `dark:` variant.
- **`web/DESIGN.md` rewritten 2026-07-06** to match the shipped electric-violet sidebar system (the
  2026-07-04 evolve pass reached every surface). New UI should follow it: semantic tokens, the
  sidebar-shell + two-column-rail layout, one violet accent, quiet per-subject identity, AA in both
  themes.
- **`study_sessions` requires a running-app write path.** The table + migration exist and the live DB
  is migrated, but a client must actually `POST /v1/study-sessions` at the end of a review/quiz for
  the dashboard's weekly-activity chart to populate with real data (currently it renders from
  whatever sessions exist). Wire the write on session completion (web now; iOS mirrors later).
- **Continue-with-Google needs the Google provider enabled in the Supabase project** (+ the deployed
  origin in its redirect allowlist). Until then the button renders but the click returns an inline
  error. Forgot-password works once Supabase email is configured.
- **New aggregate-grade UI must format through `formatPercentInScale(displayScale, pct)`** (read the
  scale with `useDisplayScale()`), never a bare `` `${pct}%` ``, or it will ignore the Settings
  preference. The preference is **device-local** (localStorage, like the theme) — it does **not** sync
  to iOS, and iOS has no equivalent. Only `percentage` (the default) reproduces the pre-2026-07-06
  presentation, so existing screenshots/expectations still hold out of the box.
- **The login "Need help?" link is a `mailto:` to the owner's personal address** (`klunderphilipp@
  gmail.com`) — a placeholder from matching the reference. Once pushed it auto-deploys to Vercel and
  that address is public on the login page; swap it for a real support address (or remove it) before
  it matters.
- **Dev gotcha: never run `next build` while `next dev` shares the `.next` dir.** The production build
  overwrites the dev server's static chunks, so the running dev server then 404s its CSS and serves
  **unstyled** pages (looks like "CSS broke"). Stop dev first (or build elsewhere); recover with
  `rm -rf .next` + restart `npm run dev`, then hard-refresh the browser past the cached 404.
- **Adding material is now centralized in AI Decks (2026-07-08).** Any new "add material" entry point
  must **deep-link to `/upload?subject=<name>&exam=<id>`**, not re-embed an upload form — the inline
  `GenerateMaterialForm` is deleted. **Scoping semantics live only in `lib/scope.ts`**; Quizzes,
  Flashcards, and AI Decks all read it, so change scoping there once. **Grades editing lives only on
  the Grades page** — the subject page is read-only for grades. **The Flashcards cram mode must never
  write `/v1/cards` or `/v1/review-logs`** (schedule mutation is Review's job alone).
- **Calendar study blocks are device-local and unsynced (2026-07-08).** They live in
  `localStorage['cram:planner:blocks']` — lost if storage is cleared, invisible to iOS, and gone on
  another browser. A real **planned-study-sessions owned resource** (like `study_sessions`, but future-
  dated/mutable) is the follow-up that would also unlock the "Plan with Claude" generation and iOS
  parity.

## Open questions

- **No ADR yet for the web client / CORS.** If the Bearer-direct-vs-BFF choice or the CORS contract
  should be frozen formally, add an ADR (next free number) and cross-ref it here.
- Server-side filtering (`?subject_id=`) on the list endpoints if client-side paging ever gets heavy.
- Whether to disable Supabase public sign-up vs. keep it gated only by the spend caps.
- Design/QA pass **done 2026-06-26** (AA contrast, async-button loading state, app icon + favicon,
  email truncation). Still open: a real typeface (vs the system stack) and arrow-key tab nav; both
  want a live signed-in run to verify the authenticated pages.
- **Slice 2 (card review) shipped 2026-06-30** (scheduler port + 34-vector Vitest parity suite +
  review UI + design/security passes; security found no Critical/High). Follow-ups: the parity
  vectors are currently *hand-derived* from `Scheduler.swift` — a tiny Swift harness that emits the
  expected vectors would make the cross-language pin automatic when the scheduler changes. The
  backend does not range-validate the SM-2 columns (a hand-crafted PATCH could store a negative
  interval on one's *own* card) — harmless at single-user scale, worth a guard if it ever matters.
- **Slice 3 (Grades) built 2026-06-30** (Grades tab + `grades.ts` display port; reuses `grade-strength.ts`;
  typecheck + 34 tests + prod build green). Follow-ups: no in-place entry edit yet (delete + re-add);
  the backend does not range-validate `score`/`weight` on `/v1/grade-entries` (the UI clamps to the
  scale range + parses a comma decimal, but a hand-crafted POST could store an out-of-range grade on
  one's *own* subject) — harmless at single-user scale, same posture as the SM-2 columns above.
- **Visual redesign (per-subject color + motion) built 2026-07-02** on top of the earlier uncommitted
  design-polish pass (cobalt rebrand, aurora login, `fade-up`/`aurora`/`float`/`shimmer` keyframes,
  count-up progress). Typecheck + 34 tests + prod build green.
- **Dark mode + Linear restraint pass built 2026-07-03** (full light/dark token layer + the aesthetic
  retune above). Typecheck + 34 tests + prod build green; login + subjects grid + detail hero + panels
  verified in both themes via a mock-data preview harness. **Still open: no live signed-in visual QA on
  the real authenticated pages** — the data is auth-gated, so grid/hero/tabs/panels were verified with
  a *dev-only* `web/src/app/preview/page.tsx` (mock data, self-gated to `notFound()` in prod) that
  should be deleted once a real signed-in pass confirms the pages. The 21st.dev Magic MCP is configured
  but only loads at Claude Code startup, so it was unavailable this session (restart to use it).
- **Bolder violet evolve pass + login redesign built 2026-07-04** (brand hue swap + login rebuilt to a
  reference mock with a CSS/SVG illustration; typecheck + prod build green, verified in light/dark via
  the headless-Edge screenshot loop on `localhost:3000`). Follow-ups: rewrite `DESIGN.md`; carry the
  bolder pass to the remaining surfaces; swap the "Need help?" placeholder email; decide whether
  Remember-me should be truly wired; enable Google OAuth in Supabase if that button is to work.
- **Display grading-scale preference built 2026-07-06** (Settings picker + `useDisplayScale` store +
  the `gradeFromPercent`/`formatPercentInScale`/`formatPercentDeltaInScale` inverse in `grades.ts`;
  typecheck + 34 tests green; Grades/Progress/Settings verified in the `?scale=swiss` preview harness).
  It's **web-only + device-local**: if grade display should be consistent with iOS, it needs a
  *synced* user setting (a new owned resource, or Supabase user metadata) instead of localStorage.
- **Security hardening pass built 2026-07-06** (full audit of backend + web). Fixed: web HTTP security
  headers + CSP, login anti-enumeration + sign-up password floor (see Decisions), and a backend
  `rate_limit_buckets` lazy prune ([cost-controls.md](cost-controls.md)). Dashboard-side config
  (Supabase leaked-password protection, `CRAM_CORS_ORIGINS`, service-role-key placement) verified by
  the owner. Follow-up: the CSP keeps `'unsafe-inline'` for script/style — tightening to a
  nonce-strict policy needs middleware nonce injection + threading the nonce through the App Router's
  inline scripts, deferred as a larger change. **Verify live after deploy:** load the site and watch
  the console for CSP `connect-src` violations (Supabase/backend origins come from the build-time
  `NEXT_PUBLIC_*` env, so they must be set in the Vercel build, not just locally).
- **Polish pass + local-dev http gating done 2026-07-07** (see Decisions). All 8 reference surfaces
  re-verified light+dark as still matching; the changes are presentational + the `NODE_ENV`-gated
  security headers. A secret/PII scan of the committed diff was clean (`.env.local` untracked; only
  empty-placeholder `.env.example` tracked; no service-role key anywhere in `web/`). Production CSP/HSTS
  unchanged. Open: the login "Need help?" `mailto:` to the owner's personal address is still a
  placeholder on the public login page — swap or remove before it matters.
- **IA cleanup pass built 2026-07-08** (see Decisions): thin funnel pages made self-contained via a
  shared Subject→Exam scope picker; add-material centralized in AI Decks; Grades consolidated to one
  editor; Calendar de-faked with localStorage study blocks. Typecheck + prod build green; five rebuilt
  surfaces verified light/dark in the `preview/` harness. **Not yet verified against a live signed-in
  session** (the data is auth-gated). Follow-ups: a synced planned-study-sessions resource (to replace
  the localStorage blocks + power "Plan with Claude"), and **iOS parity for the new IA** (subject→exam
  scoping, cram mode). *Dev note: for local web work, point `NEXT_PUBLIC_CRAM_BACKEND_URL` at the live
  Railway backend — a local backend built from HEAD 500'd against the prod DB this session.*

## Last updated

2026-07-08
