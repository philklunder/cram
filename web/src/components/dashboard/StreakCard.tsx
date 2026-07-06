"use client";

import { Check, Flame } from "lucide-react";

import { cn, Skeleton } from "@/components/ui";
import { listReviewLogs } from "@/lib/api/client";
import { computeStreak, type StreakDay, type StreakStats } from "@/lib/dashboard";
import { useAsync } from "@/lib/useAsync";

// The Mon–Sun dot row: a filled brand dot with a check for each studied day, an outline otherwise,
// today ringed. Shared by the sidebar streak card and the dashboard streak tile.
export function StreakDots({ week }: { week: StreakDay[] }) {
  return (
    <ul className="flex items-center justify-between gap-1" aria-hidden>
      {week.map((d, i) => (
        <li key={d.key} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
              d.active
                ? "bg-brand-500 text-white shadow-brand-sm"
                : "border border-line text-subtle",
              d.isToday && !d.active && "ring-2 ring-brand-400/50",
            )}
          >
            {d.active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
          </span>
          <span className={cn("text-[10px] font-medium", d.isToday ? "text-brand-600 dark:text-brand-300" : "text-subtle")}>
            {/* Two same-letter weekdays (Sat/Sun) would collide as keys visually only; index disambiguates */}
            {d.label}
            <span className="sr-only">{i}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Pure streak card. `subtitle` differs by placement (sidebar vs. would-be others).
export function StreakCard({ streak, subtitle }: { streak: StreakStats; subtitle?: string }) {
  const { current, week, studiedToday } = streak;
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Flame className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {current} day{current === 1 ? "" : "s"} streak
          </p>
          <p className="truncate text-xs text-muted">
            {subtitle ?? (studiedToday ? "Keep it up!" : current > 0 ? "Study today to keep it" : "Start one today")}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <StreakDots week={week} />
      </div>
    </div>
  );
}

// Self-fetching streak card for the sidebar. Fetches review logs and computes the streak on its
// own; renders nothing until there's at least one review so an empty account shows a clean rail.
export function SidebarStreak() {
  const { loading, data } = useAsync(() => listReviewLogs(), []);

  if (loading) {
    return <Skeleton className="h-[104px] w-full rounded-xl" />;
  }
  if (!data || data.length === 0) return null;

  return <StreakCard streak={computeStreak(data)} />;
}
