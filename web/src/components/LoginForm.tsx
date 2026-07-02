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
    <div className="grid min-h-[100dvh] w-full lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      {/* Auth column */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Compact brand lockup — only shows on mobile, where the brand panel is hidden. */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <BrandMark size={44} />
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
              Welcome to Cram
            </h1>
            <p className="mt-1 text-sm text-gray-500">Your study desk. Sign in to continue.</p>
          </div>

          <div className="hidden lg:mb-8 lg:block">
            <h2 className="animate-fade-up text-2xl font-semibold tracking-tight text-gray-900">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p
              className="animate-fade-up mt-1 text-sm text-gray-500"
              style={{ animationDelay: "60ms" }}
            >
              {mode === "signin"
                ? "Pick up right where you left off."
                : "Start turning material into progress."}
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="animate-fade-up space-y-4 rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-card backdrop-blur-sm"
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
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {notice}
              </div>
            ) : null}

            <Button type="submit" loading={busy} className="w-full">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            <p className="text-center text-sm text-gray-500">
              {mode === "signin" ? "Need an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
                className="rounded font-medium text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
    <aside className="relative hidden overflow-hidden bg-brand-800 lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Drifting aurora blobs — transform/opacity only, so they stay cheap and collapse under
          prefers-reduced-motion via the global rule in globals.css. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-aurora absolute -left-24 -top-24 h-[30rem] w-[30rem] rounded-full bg-brand-500/45 blur-3xl" />
        <div className="animate-aurora-slow absolute -bottom-32 -right-16 h-[34rem] w-[34rem] rounded-full bg-brand-400/30 blur-3xl" />
        <div className="animate-float absolute right-24 top-28 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      </div>
      {/* Fine grid to give the field structure without shouting. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Top: mark inside a soft focus ring. */}
      <div className="relative flex items-center gap-3">
        <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
          <BrandMark size={30} />
          <span className="animate-float absolute -inset-2 -z-10 rounded-3xl bg-white/10 blur-md" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">Cram</span>
      </div>

      {/* Middle: the message + what it does. */}
      <div className="relative max-w-md">
        <h1 className="animate-fade-up text-4xl font-semibold leading-tight tracking-tight text-white">
          Study with less
          <br />
          <span className="text-brand-200">friction.</span>
        </h1>
        <p
          className="animate-fade-up mt-4 text-base leading-relaxed text-brand-100/80"
          style={{ animationDelay: "80ms" }}
        >
          Cram turns your notes into decks, schedules the review for you, and keeps every grade in
          view.
        </p>

        <ul className="mt-9 space-y-4">
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
    <li className="animate-fade-up flex items-start gap-3.5" style={{ animationDelay: delay }}>
      <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/10 text-brand-100 ring-1 ring-white/15">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
          {icon}
        </svg>
      </span>
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-brand-100/70">{body}</p>
      </div>
    </li>
  );
}
