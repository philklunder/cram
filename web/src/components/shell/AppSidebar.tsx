"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import { BrandMark, cn } from "@/components/ui";
import { SidebarStreak } from "@/components/dashboard/StreakCard";
import { loadLibrary } from "@/lib/api/client";
import { computeDue } from "@/lib/dashboard";
import { useAsync } from "@/lib/useAsync";
import { GROUP_LABEL, NAV_GROUPS, NAV_LEAD, NAV_TAIL, isActivePath, navItemsIn, type NavItem } from "./nav-items";

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
    <div className="flex h-full flex-col px-3 py-4">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="group mb-4 flex items-center gap-2.5 rounded-lg px-2.5 py-1 transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <span className="transition-transform duration-300 ease-out group-hover:rotate-[-6deg] group-hover:scale-105">
          <BrandMark size={30} />
        </span>
        <span className="text-lg font-bold tracking-tight text-ink">Cram</span>
      </Link>

      <nav className="flex flex-col gap-4" aria-label="Primary">
        <div className="flex flex-col gap-0.5">
          {NAV_LEAD.map((item) => (
            <NavLink key={item.href} item={item} current={current} onNavigate={onNavigate} />
          ))}
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-0.5">
            <h2 className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
              {GROUP_LABEL[group]}
            </h2>
            {navItemsIn(group).map((item) => (
              <NavLink key={item.href} item={item} current={current} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-4">
        <div className="flex flex-col gap-0.5">
          {NAV_TAIL.map((item) => (
            <NavLink key={item.href} item={item} current={current} onNavigate={onNavigate} />
          ))}
        </div>

        <SidebarStreak />

        {/* Compact upsell — a single row so the whole rail fits on a 768px laptop without scrolling.
            The two-line pitch it used to carry pushed the card past the viewport edge. */}
        <Link
          href="/premium"
          onClick={onNavigate}
          className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 shadow-card transition duration-200 ease-out hover:border-brand-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:border-brand-500/40"
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-brand-sm">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">Go Premium</span>
            <span className="block truncate text-xs text-muted">AI explanations &amp; more</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function NavLink({
  item,
  current,
  onNavigate,
}: {
  item: NavItem;
  current: string;
  onNavigate?: () => void;
}) {
  const active = isActivePath(current, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
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
      {item.badge === "due" ? <DueBadge /> : null}
    </Link>
  );
}

// "Is there work waiting?" answered from any page. Reads the shared library snapshot (deduped with
// whatever the page itself is loading) and renders nothing at all when nothing is due — an empty
// account should never see a zero.
function DueBadge() {
  const { data } = useAsync(() => loadLibrary(), []);
  const due = data ? computeDue(data.cards).due : 0;
  if (due === 0) return null;
  return (
    <span
      className="ml-auto min-w-[20px] rounded-full bg-red-500 px-1.5 text-center text-[11px] font-bold leading-[18px] tabular-nums text-white"
      aria-label={`${due} card${due === 1 ? "" : "s"} due`}
    >
      {due > 99 ? "99+" : due}
    </span>
  );
}
