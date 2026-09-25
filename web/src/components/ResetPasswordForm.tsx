"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field } from "@/components/LoginForm";
import { BackToHomeLink, Button, ErrorBox, buttonClass } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

const LOCK_ICON = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-6a1.5 1.5 0 0 1 1.5-1.5Z"
  />
);

// Choose a new password after following a recovery email. The recovery session is already set
// (by /auth/callback), so this is a single updateUser call.
export function ResetPasswordForm({ email, hasSession }: { email: string | null; hasSession: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas px-4 pb-10 pt-5 sm:px-8">
      <div className="flex items-center justify-between gap-1">
        <BackToHomeLink />
        <ThemeToggle label />
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-[26rem] rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-9 sm:py-10">
          {hasSession ? (
            <>
              <div className="text-center">
                <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">Choose a new password</h1>
                <p className="mt-1.5 text-sm text-muted">
                  {email ? <>For {email}. </> : null}At least 8 characters.
                </p>
              </div>
              <form onSubmit={onSubmit} className="mt-7 space-y-4">
                <Field
                  id="new-password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={LOCK_ICON}
                />
                <Field
                  id="confirm-password"
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  icon={LOCK_ICON}
                />
                {error ? <ErrorBox message={error} /> : null}
                <Button type="submit" loading={busy} className="w-full">
                  Save password
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">This link has expired</h1>
              <p className="mt-1.5 text-sm text-muted">
                Reset links work once and only for a short time. Request a new one from the sign-in page.
              </p>
              <Link href="/login" className={buttonClass("primary", "md", "mt-7 w-full")}>
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
