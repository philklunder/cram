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
- **MC grading is client-attested, and that's fine here.** The browser computes `is_correct`/`score`
  for multiple choice and the backend stores what it's told (the iOS client does the same). A user
  could forge their own attempt via devtools — but it only falsifies *their own* progress stats, no
  cross-user impact, at single-user scale. Likewise `answer_key` is returned by the backend and used
  in the browser (needed for local grading + the post-answer reveal). Both are acceptable **only**
  while the app is single-user with private, per-owner quizzes; a shared/multi-tenant quiz model
  would require moving MC grading server-side and withholding `answer_key` until submission. The
  2026-06-30 security pass confirmed no Critical/High and flagged these two as by-design.

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
- **Short-answer grading spends real budget.** Each short-answer check is a Claude call against the
  per-user/global daily token cap ([cost-controls.md](cost-controls.md)); the UI surfaces the
  backend's 429 message and disables the control while in-flight, but the authoritative throttle is
  server-side.
- Deploy target is **Vercel** with root directory `web/`; the backend stays on Railway.

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

## Last updated

2026-06-30
