"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

// The authenticated app frame: a fixed desktop sidebar rail beside a top bar + scrolling main
// column, with the rail folding into a dismissable drawer under `lg`. The auth gate + SetupNotice
// stay in the server layout; this component owns only the chrome and the drawer state.
export function AppShell({
  email,
  children,
  activeHref,
}: {
  email: string | null;
  children: ReactNode;
  activeHref?: string; // dev-only: forces the active nav item in the /preview harness
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();

  // Close the mobile drawer whenever the route changes (covers link taps and back/forward).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open so the backdrop doesn't scroll the page underneath.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Desktop rail — sticky, full height, scrolls independently if the nav grows. */}
      <aside className="sticky top-0 hidden h-svh shrink-0 overflow-y-auto border-r border-line/70 bg-canvas lg:block">
        <AppSidebar activeHref={activeHref} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink/50 backdrop-blur-sm dark:bg-black/60"
              onClick={() => setDrawerOpen(false)}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden
            />
            <motion.div
              className="absolute inset-y-0 left-0 flex w-[280px] max-w-[82vw] flex-col overflow-y-auto border-r border-line bg-canvas shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={reduce ? false : { x: "-100%" }}
              animate={{ x: 0 }}
              exit={reduce ? undefined : { x: "-100%" }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition duration-200 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
              <AppSidebar onNavigate={() => setDrawerOpen(false)} activeHref={activeHref} />
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Content column. `min-w-0` lets it shrink inside the grid; `overflow-x-clip` on main is a
          safety net so no wide child (tables, charts) can ever scroll the whole page sideways —
          internal `overflow-x-auto` regions still scroll on their own. */}
      <div className="flex min-h-svh min-w-0 flex-col">
        <AppTopbar email={email} onOpenSidebar={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
