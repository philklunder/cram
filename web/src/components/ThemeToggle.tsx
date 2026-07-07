"use client";

import { useEffect, useState } from "react";

import { cn } from "@/components/ui";

// Light/dark toggle. The initial class is set pre-paint by the inline script in app/layout.tsx;
// this component just reads the resolved state on mount and lets the user flip + persist it.
// Persisting to localStorage("cram-theme") is what the no-flash script reads next load.
type Theme = "light" | "dark";

// Single source of truth for reading/writing the theme, shared by the toggle and the Settings
// segmented control so the two can never drift.
function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
function applyTheme(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem("cram-theme", next);
  } catch {
    /* private mode / storage disabled — the change still applies for this session. */
  }
}

// `label` renders a subtle text button ("Dark mode" / "Light mode" + icon) for placements like the
// login top bar; the default is the compact icon-only button used in the app nav.
export function ThemeToggle({ label = false }: { label?: boolean }) {
  // Undefined until mounted so the button doesn't render a wrong icon during SSR/first paint.
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const isDark = theme === "dark";

  // Sun when dark (tap → light), moon when light (tap → dark). Before mount `theme` is undefined:
  // render the moon so the SSR/first-client markup is identical (no hydration mismatch), then the
  // effect corrects it. In icon-only mode the box keeps its size so layout never shifts.
  const icon =
    theme === undefined ? (
      label ? <MoonIcon /> : <span className="h-[18px] w-[18px]" aria-hidden />
    ) : isDark ? (
      <SunIcon />
    ) : (
      <MoonIcon />
    );

  // Before mount, assume light ("Dark mode" is the CTA) so server and client agree.
  const text = isDark ? "Light mode" : "Dark mode";

  if (label) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition duration-200 ease-out hover:bg-brand-50/60 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[0.97] dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
      >
        {icon}
        <span>{text}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition duration-200 ease-out hover:bg-brand-50/60 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.95] dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
    >
      {theme === undefined ? null : isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

// An explicit Light / Dark segmented control for the Settings surface. Each option is a radio-style
// button showing a small preview swatch; the current theme carries a brand-tinted selected state.
// Reads the resolved theme on mount (undefined before → nothing selected, avoids a hydration flip).
export function ThemeChoice() {
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <SunIcon /> },
    { value: "dark", label: "Dark", icon: <MoonIcon /> },
  ];

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2 sm:w-72">
      {options.map((o) => {
        const selected = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(o.value)}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              selected
                ? "border-brand-300 bg-brand-50/60 text-brand-700 ring-1 ring-inset ring-brand-600/10 dark:border-brand-500/40 dark:bg-brand-500/12 dark:text-brand-200 dark:ring-brand-400/20"
                : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2/60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex h-8 w-8 flex-none items-center justify-center rounded-lg",
                o.value === "light" ? "bg-amber-100 text-amber-600" : "bg-slate-800 text-slate-100",
              )}
            >
              {o.icon}
            </span>
            <span>{o.label}</span>
            <span
              aria-hidden
              className={cn(
                "ml-auto flex h-4 w-4 flex-none items-center justify-center rounded-full border transition-colors",
                selected ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong text-transparent",
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-2.5 w-2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}
