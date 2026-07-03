# Design

Visual system for the Cram web study desk. Stack: Next.js 15 (App Router, RSC) · React 19 ·
Tailwind CSS v3 · Supabase · `motion` (framer-motion) for interaction motion.

**North star: Linear.** Fast, restrained, precise. Tight cool-gray neutrals, one sharp cobalt
accent used only for action/selection/state, crisp hairline borders over heavy shadows, motion
that confirms state rather than performs. Per-subject color stays — it's how a learner navigates —
but as a *quiet* identity signal (dot, thin rail, subtle tint), not big gradient heroes.

## Theme

Light and dark are both first-class (`darkMode: "class"`; `.dark` on `<html>`, no-flash script +
`ThemeToggle`, persisted in `localStorage['cram-theme']`). Cool slate-tinted neutrals; a lit
canvas (two faint cobalt radial glows fixed behind content, stronger in dark so the near-black
still reads as lit). Every token pair is AA-checked in **both** themes.

## Color

### Semantic surface/text/line tokens (the load-bearing layer)
RGB-triple CSS vars in `globals.css`, exposed as Tailwind colors in `tailwind.config.ts`:
`canvas` (page bg) · `surface` (cards) · `surface-2` (insets) · `ink`/`ink-2` (text) ·
`muted`/`subtle` (captions/decorative) · `line`/`line-strong` (hairlines/hover borders).
Components reach for these, never raw `gray-*`/`white`, so one class is correct in both themes and
alpha modifiers still work (`bg-surface/80`).

### Chrome / brand accent (app-level)
`brand` — a confident cobalt, full 50–900 scale. Used for primary actions, focus rings, current
selection, and state indicators **only** — never decoration. `500 #3b6cf6`, `600 #2a54e8`. The
primary-button top-lit gradient reads on both canvases.

### Per-subject accent (content-level, quiet)
`lib/subjectColor.ts` maps each subject id → one of 10 curated families, delivered as `--sc-*` CSS
vars via `subjectVars(id)` and read through arbitrary-value utilities. Roles: `solid` (dot/rail),
`ink`/`inkDark` (AA-checked text on light/dark), `soft`/`soft-dark` (tint fill light/dark),
`line`, `from/to` (gradient — used sparingly), `glow` (rgb triple). Keep the footprint small: a
color rail or dot identifies the subject; the surface itself stays neutral.

### Semantic (meaning, never decoration)
green = mastered / pass / on-track · amber = learning / catch-up / soon · red = shaky / fail /
urgent. Distinct from brand and subject accents. Always paired with a label — never color alone.

## Typography

One family: the system sans stack (`-apple-system, Segoe UI Variable, Inter, …`). Fixed rem scale
(product, not landing — no clamped display type), tight tracking on headings (`tracking-tight`).
`tabular-nums` for all counts/grades/countdowns. No display/body pairing, no web-font load.

## Motion

`motion/react`. Restrained and state-driven: 150–250ms ease-out (`cubic-bezier(0.16,1,0.3,1)`) for
transitions; springs reserved for the few genuinely physical moments (kept low-energy, no bounce).
Patterns: subtle staggered entrance on the subjects grid, one-shot count-ups (`useCountUp`) and
progress fills, `layoutId` sliding tab indicator, `AnimatePresence` crossfade between panels.
Decorative ambient loops (aurora/float) are being retired from the app chrome in favour of Linear-
style calm; the login screen may keep one restrained ambient touch. Every animation has a
reduced-motion fallback (`useReducedMotion` + global `@media (prefers-reduced-motion: reduce)`).

## Components

Shared kit in `components/ui.tsx`: `Button` (primary/secondary/ghost × sm/md, loading), `Badge`
(neutral/brand/green/amber/red), `Panel`, form field classes, `Spinner`/`PageLoader`, `Skeleton`,
`EmptyState`, `ErrorBox`. Every interactive component carries default/hover/focus/active/disabled/
loading. Radius scale leans crisp: `rounded-lg`/`rounded-xl` (controls/inputs/cards),
`rounded-full` (pills) — applied consistently. Shadows are cool-ink tinted and *subtle*
(`shadow-card`, `shadow-card-hover`); crisp 1px `border-line` does most of the elevation work.

## Layout

App shell: sticky translucent top nav + centered main (`max-w-5xl`). Subjects overview is a
responsive auto-fit grid (`minmax(280px, 1fr)`). Subject detail is a compact header + tab bar +
single active panel. Every multi-column layout collapses to one column under `md`. Responsive
behavior is structural (collapse, reflow), not fluid typography.
