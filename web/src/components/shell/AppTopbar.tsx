"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, Plus } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark, cn } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { clearApiCache } from "@/lib/api/cache";

// Sticky application top bar: mobile nav trigger (+ wordmark, since the sidebar is hidden there),
// the add-material action, theme toggle and the user menu (which owns sign-out). Search and
// notifications were placeholders with nothing behind them; they come back when they do something.
export function AppTopbar({
  email,
  onOpenSidebar,
}: {
  email: string | null;
  onOpenSidebar: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/80 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition duration-200 ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:hidden"
        >
          <BrandMark size={26} />
          <span className="text-base font-bold tracking-tight text-ink">Cram</span>
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <AddMaterialButton />
          <ThemeToggle />
          <UserMenu email={email} />
        </div>
      </div>
    </header>
  );
}

// The primary "get material into Cram" action, promoted out of the old dashboard-only rail card so
// it's reachable from every page. Icon-only under `sm` to save the narrow top bar; full label above.
function AddMaterialButton() {
  return (
    <Link
      href="/upload"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium text-ink-2 shadow-sm transition duration-200 ease-out hover:border-brand-300 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:border-brand-500/40"
      aria-label="Add study material"
    >
      <Plus className="h-4 w-4 flex-none" strokeWidth={2.5} aria-hidden />
      <span className="hidden sm:inline">Add material</span>
    </Link>
  );
}

function UserMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false));

  const initials = (email?.trim()?.[0] ?? "U").toUpperCase();

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Drop every cached row before the next user can sign in on this tab.
    clearApiCache();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 transition duration-200 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:pr-2.5"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-sm font-semibold text-white shadow-brand-sm"
        >
          {initials}
        </span>
        {email ? (
          <span className="hidden max-w-[16ch] truncate text-sm font-medium text-ink-2 sm:block">
            {email}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 flex-none text-muted transition-transform duration-200 sm:block",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-12 z-40 w-56 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-card-hover"
        >
          {email ? (
            <div className="border-b border-line px-3 py-2">
              <p className="truncate text-sm font-medium text-ink" title={email}>
                {email}
              </p>
              <p className="text-xs text-muted">Signed in</p>
            </div>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Close a popover on outside pointer-down or Escape. Shared by the bell and user menu.
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose]);
}
