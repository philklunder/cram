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

### Mobile adaptation (2026-07-10)

- **The "verbatim port" doctrine now holds for desktop only (≥ 1041px).** Below the story
  breakpoint the landing is *authored*, not ported: the comp's own mobile CSS was broken, so there
  is no reference to be pixel-exact against. The desktop cascade is untouched and still diffable.
- **Single-column grid tracks are `minmax(0, 1fr)`, never a bare `1fr`.** Applied to `.heroGrid`,
  `.connectedPanel`, `.storyLayout`, `.featureGrid`, `.mockLayout`. See Reasoning — this was the
  root cause of the clipped hero.
- **The hamburger became a real drawer.** It previously carried `aria-label="Jump to features"` and
  merely scrolled to `#features`; the nav links were `display: none` below 1040px and unreachable.
  The drawer ships `aria-expanded`/`aria-controls`, `inert` on the closed panel, body scroll-lock,
  Escape-to-close with focus returned to the toggle, and close-on-link/scrim/breakpoint-exit.
- **The drawer and its scrim are siblings of `<header>`, not children.** See Reasoning.
- **"How it works" stacks below 1040px: every step renders its own scene inline.** Previously
  `.storySteps { display: none }` deleted all four steps and froze the stage on scene 0, so the
  section shipped as a heading plus one static mock.
- **Scenes are authored once as components (`SceneUpload`…`SceneGrades`) and rendered into both
  layouts**, one of which is always `display: none`.
- **The devices section is a fixed 900×600 design canvas scaled to fit**, not a reflow. The scale
  factor is `min(1, tan(atan2(var(--device-avail), 900px)))`.
- **Touch targets are keyed to `@media (pointer: coarse)`, not to a width.**
- **Copy that described scroll-driven behaviour was rewritten.** The story section promised "the
  product scene changes as you move through the page", which was false on every phone.

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

### Mobile adaptation (2026-07-10)

- **`overflow-x: clip` on `.page`/`.main` turned every overflow bug into a silent one.** A bare
  `1fr` grid track takes a **min-content floor from every item in the track**. Once `.heroGrid`
  collapsed to one column, the dashboard mock joined the hero copy's track — and the mock's
  `.mockSearch { width: 235px }` set a **421px** floor inside a 358px container. The clip meant no
  scrollbar and no horizontal scroll, so the headline, body copy and both CTAs were simply *sliced
  off* at the viewport edge, looking like a padding bug. `minmax(0, 1fr)` removes the floor;
  `.mockSearch` was also made flexible so the mock's own chrome can shrink. **Any future
  single-column collapse in this file must use `minmax(0, 1fr)`** — the clip will hide the mistake.
- **Why the drawer cannot live inside `<header>`.** The header carries `backdrop-filter`, which makes
  it the **containing block for `position: fixed` descendants**. A scrim nested inside it resolves
  `inset: var(--header-h) 0 0` against the 76px bar, collapsing to zero height — it renders, it just
  has no area. Both are therefore siblings of the header, layered scrim 90 → drawer 95 → header 100
  so the bar and its toggle stay above the sheet. The same trap applies to any future fixed overlay
  on this page.
- **Why the sticky story stage cannot survive on mobile.** It needs a parallel scroll column
  (`.storySteps`, `min-height: 72vh` per step) to drive `data-state` via IntersectionObserver. On a
  phone there is no second column and no spare viewport height. Hiding the *steps* (the previous
  behaviour) kept the mechanism and deleted the content — exactly backwards. Stacking each scene
  under its own step keeps all four steps and needs no observer.
- **Why the scenes are rendered twice rather than mounted conditionally.** A `useMediaQuery` mount
  would flash the wrong layout on first paint (SSR has no viewport). Rendering both trees and hiding
  one with `display: none` is SSR-safe and costs no duplicate accessibility-tree nodes, since
  `display: none` removes a subtree from the a11y tree. The price is duplicated static markup; the
  content is authored once, so the two can't drift.
