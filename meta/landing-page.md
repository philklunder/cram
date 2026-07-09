# Marketing landing page (`/home`) — porting a standalone HTML comp into the app

The first **public, unauthenticated** surface in `web/`. Everything before it lived behind the
Supabase gate; `/` used to `redirect("/dashboard")`. The owner supplied a finished 950 KB standalone
HTML file (`cram-landing-page-v4-spaced-home.html`) and asked for it to look **exactly** as shipped.

## Decisions

- **The landing page lives at `/home`; `/` is a server `redirect("/home")` (2026-07-09).** A single
  redirect in `app/page.tsx` covers dev and prod identically, so `localhost:3000` and the Vercel
  origin both open the landing page. `/home` is statically prerendered (~8.6 kB).
- **The comp's CSS was ported *verbatim* into a CSS Module, not rewritten as Tailwind.**
  [`components/landing/landing.module.css`](../web/src/components/landing/landing.module.css) is the
  original stylesheet with its cascade intact. Class names are hashed, so the comp's deliberately
  generic names (`.container`, `.btn`, `.section`, `.brand`) cannot collide with the app.
- **Bare element/attribute selectors are prefixed with `.page`; the low-specificity resets use
  `:where(.page)`.** CSS Modules only scopes *class* selectors — a bare `h1 {}` or `[data-reveal] {}`
  would leak globally. But `.page a` scores 0-1-1 and beats every single-class rule (`.btnSecondary`),
  so the comp's `a { color: inherit }` reset is written `:where(.page) a` to preserve its 0-0-1 weight.
- **The comp's three inline scripts became ref-scoped `useEffect`s**, querying inside the page
  container rather than `document`, so the landing's observers can never touch the app shell.
  `--hero-progress` is set on the page element (the CSS vars moved off `:root` onto `.page`).
- **The root canvas is pinned light with `html:has(> body > .page)`.** The landing is light-only but
  renders inside the app's shared `<body>`, which is dark under `.dark`. `:has()` scopes the override
  to when the landing is the body's child, so `/login` and the app shell keep their dark theme.
- **`next/font` (self-hosted Geist) — reversing the "no `next/font`, system stack" decision** in
  [web-dashboard.md](web-dashboard.md). The comp loads Geist from `fonts.googleapis.com`, which the
  2026-07-06 CSP (`font-src 'self'`, `style-src 'self'`) blocks outright.
- **`/signup` added as a real route.** `LoginForm` gained an `initialMode` prop; `/login` and
  `/signup` render the same card on different tabs. The in-card tab toggle rewrites the URL with
  `window.history.replaceState`, **not** a router navigation.
- **The six embedded base64 copies of the logo were replaced by the existing `public/cram-logo.png`.**
  Same artwork at higher resolution; page source drops from 950 KB to ~8.6 kB.
- **`.heroProof` ships `font-weight: 600`, though the comp declares `550`.** See Reasoning.

## Reasoning

- **Why a CSS Module rather than a Tailwind rewrite.** The requirement was pixel-exactness against a
  reference file. Re-expressing ~2,400 lines of hand-tuned CSS as utilities invites hundreds of
  silent rounding/ordering drifts, each individually invisible and collectively wrong. Porting the
  cascade verbatim makes the diff *zero by construction*, and hashing solves the only real objection
  (name collisions). Rejected: a global `landing.css` (generic names would collide) and an `<iframe>`
  of the raw HTML (breaks routing, CSP `frame-ancestors 'none'`, and Link prefetch).
