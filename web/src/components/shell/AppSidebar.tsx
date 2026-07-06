"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import { BrandMark, cn } from "@/components/ui";
import { SidebarStreak } from "@/components/dashboard/StreakCard";
import { NAV_ITEMS, isActivePath } from "./nav-items";

// The persistent left navigation. Rendered both in the fixed desktop rail and inside the mobile
// drawer (which passes `onNavigate` to close itself on selection). Sits directly on the canvas;
// elevation is carried by the rail border, not a second fill.
// `activeHref` is a dev-only override used by the /preview harness (which has no matching route) to
// force an item active for screenshots; in the real app it's unset and the pathname decides.
export function AppSidebar({
  onNavigate,
  activeHref,
}: {
  onNavigate?: () => void;
  activeHref?: string;
}) {
  const pathname = usePathname();
  const current = activeHref ?? pathname;

  return (
    <div className="flex h-full flex-col gap-1 px-3 py-5">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="group mb-5 flex items-center gap-2.5 rounded-lg px-2.5 py-1 transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <span className="transition-transform duration-300 ease-out group-hover:rotate-[-6deg] group-hover:scale-105">
          <BrandMark size={30} />
        </span>
        <span className="text-lg font-bold tracking-tight text-ink">Cram</span>
      </Link>

      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(current, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                active
                  ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/20"
                  : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink dark:hover:bg-white/5",
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] flex-none transition-colors",
                  active ? "text-brand-600 dark:text-brand-300" : "text-muted group-hover:text-ink-2",
                )}
                strokeWidth={2}
                aria-hidden
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-4">
        <SidebarStreak />
        <Link
          href="/premium"
          onClick={onNavigate}
          className="group block rounded-xl border border-line bg-surface p-3.5 shadow-card transition duration-200 ease-out hover:border-brand-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:border-brand-500/40"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-brand-sm">
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-sm font-semibold text-ink">Go Premium</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Unlock AI explanations, advanced stats &amp; more.
          </p>
        </Link>
      </div>
    </div>
  );
}
