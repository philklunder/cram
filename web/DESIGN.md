# Design

Visual system for the Cram web study desk. Stack: Next.js 15 (App Router, RSC) · React 19 ·
Tailwind CSS v3 · Supabase · `motion` (framer-motion) for interaction motion.

**North star: a confident, focused study workspace.** Restrained and precise like Linear —
tight cool-slate neutrals, crisp hairline borders doing most of the elevation, motion that
confirms state rather than performs — but carried by **one saturated electric-violet accent
("iris")** and a lit, faintly-glowing canvas so the product feels modern and alive rather than
grey. Per-subject color stays — it's how a learner navigates — as a *quiet* identity signal
(monogram tile, dot, thin rail, subtle tint), never a full-bleed gradient hero.

## Theme

Light and dark are both first-class (`darkMode: "class"`; `.dark` on `<html>`, no-flash inline
script + `ThemeToggle`, persisted in `localStorage['cram-theme']`, honouring system preference
until the user chooses). Light is the default and the design lead. Neutrals are cooled toward
slate so they harmonise with the violet accent; the dark canvas is a deep violet-ink (not neutral
black). Two faint violet radial glows are fixed behind content (stronger in dark) so even the
near-black canvas reads as *lit*. Every token pair is AA-checked in **both** themes.

## Color

### Semantic surface/text/line tokens (the load-bearing layer)
RGB-triple CSS vars in `globals.css`, exposed as Tailwind colors in `tailwind.config.ts`:
`canvas` (page bg) · `surface` (cards) · `surface-2` (insets) · `ink`/`ink-2` (primary/secondary
text) · `muted`/`subtle` (captions/decorative) · `line`/`line-strong` (hairlines/hover borders).
Components reach for these, never raw `gray-*`/`white`, so one class is correct in both themes and
alpha modifiers still work (`bg-surface/80`). Light: `canvas` slate-50, `surface` white, `ink`
slate-900. Dark: `canvas` `14 14 27`, `surface` `23 23 41` (lighter than canvas so elevation
reads), `ink` `233 232 244`.

### Chrome / brand accent (app-level)
`brand` — a confident **electric violet ("iris")**, full 50–900 scale so tints/shades are reusable
tokens, not ad-hoc per component. `500 #7c4dff`, `600 #6a2ff0`, `700 #591fd0`. Used for primary
actions, focus rings, the current nav/tab selection, and state indicators **only** — never as
generic decoration. Tuned a touch bluer + more saturated than the per-subject `violet` family so
app chrome never reads as a subject accent, and kept distinct from the semantic green/amber/red so
the accent never collides with meaning. AA-checked: white-on-600 ≈ 6.4:1, 700-on-50 ≈ 7.5:1.

### Per-subject accent (content-level, quiet)
`lib/subjectColor.ts` maps each subject id → one of ~10 curated families, delivered as `--sc-*`
CSS vars via `subjectVars(id)` and read through arbitrary-value utilities. Roles: `solid`
(dot/rail/progress fill), `ink`/`inkDark` (AA-checked text on light/dark), `soft`/`soft-dark`
(tint fill), `line`, `from/to` (gradient — used sparingly, e.g. the monogram tile), `glow`. Keep
the footprint small: a color monogram tile or dot identifies the subject; the card stays neutral.

### Semantic (meaning, never decoration)
green = mastered / pass / on-track · amber = learning / catch-up / soon · red = shaky / fail /
urgent. Distinct from brand and subject accents. Always paired with a label — never color alone.

## Typography

One family: the system sans stack (`-apple-system, Segoe UI Variable, Inter, …`) — no web-font
load. Fixed rem scale (product, not landing — no clamped display type); tight tracking on headings
(`tracking-tight`, h1 `-0.02em`) with `text-wrap: balance`; `text-wrap: pretty` on prose.
`tabular-nums` for all counts, grades, percentages, and countdowns so figures don't jitter.

## Motion

