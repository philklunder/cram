# Deployment & hosting

## Decisions
- **Backend host: Railway (Hobby plan).** The FastAPI backend deploys as a Docker
  container; Supabase (already live) remains DB + Auth + Storage.
- **The M1 reverse proxy is baked INTO the container, not delegated to the host edge.**
  One image runs **nginx on the public `$PORT` → uvicorn on `127.0.0.1:8000`**. nginx
  enforces the hard body cap (`client_max_body_size 36m`) and a coarse per-IP
  request/connection limit; uvicorn is never publicly reachable.
- **Deploy packaging lives in `backend/`:** `Dockerfile`, `deploy/entrypoint.sh`,
  `deploy/nginx.conf.template`, `railway.json`, `.dockerignore`. Railway's service
  **root directory must be set to `backend`** so it finds the Dockerfile.
- **Image installs from `requirements.lock`** (pinned, reproducible), not `requirements.txt`.
- **Future web dashboard (v0.6, Next.js) → Vercel**, not Railway.

## Reasoning
- **Why bake the proxy in instead of using the platform edge.** M1 (ADR 0009) requires a
  hard body cap + per-IP limit *in front of* the app, because every in-app guard runs only
  *after* FastAPI has spooled the multipart body, and the in-app `Content-Length` check is
  chunked-bypassable. Managed PaaS edges (Railway/Render) don't expose a configurable 36 MiB
  body cap or per-IP `limit_req` on the cheap tiers. Putting nginx **inside** the deploy makes
  M1 hold **portably** — identical behaviour on Railway, Render, or Fly — and matches the
  nginx config the repo already documented in `deploy/reverse-proxy.example.conf`.
- **Why nginx, not Caddy/Traefik.** `limit_req`/`limit_conn` and `client_max_body_size` are
  built into stock nginx (no plugins); Caddy rate-limiting needs a third-party module. The
  repo ships snippets for all three; nginx was the least-moving-parts choice for a single box.
- **Real client IP behind Railway.** The container's immediate peer is Railway's edge proxy on
  a *private* address, so a naive per-IP limit would key on the proxy, not the user. nginx
  `real_ip` trusts **only private ranges** (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`) and
  reads `X-Forwarded-For` — non-spoofable, since a public client can't present a private source.
  The app also needs `CRAM_TRUSTED_PROXY=1` so its own rate-limit key sees the real IP too.
- **nginx OVERWRITES `X-Forwarded-For` with `$remote_addr`, it does not append.** The app trusts
  the *first* XFF entry (`app/limits.py`) for its per-IP rate-limit fallback. The intuitive
  `$proxy_add_x_forwarded_for` appends the real peer to the *client-supplied* chain, so a client
  sending a forged `X-Forwarded-For` would land in the first slot and spoof that key — defeating
  the pre-auth flood limit it exists for. Sending the single realip-resolved `$remote_addr` makes
  the first entry always the true client. (Found + fixed in this session's pre-commit security
  review; the nginx `limit_req` layer was never affected, as realip resolves its key independently.)
- **Why Railway over the free options.** Considered and rejected for *this* backend:
  - **Vercel** — serverless only: a hard **4.5 MB function body limit** (vs. the product's
    32 MiB uploads) and short function timeouts vs. slow Claude vision calls. Would force a
    re-architecture (client → Supabase Storage signed-URL uploads) and still can't do the
    36 MiB M1 cap. Kept for the Next.js frontend, where it's the right tool.
  - **Render free** — viable (same Dockerfile, M1 intact) but cold-starts after 15 min idle.
  - **Railway Hobby** — ~$5/mo, no cold starts, simplest GitHub→Docker DX. Chosen for UX over
    the free-but-cold Render option. (Railway no longer has a true free tier.)
- **Why lockfile not floors.** Reproducible deploys; the Windows-generated lock is Linux-safe
  (`colorama` is cross-platform; no `pywin32`/`uvloop` pins to break the build).

## Implications
- A correct deploy is: Railway service root = `backend`, paste the prod env block
  (`docs/SETUP.md` → Production deploy checklist, incl. `CRAM_ENV=prod` and
  `CRAM_TRUSTED_PROXY=1`), generate a public domain, verify `GET /healthz` → `db: ok`.
- The `CRAM_ENV=prod` boot guard enforces env (auth + key + DB + 3 caps); the **proxy is now
  structurally guaranteed** because it's the container's only listener — M1's "the guard can't
  see the proxy" gap is closed *for this packaging* (it would re-open if someone ran bare
  uvicorn without the image). See [edge-and-budget-backstops.md](edge-and-budget-backstops.md).
- uvicorn runs `--workers 1` (fits the $5/mo footprint + the daily token caps); revisit if the
  user base grows.

## Open questions
- No container healthcheck wired into `railway.json` yet (relies on `/healthz` manually).
- If uvicorn crashes, nginx stays up and serves 502 until Railway's restart policy recycles the
  container; a process supervisor (or `wait -n`) would fail faster. Acceptable for a solo app.
- Build is not yet verified by an actual `docker build` (no Docker on the Windows dev box this
  session) — first Railway build is the real smoke test.

## Last updated
2026-06-18