- **The app's own global CSS is the main hazard when embedding a foreign design.** Three rules in
  `globals.css`/Tailwind preflight silently moved the layout, each found only by pixel-diffing:
  1. `@layer base` `text-wrap: balance` on headings re-broke a heading's lines.
  2. Preflight's `html { line-height: 1.5 }` grew every element without its own line-height
     (the comp inherited the UA's `normal`) — the mock dashboard gained ~10 px.
  3. Preflight zeroes `p { margin-bottom }`. It collapses away in block flow, but **not inside the
     comp's flex columns** (`.connectedCopy`, `.storyStep`), where it was 18 px of real spacing —
     the whole document was 18 px short.
  The module therefore re-asserts `line-height: normal`, `text-wrap: wrap`, `h3 { font-weight: bold }`
  and `p { margin-bottom: 1em }` under `.page`. **Any future foreign comp will hit the same three.**
- **Why `next/font` now, when web-dashboard.md rejected it.** That decision cited a build-time Google
  Fonts fetch as unreliable and an unnecessary supply-chain surface. Both objections are now
  outweighed: the CSP forbids the runtime `<link>` the comp used, so the choice is not "system stack
  vs. Geist" but "self-host Geist at build time or ship the wrong typeface". `next/font` downloads at
  build and serves from our origin, satisfying `font-src 'self'`. **The app shell still uses the
  system stack** — Geist is applied via a `className` on the landing container only.
- **Why `550` renders as `600`.** The comp requests discrete Geist instances from Google
  (`wght@400;500;600;650;700;750;800;850`). There is **no 550 face**, so the browser resolves `550` to
  `600` — the reference *paints* 600. `next/font` ships the true variable axis and would render a
  real 550, ~4 px narrower. `next/font`'s manifest only permits 100–900 in hundreds (or `variable`),
  so requesting a static `650` to reproduce the comp exactly is impossible — and forcing 100-step
  statics would snap `650`→`700` on every button, which is worse. Declaring `600` matches what the
  reference actually paints. `550` is the only weight in the stylesheet absent from Google's list.
- **Why `history.replaceState` for the login/signup tab toggle.** A `router.push` between `/login` and
  `/signup` remounts `LoginForm` and destroys in-flight state — specifically the neutral
  "check your email to confirm your account" notice, which the anti-enumeration design
  ([web-dashboard.md](web-dashboard.md)) depends on showing after a sign-up attempt. Next 15 supports
  `history.replaceState` for shallow URL sync.

## Implications

- **`/` no longer lands signed-in users on `/dashboard`.** Everyone gets the marketing page; the app
  is one click away via Log in. If authenticated users should skip it, `app/page.tsx` needs a
  `getUser()` check — deliberately not added, as it makes `/` dynamic and costs the static prerender.
- **`landing.module.css` is a sealed artifact.** It is a port, not a living design system: it does not
  use the semantic token layer, does not respond to `.dark`, and must not be "modernised" into
  Tailwind without re-running the pixel diff. New *app* UI must still use the tokens.
- **The `:has()` canvas override is load-bearing.** If the landing ever stops being a direct child of
  `<body>` (e.g. wrapped in a route-group layout div), the selector silently stops matching and
  dark-theme users see a dark canvas on overscroll.
- **Two public routes now exist** (`/home`, `/signup`) plus `/`. The middleware matcher already covers
  them; neither is auth-gated. `/signup` inherits the existing open-sign-up exposure noted in
  web-dashboard.md.
- **A CDP screenshot harness proved the port.** Headless Edge driven over the DevTools Protocol
  (Node 22's global `WebSocket`, no dependency) scrolls to a selector and captures, gated on
  `document.fonts.ready`. Section offsets and total document height match the reference exactly
  (7247 px; 844 / 1579 / 4339 / 5333), and everything below the header is pixel-identical. This is a
  far stronger check than the existing `preview/` eyeball harness and is worth reusing.

## Open questions

- **Residual diff: ~58 px on the logo bitmap**, because the app's 512 px master resamples slightly
  differently to 43 px than the comp's ~320 px copy. Same artwork; kept the sharper master rather than
  adding a fourth logo asset. Also ~200 px of anti-aliasing on the hero's 1 px decorative ring.
- **`.page a.btnPrimary`** carries a redundant `a` in its selector (from debugging the specificity bug
  above). Now that the reset is `:where()`-wrapped it can be simplified back to `.btnPrimary`.
- **Nav links point at anchors only.** "Why Cram" / "iPhone & iPad" scroll within `/home`; there are no
  standalone marketing pages, and no `/pricing` despite the app having a `/premium` route.
- **The landing duplicates product copy** (feature blurbs, the "Study with less friction" line) that
  also lives in the login brand panel. They will drift; neither is sourced from `PRODUCT.md`.
- Should the landing be excluded from the `.dark` no-flash script entirely, rather than overriding its
  effect with `:has()`?

## Last updated

2026-07-09
