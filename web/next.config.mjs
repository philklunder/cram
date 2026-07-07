/** @type {import('next').NextConfig} */

// Origins the browser is allowed to talk to (connect-src): Supabase (auth + data) and the
// Cram backend. Read from the same NEXT_PUBLIC_* env the client uses so the CSP tracks the
// real deployment; fall back to the live backend default in lib/env.ts.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const BACKEND_URL = (
  process.env.NEXT_PUBLIC_CRAM_BACKEND_URL ?? "https://cram.up.railway.app"
).replace(/\/+$/, "");

// Supabase Auth may also open a realtime WebSocket (wss://) to the same host.
const supabaseWs = SUPABASE_URL ? SUPABASE_URL.replace(/^http/, "ws") : "";

const connectSrc = ["'self'", SUPABASE_URL, supabaseWs, BACKEND_URL].filter(Boolean).join(" ");

// In local dev the app is served over plain http://localhost, so the HTTPS-forcing directives are
// omitted: `upgrade-insecure-requests` (CSP) and the HSTS header both break http on localhost —
// HSTS in particular makes the browser force https://localhost for its whole max-age. They stay ON
// in production, where Vercel serves HTTPS. (NODE_ENV is "development" under `next dev`, "production"
// under `next build`/`next start`.)
const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. 'unsafe-inline' is required for scripts (the Next.js App Router
// bootstraps hydration with inline scripts, plus the tiny no-flash-theme script in
// layout.tsx) and for styles (the UI uses inline style={{…}} extensively and Tailwind's
// injected styles). frame-ancestors 'none' is the load-bearing clickjacking defense.
const csp = [
  "default-src 'self'",
  // Next.js dev (Fast Refresh / react-refresh) evaluates code with eval(), so 'unsafe-eval' is
  // required locally. The production bundle never evals — keep it out of the prod CSP.
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
