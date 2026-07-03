"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. The initial class is set pre-paint by the inline script in app/layout.tsx;
// this component just reads the resolved state on mount and lets the user flip + persist it.
// Persisting to localStorage("cram-theme") is what the no-flash script reads next load.
type Theme = "light" | "dark";

export function ThemeToggle() {
  // Undefined until mounted so the button doesn't render a wrong icon during SSR/first paint.
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("cram-theme", next);
    } catch {
      /* private mode / storage disabled — the toggle still works for this session. */
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition duration-200 ease-out hover:bg-brand-50/60 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.95] dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
    >
      {/* Crossfade sun/moon. Before mount `theme` is undefined → render nothing to avoid a flash of
          the wrong icon; the box keeps its size so layout doesn't shift. */}
      {theme === undefined ? null : isDark ? (
        // Sun (tap to go light)
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
        </svg>
      ) : (
        // Moon (tap to go dark)
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
          <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
    </button>
  );
}
