"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div className="mx-auto mt-24 w-full max-w-sm animate-rise px-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <BrandMark size={48} />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">Welcome to Cram</h1>
        <p className="mt-1 text-sm text-gray-500">Your study desk — sign in to continue.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-card">
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
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
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
            className="rounded font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}
