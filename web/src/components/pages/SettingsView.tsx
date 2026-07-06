"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

// Account + preferences. Email comes from the server layout (the session), so this stays a thin
// presentational component. Sign-out mirrors the top-bar user menu.
export function SettingsView({ email }: { email: string | null }) {
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
    <section className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="Your account and how Cram looks." />

      <div className="space-y-6">
        <SettingRow title="Account" description="You're signed in to Cram.">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink" title={email ?? undefined}>
                {email ?? "Signed in"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={signOut} loading={busy}>
              <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden />
              Sign out
            </Button>
          </div>
        </SettingRow>

        <SettingRow title="Appearance" description="Switch between light and dark. Your choice is remembered on this device.">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-2 py-1.5">
            <ThemeToggle label />
          </div>
        </SettingRow>

        <SettingRow title="About" description="Cram — your study desk.">
          <p className="text-sm text-muted">
            Web dashboard v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.6"}. Syncs with the Cram iOS app.
          </p>
        </SettingRow>
      </div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {children}
    </Panel>
  );
}