`motion/react`. Restrained and state-driven: 150–250ms ease-out (`cubic-bezier(0.16,1,0.3,1)`) for
transitions; springs reserved for the few genuinely physical moments (low-energy, no bounce).
Patterns: staggered `fade-up`/`rise` entrances on grids, one-shot count-ups (`useCountUp`) and
progress fills, `layoutId` sliding tab/nav indicators, `AnimatePresence` panel crossfades. A
JS-free `.reveal` scroll effect exists but **defaults to fully visible** — it only fades+lifts when
the user allows motion *and* the engine supports `animation-timeline: view()`, so content never
ships blank in a headless render or without JS. The login screen keeps one restrained ambient
`aurora`/`float` touch; app chrome does not. Every animation has a reduced-motion fallback
(`useReducedMotion` + a global `prefers-reduced-motion` rule that neutralises durations).

## Components

Shared kit in `components/ui.tsx`: `Button` (primary/secondary/ghost × sm/md, loading), `Badge`
(neutral/brand/green/amber/red), `Panel`, form field classes, `Spinner`/`PageLoader`, `Skeleton`
(shimmer), `EmptyState`, `ErrorBox`, `BrandMark`, `cn`. Every interactive element carries
default/hover/focus/active/disabled/loading, with a visible `focus-visible` brand ring offset from
the canvas. Radius scale: `rounded-lg`/`rounded-xl` (controls, inputs, cards), `rounded-2xl` (large
feature panels), `rounded-full` (pills, avatars). Shadows are cool-ink tinted and *subtle*
(`shadow-card`, `shadow-card-hover`); the primary CTA uses brand-tinted `shadow-brand-sm/-md` so it
reads as lit. A crisp 1px `border-line` does most of the elevation work.

## Layout

**App shell (`components/shell/`).** A persistent **left sidebar** (`AppSidebar`: wordmark →
primary nav → streak card + Go Premium panel pinned to the bottom) sits directly on the canvas,
its right border carrying the elevation. Nav items: Dashboard, Subjects, Review, Quizzes,
Flashcards, AI Decks, Calendar, Progress, Grades, Settings — the active item takes a brand-tinted
pill. A sticky **top bar** (`AppTopbar`) holds the global search (`⌘K`), the theme toggle,
notifications, and the account chip. On mobile the sidebar collapses into a drawer. `AppShell`
composes shell + main; content is width-capped and generously gutter-padded.

**Surface pattern.** Most authenticated surfaces are a **two-column grid** — a primary column
(hero / list / runner) plus a right **rail** of supporting cards (session overview, upcoming
exams, AI suggestions, weekly goal) — collapsing to a single column under `lg`. Runners (Review,
Quiz) center a focused card with the rail alongside. Every multi-column layout reflows to one
column on small screens; responsive behavior is structural (collapse, reflow), not fluid
typography.

## Surfaces

Each authenticated destination and its intent:

- **Dashboard** — greeting hero ("Ready for today's review?") with the primary study CTA; a KPI
  strip (streak / due today / avg quiz score / nearest exam); subject cards with exam-readiness
  bars; focus areas (weak topics); rail: add-material, weekly-activity chart, upcoming reviews.
- **Subjects** — the subject grid; **Subject detail** — compact header + tab bar over a single
  active panel (progress, grades, cards).
- **Review** — hub lists what's due per subject; the **session runner** is a centered flip card
  (question ⇄ answer) with Again/Hard/Good/Easy rating and a session-overview rail.
- **Quizzes** — hub of quizzes; the **quiz runner** is an adaptive multiple-choice card with a
  progress bar, live score ring, topic breakdown, and a "why this matters" explanation.
- **Flashcards** — subject/deck picker, mastery KPIs, a searchable/filterable card table with
  per-card mastery, and a progress ring + recent-decks + AI-suggestions rail.
- **AI Decks** — upload materials → choose what Claude generates → a live AI-preview pipeline
  (Ingest → Extract → Generate → Review) showing example flashcards/quiz/summary.
- **Calendar / Study planner** — month grid of suggested review/quiz sessions + real exams; rail:
  readiness countdown, today's agenda, weekly-goal ring, AI-recommended plan.
- **Progress** — KPI strip, grade-trend line chart, topic-mastery donut, per-subject performance
  cards, an 8-week study-activity heatmap, and an AI-insight/study-tips rail.
- **Grades** — averages KPIs, a subject-overview table (current vs target, latest, trend), recent
  grades, and new-subject / add-grade forms in the rail.
- **Settings** — account and preferences.

Semantic tokens + the shell keep every surface consistent: same neutrals, one violet accent, quiet
per-subject identity, AA in both themes.
