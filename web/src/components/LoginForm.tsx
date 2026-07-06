"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { BrandMark, Button, ErrorBox } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

// Email/password auth against Supabase (same project as iOS). On success the session cookie is
// set by @supabase/ssr and the route layout lets the user through.
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
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
        router.push("/dashboard");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        // Don't leak whether an address is already registered: an "already registered"
        // error is shown as the same neutral confirmation as a fresh sign-up, so the two
        // cases are indistinguishable to an attacker probing for accounts.
        if (error && /already|exist|registered/i.test(error.message)) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        } else if (error) {
          throw error;
        } else if (data.session) {
          router.push("/dashboard");
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

  // Google OAuth. signInWithOAuth redirects the browser to Google and back to /dashboard, so there's
  // no manual navigation here. If the Google provider isn't enabled on the Supabase project, the
  // call returns an error and we surface it inline.
  async function onGoogle() {
    setError(null);
    setNotice(null);
    setGoogleBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setError(error.message);
      setGoogleBusy(false);
    }
  }

  // Password reset — sends a Supabase recovery email for whatever address is in the field.
  async function onForgot() {
    if (!email) {
      setError("Enter your email above first, then choose “Forgot password”.");
      return;
    }
    setError(null);
    setNotice(null);
    const supabase = createClient();
    // Fire-and-forget: always show the same neutral notice regardless of whether the address
    // has an account, so the reset flow can't be used to enumerate registered emails. Any
    // real error is logged for debugging but never distinguishes "no such user" to the client.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) console.warn("password reset:", error.message);
    setNotice("If that email has an account, we've sent a link to reset your password.");
  }

  return (
    <div className="grid min-h-[100dvh] w-full lg:grid-cols-[1.25fr_1fr]">
      <BrandPanel />

      {/* Auth column */}
      <div className="relative flex min-h-[100dvh] flex-col px-4 pb-10 pt-5 sm:px-8">
        {/* Top bar: theme toggle + help. */}
        <div className="flex items-center justify-end gap-1">
          <ThemeToggle label />
          <a
            href="mailto:klunderphilipp@gmail.com?subject=Cram%20help"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition duration-200 ease-out hover:bg-brand-50/60 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
          >
            Need help?
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3" />
              <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </a>
        </div>

        {/* Card, vertically centered in the column. */}
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[26rem]">
            {/* Compact brand lockup — only on mobile, where the brand panel is hidden. */}
            <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-sm">
                <BrandMark size={26} />
              </span>
              <span className="text-lg font-bold tracking-tight text-ink">Cram</span>
            </div>

            <div className="rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-9 sm:py-10">
              <div className="animate-fade-up text-center">
                <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">
                  {mode === "signin" ? "Welcome back" : "Create your account"}
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  {mode === "signin"
                    ? "Pick up right where you left off."
                    : "Start turning material into progress."}
                </p>
              </div>

              <form
                onSubmit={onSubmit}
                className="animate-fade-up mt-7 space-y-4"
                style={{ animationDelay: "60ms" }}
              >
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.5 6.5A2 2 0 0 1 4.5 4.5h15a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-11Zm1.2-.3 8.3 6 8.3-6"
                    />
                  }
                />

                <Field
                  id="password"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  // Only enforce the stronger minimum on sign-up — an existing account may
                  // have a shorter legacy password and must still be able to sign in.
                  // Server-side strength (min length + leaked-password check) is configured
                  // in the Supabase project's Auth settings.
                  minLength={mode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-6a1.5 1.5 0 0 1 1.5-1.5Z"
                    />
                  }
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-subtle transition-colors hover:text-ink-2 focus-visible:outline-none focus-visible:text-brand-600"
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 8.5 4 9.5 7a12 12 0 0 1-2.2 3.2M6.2 6.2A12.4 12.4 0 0 0 2.5 12c1 3 4.5 7 9.5 7a9.3 9.3 0 0 0 3-.5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                          <circle cx="12" cy="12" r="2.75" />
                        </svg>
                      )}
                    </button>
                  }
                />

                {mode === "signin" ? (
                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink-2">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-line accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={onForgot}
                      className="rounded font-medium text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:text-brand-300 dark:hover:text-brand-200"
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : null}

                {error ? <ErrorBox message={error} /> : null}
                {notice ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                    {notice}
                  </div>
                ) : null}

                <Button type="submit" loading={busy} className="w-full">
                  {mode === "signin" ? "Sign in" : "Create account"}
                  {!busy ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13m0 0-5-5m5 5-5 5" />
                    </svg>
                  ) : null}
                </Button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs font-medium text-subtle">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <Button
                type="button"
                variant="secondary"
                loading={googleBusy}
                onClick={onGoogle}
                className="w-full"
              >
                {!googleBusy ? <GoogleIcon /> : null}
                Continue with Google
              </Button>

              <p className="mt-6 text-center text-sm text-muted">
                {mode === "signin" ? "New to Cram?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                    setNotice(null);
                  }}
                  className="inline-flex items-center gap-1 rounded font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:text-brand-300 dark:hover:text-brand-200"
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </p>
            </div>

            {/* Footer under the card. */}
            <p className="mt-6 flex flex-col items-center gap-1 text-center text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                Trusted by students worldwide
              </span>
              <span>Built for serious studying.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Form field (leading icon, optional trailing control) ------------------------------

