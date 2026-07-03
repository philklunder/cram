"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { BrandMark, Button, ErrorBox, inputClass, labelClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

// Email/password auth against Supabase (same project as iOS). On success the session cookie is
// set by @supabase/ssr and the route layout lets the user through.
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/subjects");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          router.push("/subjects");
          router.refresh();
        } else {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] w-full lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      {/* Auth column */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Compact brand lockup — only shows on mobile, where the brand panel is hidden. */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <BrandMark size={44} />
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              Welcome to Cram
            </h1>
            <p className="mt-1 text-sm text-muted">Your study desk. Sign in to continue.</p>
          </div>

          <div className="hidden lg:mb-7 lg:block">
            <h2 className="animate-fade-up text-[1.7rem] font-semibold leading-tight tracking-tight text-ink">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p
              className="animate-fade-up mt-1.5 text-sm text-muted"
              style={{ animationDelay: "60ms" }}
            >
              {mode === "signin"
                ? "Pick up right where you left off."
                : "Start turning material into progress."}
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="animate-fade-up space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7"
            style={{ animationDelay: "120ms" }}
          >
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            {error ? <ErrorBox message={error} /> : null}
            {notice ? (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                {notice}
              </div>
            ) : null}

            <Button type="submit" loading={busy} className="w-full">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            <p className="text-center text-sm text-muted">
              {mode === "signin" ? "Need an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
                className="rounded font-medium text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:text-brand-300 dark:hover:text-brand-200"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Brand panel (left half on desktop) ------------------------------------------------

// The "brand moment": a deep cobalt field with drifting aurora light, the mark inside a soft
// focus ring, and the three things Cram actually does. Editorial, not a fake product screenshot.
function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14"
      style={{
        // A deep cobalt-ink field with a single top-right glow. Static — no drifting loops — so it
        // reads as a calm, premium brand moment rather than an animated screensaver.
        backgroundImage:
          "radial-gradient(120% 90% at 88% 6%, rgb(59 108 246 / 0.28), transparent 55%)," +
          "linear-gradient(158deg, #12204a 0%, #0c1531 46%, #080d20 100%)",
      }}
    >
      {/* Fine grid to give the field structure without shouting; fades toward the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "linear-gradient(to bottom, black, transparent 82%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 82%)",
        }}
      />
      {/* A single hairline of light along the seam so the panel edge reads as intentional. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent"
      />

      {/* Top: mark inside a soft glass tile. */}
      <div className="relative flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur">
          <BrandMark size={28} />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">Cram</span>
      </div>

      {/* Middle: the message + what it does. */}
      <div className="relative max-w-md">
        <h1 className="animate-fade-up text-[2.6rem] font-semibold leading-[1.08] tracking-tight text-white">
          Study with less
          <br />
          <span className="text-brand-300">friction.</span>
        </h1>
        <p
          className="animate-fade-up mt-5 text-[0.975rem] leading-relaxed text-brand-100/75"
          style={{ animationDelay: "80ms" }}
        >
          Cram turns your notes into decks, schedules the review for you, and keeps every grade in
          view.
        </p>

        <ul className="mt-10 space-y-1">
          <Feature
            delay="160ms"
            title="Material into decks"
            body="Upload notes and slides, get a ready quiz deck back."
            icon={
              <path d="M11.3 1.046a1 1 0 0 1 1.4 0l7 6.857A1 1 0 0 1 20 8.62V19a2 2 0 0 1-2 2h-3v-6H9v6H6a2 2 0 0 1-2-2V8.62a1 1 0 0 1 .3-.717l7-6.857Z" />
            }
          />
          <Feature
            delay="240ms"
            title="Review that remembers"
            body="Spaced repetition surfaces each card exactly when it slips."
            icon={
              <path
                fillRule="evenodd"
                d="M4.5 12a7.5 7.5 0 0 1 12.9-5.2l1.3 1.2V4.5a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1h-6a1 1 0 1 1 0-2h3.2l-1.2-1.1A5.5 5.5 0 1 0 17.5 12a1 1 0 1 1 2 0 7.5 7.5 0 0 1-15 0Z"
                clipRule="evenodd"
              />
            }
          />
          <Feature
            delay="320ms"
            title="Grades in one place"
            body="Track where you stand against the mark you are aiming for."
            icon={
              <path d="M4 20a1 1 0 0 1-1-1V5a1 1 0 1 1 2 0v9.3l3.3-3.3a1 1 0 0 1 1.4 0l2.3 2.3 4.3-4.3H16a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9.4l-5 5a1 1 0 0 1-1.4 0L10.3 12 6 16.3V19a1 1 0 0 1-1 1H4Z" />
            }
          />
        </ul>
      </div>

      {/* Bottom: one quiet line of reassurance. No version stamps, no locale strips. */}
      <p className="relative text-sm text-brand-100/60">
        Your decks and grades sync with the Cram app on iOS.
      </p>
    </aside>
  );
}

function Feature({
  title,
  body,
  icon,
  delay,
}: {
  title: string;
  body: string;
  icon: ReactNode;
  delay: string;
}) {
  return (
    <li
      className="animate-fade-up flex items-start gap-3.5 border-t border-white/10 py-4 first:border-t-0"
      style={{ animationDelay: delay }}
    >
      <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-inset ring-white/10">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
          {icon}
        </svg>
      </span>
      <div>
        <p className="text-[0.925rem] font-medium text-white">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-brand-100/65">{body}</p>
      </div>
    </li>
  );
}
