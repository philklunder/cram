"use client";

// The user's chosen *display* grading scale — a device preference (like the theme) that controls
// how the app shows aggregate, cross-subject grade numbers (overall/subject averages, trends).
// "percentage" is the default and keeps the app's normalized-% presentation; any other scale
// converts those numbers to a grade via the helpers in lib/grades.ts. Per-subject scales and the
// raw grade entries are untouched — this only changes presentation of the averaged figures.
//
// Stored in localStorage so it survives reloads and is shared across tabs; reads go through
// useSyncExternalStore so a change on the Settings page updates any mounted grade view live.

import { useSyncExternalStore } from "react";
import type { GradingScale } from "@/lib/api/types";

const KEY = "cram-grade-scale";
const EVENT = "cram-grade-scale-change";

const VALID: GradingScale[] = ["percentage", "swiss", "german", "letter", "gpa"];

function read(): GradingScale {
  if (typeof window === "undefined") return "percentage";
  try {
    const v = localStorage.getItem(KEY);
    if (v && (VALID as string[]).includes(v)) return v as GradingScale;
  } catch {
    /* private mode / storage disabled — fall back to the default. */
  }
  return "percentage";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback); // other tabs
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// Persist the choice and notify listeners in this tab (the "storage" event only fires in others).
export function setDisplayScale(scale: GradingScale): void {
  try {
    localStorage.setItem(KEY, scale);
  } catch {
    /* ignore — the choice still applies for this session via the event below. */
  }
  window.dispatchEvent(new Event(EVENT));
}

// The current display scale. Server render + first client paint return "percentage" (the default),
// then the effect in useSyncExternalStore re-reads the stored value — no hydration mismatch because
// the grade views that consume this render after their client-side data fetch.
export function useDisplayScale(): GradingScale {
  return useSyncExternalStore(subscribe, read, () => "percentage");
}