function Field({
  id,
  label,
  icon,
  trailing,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-subtle"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
            {icon}
          </svg>
        </span>
        <input
          id={id}
          className="w-full rounded-xl border border-line bg-surface-2/50 py-2.5 pl-11 pr-11 text-sm text-ink shadow-sm transition duration-200 placeholder:text-subtle hover:border-line-strong focus:border-brand-400 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-500/15 dark:bg-surface-2/40"
          {...props}
        />
        {trailing}
      </div>
    </div>
  );
}

// The multi-color Google "G" — inlined so it works under the strict no-external-host setup.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

// --- Brand panel (left half on desktop) ------------------------------------------------

// The "brand moment": a deep violet-ink field lit by two iris glows, the message + three things
// Cram does, and a floating product illustration. Static — premium, not an animated screensaver.
function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14"
      style={{
        backgroundImage:
          "radial-gradient(115% 85% at 86% 4%, rgb(124 77 255 / 0.38), transparent 56%)," +
          "radial-gradient(90% 72% at 8% 108%, rgb(106 47 240 / 0.24), transparent 60%)," +
          "linear-gradient(160deg, #1c1147 0%, #140d33 46%, #0b081d 100%)",
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
      {/* Hairline of light along the seam so the panel edge reads as intentional. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent"
      />

      {/* Floating product illustration, center-right; decorative, clipped by the panel edge. */}
      <BrandIllustration />

      {/* Top: mark inside a violet gradient tile. */}
      <div className="relative flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-sm ring-1 ring-inset ring-white/15">
          <BrandMark size={30} />
        </span>
        <span className="text-xl font-bold tracking-tight text-white">Cram</span>
      </div>

      {/* Middle: the message + what it does. */}
      <div className="relative max-w-md">
        <h1 className="animate-fade-up text-[2.9rem] font-bold leading-[1.04] tracking-tight text-white">
          Study with less
          <br />
          <span className="text-brand-300">friction.</span>
        </h1>
        <p
          className="animate-fade-up mt-5 max-w-xs text-[0.975rem] leading-relaxed text-brand-100/85"
          style={{ animationDelay: "80ms" }}
        >
          Turn your notes into smart flashcards and quizzes, review with spaced repetition, and keep
          every grade in sight.
        </p>

        <ul className="mt-9 max-w-xs space-y-1">
          <Feature
            delay="160ms"
            title="Notes to flashcards"
            body="Upload notes and slides. Cram turns them into cards and quizzes instantly."
            icon={
              <path d="M6 2.5h7.6a1 1 0 0 1 .7.3l4.9 4.9a1 1 0 0 1 .3.7V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Zm7.5 1v4a1 1 0 0 0 1 1h4M8.5 12.5h7M8.5 16h5" />
            }
            stroke
          />
          <Feature
            delay="240ms"
            title="Review that sticks"
            body="Spaced repetition surfaces what matters, right when you need it."
            icon={
              <path d="M4.5 12a7.5 7.5 0 0 1 12.9-5.2l1.6 1.5M19.5 5v3.8h-3.8M19.5 12a7.5 7.5 0 0 1-12.9 5.2l-1.6-1.5M4.5 19v-3.8h3.8" />
            }
            stroke
          />
          <Feature
            delay="320ms"
            title="Grades in one place"
            body="Track your progress and watch your scores improve over time."
            icon={<path d="M5 20V11m7 9V4m7 16v-6" />}
            stroke
          />
        </ul>
      </div>

      {/* Bottom: the security reassurance, in a bordered tile. */}
      <div className="relative flex max-w-md items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-500/20 text-brand-100 ring-1 ring-inset ring-brand-400/25">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12l1.8 1.8L15 10" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Your data is private and secure.</p>
          <p className="mt-0.5 text-sm text-brand-100/70">
            Protected with industry-standard encryption.
          </p>
        </div>
      </div>
    </aside>
  );
}

