"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandMark, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

// Top navigation bar with the user's email and a sign-out action.
export function AppNav({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/subjects"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <BrandMark size={30} />
          <span className="text-lg font-semibold tracking-tight text-gray-900">Cram</span>
        </Link>
        <div className="flex items-center gap-3">
          {email ? (
            <span className="hidden text-sm text-gray-500 sm:inline" title={email}>
              {email}
            </span>
          ) : null}
          <Button variant="secondary" size="sm" onClick={signOut} disabled={busy}>
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </header>
  );
}