- **Why the devices section is scaled, not reflowed.** The iPad/iPhone mockups and their inner UI
  are authored in absolute pixels (24px titles, 38px search bars). Shrinking the *boxes* would leave
  desktop-sized chrome inside a 300px tablet. The comp's own mobile rule hardcoded a **760px** iPad
  into a 390px viewport (`left: -178px, right: 599px`) — clipped, unreadable. Scaling the whole
  composition preserves the art direction. `tan(atan2(a, b))` yields the bare number `a / b`, which
  is the one arithmetic `calc()` cannot express; it is guarded by `@supports` with a static fallback,
  and the canvas is taken out of flow so the un-scaled 900×600 box can't set the section's height.
- **A late rule was clobbering panel padding.** `.sectionHeading, .storyHeading, .connectedCopy,
  .ctaPanel { padding-left/right: 2px }` sat *after* `.connectedCopy { padding: 40px 26px }` in the
  ≤720px block, so text hugged the panel edges. Deleted; the panels keep their own padding. This is
  the fourth instance of the file's ordering hazard — the cascade is load-bearing here.

## Implications

- **`/` no longer lands signed-in users on `/dashboard`.** Everyone gets the marketing page; the app
  is one click away via Log in. If authenticated users should skip it, `app/page.tsx` needs a
  `getUser()` check — deliberately not added, as it makes `/` dynamic and costs the static prerender.
- **`landing.module.css` is a sealed artifact *above 1041px*.** It is a port, not a living design
  system: it does not use the semantic token layer, does not respond to `.dark`, and must not be
  "modernised" into Tailwind without re-running the pixel diff. New *app* UI must still use the
  tokens. **Below the breakpoint the seal is broken deliberately** (2026-07-10) — the comp's mobile
  CSS was not a working reference, so there is nothing to diff against and the mobile rules are
  ours to change.
- **The desktop pixel diff is still the regression gate**, and it still passes: at 1280/1440 the
  sticky stage is active, the hamburger is hidden, and the device stage is unchanged at 620px. The
  only desktop-visible deltas are ~4px on the decorative mock search bar (now flexible, capped at
  its original 235px) and the story section's rewritten copy.
- **The story section now has a hard structural contract**: `STORY_STEPS` drives both layouts.
  Adding a step means adding one array entry — but the scene must render correctly both absolutely
  positioned inside the stage and in normal flow inside `.stepStage`.
- **`--device-scale` depends on `--device-avail` tracking the container gutter.** If the phone
  gutters change (currently 48px/40px total), that variable must change with them or the mockups
  will overhang or under-fill.
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
- **No `/impressum` and no `/datenschutz` exist, and the footer links to neither** (2026-07-10,
  deferred by the owner). Cram is publicly reachable and takes sign-ups, so both are expected: the
  grading scale implies Switzerland (revDSG + UWG Art. 3(1)(s)); any German audience pulls in DSGVO
  + § 5 DDG. The disclosure surface is already known from the code — Supabase (auth, Postgres,
  Storage: email, password hash, uploaded PDFs/slides/images, grades), **Anthropic's API (uploaded
  study material is sent to Claude — a US transfer)**, and Railway (backend hosting). There is no
  analytics and no tracking cookie; the Supabase session cookie is strictly necessary, so **no
  consent banner is required**. Jurisdiction must be settled before the text is written, and the
  result needs legal review.
- **The scenes' markup is duplicated in the DOM** (desktop stage + mobile `.stepStage`). Harmless
  today; if a scene ever grows heavy or interactive, revisit.
- **A tiny uppercase tracked eyebrow sits above every section.** It is part of the shipped comp's
  identity, so the mobile pass left it alone, but it is the canonical AI-scaffolding tell and worth
  a deliberate decision if the page is ever reworked.

## Last updated

2026-07-10