function Feature({
  title,
  body,
  icon,
  delay,
  stroke = false,
}: {
  title: string;
  body: string;
  icon: ReactNode;
  delay: string;
  stroke?: boolean;
}) {
  return (
    <li
      className="animate-fade-up flex items-start gap-3.5 border-t border-white/10 py-4 first:border-t-0"
      style={{ animationDelay: delay }}
    >
      <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-500/20 text-brand-100 ring-1 ring-inset ring-brand-400/25">
        <svg
          viewBox="0 0 24 24"
          fill={stroke ? "none" : "currentColor"}
          stroke={stroke ? "currentColor" : "none"}
          strokeWidth={stroke ? 1.8 : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[1.15rem] w-[1.15rem]"
          aria-hidden
        >
          {icon}
        </svg>
      </span>
      <div>
        <p className="text-[0.925rem] font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-brand-100/75">{body}</p>
      </div>
    </li>
  );
}

// Decorative floating cards: a "Swiss scale" flashcard stack behind a graduation cap, and a
// "Your progress" chart card — both tilted in 3D so they face slightly left, over a field of faint
// shining sparkles. Purely visual (aria-hidden), wide-viewport only, clipped by the panel overflow.
function BrandIllustration() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-4 top-1/2 hidden h-[27rem] w-[23rem] -translate-y-1/2 min-[1400px]:block"
      style={{ perspective: "1500px" }}
    >
      {/* Sparkles shining behind the cards. */}
      <Sparkles />

      {/* Strong violet glow bleeding from beneath the flashcard. */}
      <div className="absolute left-1/2 top-[40%] h-44 w-52 -translate-x-1/2 rounded-full bg-brand-500/40 blur-[55px]" />

      {/* Flashcard stack — turned to face slightly left; back cards peek up and to the right. */}
      <div
        className="absolute right-0 top-0 h-[11rem] w-[15rem]"
        style={{ transform: "rotateX(9deg) rotateY(22deg) rotateZ(2deg)", transformStyle: "preserve-3d" }}
      >
        <div className="absolute inset-0 -translate-y-5 translate-x-5 rounded-[1.4rem] border border-white/10 bg-brand-200/[0.06]" />
        <div className="absolute inset-0 -translate-y-[0.6rem] translate-x-[0.6rem] rounded-[1.4rem] border border-white/10 bg-brand-200/[0.09]" />
        <div className="absolute inset-0 rounded-[1.4rem] border border-white/15 bg-gradient-to-br from-brand-200/15 to-brand-600/8 p-6 shadow-[0_20px_45px_-15px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <div className="flex items-start justify-between">
            <span className="text-[1.05rem] font-medium text-white">Swiss scale</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-brand-100/80" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 15.9 7.3 18.3l.9-5.1L4.5 9.5l5.2-.8L12 4Z" />
            </svg>
          </div>
          <span className="mt-9 block h-1.5 w-2/5 rounded-full bg-brand-100/30" />
        </div>
      </div>

      {/* Progress card — same left-facing tilt, wider, sitting lower-left. */}
      <div
        className="absolute bottom-0 left-0 w-[20rem]"
        style={{ transform: "rotateX(7deg) rotateY(18deg) rotateZ(1deg)" }}
      >
        <div className="rounded-[1.4rem] border border-white/15 bg-gradient-to-br from-brand-300/16 to-brand-600/8 p-6 shadow-[0_24px_50px_-18px_rgba(0,0,0,0.65)] backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-[1.05rem] font-semibold text-white">Your progress</span>
            <span className="rounded-lg bg-amber-400 px-2.5 py-1 text-sm font-bold text-amber-950">A-</span>
          </div>
          <svg viewBox="0 0 260 92" className="mt-4 h-24 w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="pg-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b6dff" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#8b6dff" stopOpacity="0" />
              </linearGradient>
              <filter id="pg-glow" x="-20%" y="-60%" width="140%" height="220%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Faint vertical gridlines, one under each weekday. */}
            {[10, 50, 90, 130, 170, 210, 250].map((x) => (
              <line key={x} x1={x} y1="2" x2={x} y2="78" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />
            ))}
            <path
              d="M10 66 C30 64 36 54 54 54 C72 54 78 60 96 57 C116 54 120 44 140 45 C160 46 168 34 188 32 C206 30 214 20 236 15 C246 12 252 9 258 6 L258 88 L10 88 Z"
              fill="url(#pg-fill)"
            />
            <path
              d="M10 66 C30 64 36 54 54 54 C72 54 78 60 96 57 C116 54 120 44 140 45 C160 46 168 34 188 32 C206 30 214 20 236 15 C246 12 252 9 258 6"
              fill="none"
              stroke="#a78bff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#pg-glow)"
            />
            <circle cx="140" cy="45" r="3" fill="#ffffff" />
            <circle cx="236" cy="15" r="3" fill="#ffffff" />
          </svg>
          <div className="mt-1 flex justify-between text-[11px] font-medium text-white/45">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Graduation cap — painted last so it sits in front, bridging the two cards on the left. */}
      <GradCap />
    </div>
  );
}

