# Design

Visual system for the Cram web study desk. Stack: Next.js 15 (App Router, RSC) · React 19 ·
Tailwind CSS v3 · Supabase · `motion` (framer-motion) for interaction motion. Light theme locked.

## Theme

Light only (`color-scheme: light`). Cool ink base (slate-tinted grays), a lit canvas (two faint
cobalt radial glows fixed behind content), and a per-subject content accent layered on top.

## Color

### Chrome / brand (app-level)
`brand` — a confident cobalt/azure, full 50–900 scale (`tailwind.config.ts`). Used for the logo,
primary buttons, focus rings, nav, and generic surfaces. `500 #3b6cf6`, `600 #2a54e8`.

### Per-subject accent (content-level)
`lib/subjectColor.ts` maps each subject id → one of 10 curated families (emerald, sky, violet,
rose, amber, teal, fuchsia, indigo, orange, cyan). Delivered as `--sc-*` CSS variables via
`subjectVars(id)`; read through arbitrary-value utilities (`bg-[var(--sc-soft)]`,
`text-[color:var(--sc-ink)]`). Roles per family: `solid` (500, accents), `ink` (700, text —
AA-checked on white + own tint), `soft` (50, surface), `line` (100, border), `from/to` (400/600,
gradient), `glow` (rgb triple for shadows).

### Semantic (meaning, never decoration)
green = mastered / pass / on-track · amber = learning / catch-up / soon · red = shaky / fail /
urgent exam. Kept distinct from both brand and subject accents.

## Typography

One family: the system sans stack (`-apple-system, Segoe UI Variable, …`). Fixed rem scale, tight
tracking on headings (`tracking-tight`). `tabular-nums` for all counts/grades/countdowns. No
display/body pairing, no web-font load.

## Motion

`motion/react`. Springs for physical entrances (`stiffness ~120, damping ~18`); 150–250 ms
ease-out for state transitions. Patterns: staggered card entrance on the subjects grid, animated
count-ups (`useCountUp`), one-shot progress-bar/ring fills, `layoutId` sliding tab indicator,
`AnimatePresence` crossfade between detail tab panels. Existing CSS keyframes retained: `rise`,
`fade-up`, `aurora`, `float`, `shimmer`. Every animation has a reduced-motion fallback
(`useReducedMotion` + the global `@media (prefers-reduced-motion: reduce)` clamp in `globals.css`).

## Components

Shared kit in `components/ui.tsx`: `Button` (primary/secondary/ghost × sm/md, loading state),
`Badge` (neutral/brand/green/amber/red), `Panel`, form field classes, `Spinner`/`PageLoader`,
`Skeleton`, `EmptyState`, `ErrorBox`. Radius scale: `rounded-xl` (controls/inputs), `rounded-2xl`
(cards/panels), `rounded-full` (badges/pills) — applied consistently. Shadows are cool-ink tinted
(`shadow-card`, `shadow-card-hover`) or brand-tinted for the primary CTA.

## Layout

App shell: sticky translucent top nav + `max-w-5xl` centered main. Subjects overview is a
responsive auto-fit grid (`minmax(280px, 1fr)`). Subject detail is a colored hero header + tab bar
+ single active panel. Every multi-column layout collapses to one column under `md`.
