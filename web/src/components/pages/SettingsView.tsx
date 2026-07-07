"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import { ThemeChoice } from "@/components/ThemeToggle";
import { Button, Panel, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { GradingScale } from "@/lib/api/types";
import { displayScaleLabel } from "@/lib/grades";
import { setDisplayScale, useDisplayScale } from "@/lib/useDisplayScale";

// Account + preferences. Email comes from the server layout (the session), so this stays a thin
// presentational component. Sign-out mirrors the top-bar user menu.
const DISPLAY_SCALES: GradingScale[] = ["percentage", "swiss", "german", "letter", "gpa"];

export function SettingsView({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const displayScale = useDisplayScale();
  const initial = (email?.trim()[0] ?? "?").toUpperCase();

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <section className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Your account and how Cram looks." />

      <div className="space-y-5">
        <Panel className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-base font-bold text-white shadow-brand-sm"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink" title={email ?? undefined}>
              {email ?? "Signed in"}
            </p>
            <p className="mt-0.5 text-xs text-muted">Signed in to Cram · Free plan</p>
          </div>
          <Button variant="secondary" size="sm" onClick={signOut} loading={busy}>
            <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden />
            Sign out
          </Button>
        </Panel>

        <SettingRow title="Appearance" description="Switch between light and dark. Your choice is remembered on this device.">
          <ThemeChoice />
        </SettingRow>

        <SettingRow
          title="Grading scale"
          description="How averages are shown across Grades and Progress. Pick Swiss to see your overall average as a 6.0–1.0 grade instead of a percentage. Exam weights and pass rates stay in %."
        >
          <div className="sm:w-72">
            <label htmlFor="display-scale" className="sr-only">Grading scale</label>
            <select
              id="display-scale"
              value={displayScale}
              onChange={(e) => setDisplayScale(e.target.value as GradingScale)}
              className={inputClass}
            >
              {DISPLAY_SCALES.map((s) => (
                <option key={s} value={s}>{displayScaleLabel[s]}</option>
              ))}
            </select>
          </div>
        </SettingRow>

        <SettingRow title="About" description="Cram — your study desk. Syncs with the Cram iOS app.">
          <p className="text-sm font-medium tabular-nums text-ink-2">
            Web dashboard v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.6"}
          </p>
        </SettingRow>
      </div>
    </section>
  );
}

// A settings row: title + description on the left, the control on the right. Stacks on small
// screens, splits into two columns from `sm` so the surface reads as an intentional settings page
// rather than a narrow stack of near-empty cards.
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
    <Panel className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8">
      <div className="max-w-sm">
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </Panel>
  );
}