// A 3D-ish graduation mortarboard: a diamond board over a rounded crown, a violet button, and a
// tassel that drapes to the right and hangs with a small fringe.
function GradCap() {
  return (
    <svg
      viewBox="0 0 170 145"
      className="absolute left-0 top-[25%] h-[9.5rem] w-48 drop-shadow-[0_18px_26px_rgba(0,0,0,0.55)]"
      aria-hidden
    >
      {/* Crown (the part around the head) */}
      <path d="M50 64 C50 64 68 75 85 75 C102 75 120 64 120 64 L120 86 C120 97 104 105 85 105 C66 105 50 97 50 86 Z" fill="#140d33" />
      <path d="M50 64 C50 64 68 75 85 75 C102 75 120 64 120 64 L120 71 C120 80 104 87 85 87 C66 87 50 80 50 71 Z" fill="#1d1450" />
      {/* Board (mortarboard top) — a rhombus seen in perspective, with a lighter front facet */}
      <path d="M85 32 L162 61 L85 84 L8 61 Z" fill="#241659" />
      <path d="M85 32 L162 61 L85 66 L8 61 Z" fill="#33207e" />
      {/* Button + tassel */}
      <circle cx="85" cy="56" r="5" fill="#8b6dff" />
      <path d="M85 56 C122 58 140 60 140 65 L140 100" fill="none" stroke="#a78bff" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="134" y="98" width="12" height="9" rx="3.5" fill="#b7a6ff" />
      <path d="M136 106 l-1.5 14 M140 107 l0 15 M144 106 l1.5 14" stroke="#b7a6ff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Faint shining sparkles scattered behind the cards — soft glowing dots plus a couple of 4-point
// glints. Static (the glow reads as "shining"); no ambient loop.
function Sparkles() {
  const dots = [
    { top: "5%", left: "42%", s: 3, o: 0.7 },
    { top: "11%", left: "80%", s: 2, o: 0.5 },
    { top: "28%", left: "95%", s: 4, o: 0.85 },
    { top: "2%", left: "63%", s: 2, o: 0.5 },
    { top: "52%", left: "4%", s: 3, o: 0.6 },
    { top: "58%", left: "90%", s: 5, o: 0.9 },
    { top: "72%", left: "38%", s: 3, o: 0.7 },
    { top: "80%", left: "72%", s: 2, o: 0.55 },
    { top: "90%", left: "96%", s: 4, o: 0.8 },
    { top: "44%", left: "52%", s: 2, o: 0.5 },
    { top: "66%", left: "16%", s: 2, o: 0.5 },
  ];
  const glints = [
    { top: "18%", left: "30%", s: 15 },
    { top: "62%", left: "60%", s: 12 },
  ];
  return (
    <>
      {dots.map((d, i) => (
        <span
          key={`d${i}`}
          className="absolute rounded-full bg-white"
          style={{
            top: d.top,
            left: d.left,
            width: d.s,
            height: d.s,
            opacity: d.o,
            boxShadow: `0 0 ${d.s * 2.5}px ${d.s / 1.5}px rgba(199,183,255,0.85)`,
          }}
        />
      ))}
      {glints.map((g, i) => (
        <svg
          key={`g${i}`}
          viewBox="0 0 24 24"
          fill="currentColor"
          className="absolute text-white/80"
          style={{ top: g.top, left: g.left, width: g.s, height: g.s }}
          aria-hidden
        >
          <path d="M12 0C12.6 7.2 16.8 11.4 24 12c-7.2.6-11.4 4.8-12 12-.6-7.2-4.8-11.4-12-12C7.2 11.4 11.4 7.2 12 0Z" />
        </svg>
      ))}
    </>
  );
}
