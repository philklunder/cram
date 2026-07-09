"use client";

// Review preferences — device-local settings (like the theme / display scale) that control how a
// Review runs, not what's in it. Three knobs, all genuinely wired into the run (see ReviewRun.tsx):
//   • sessionSize   — cap the cards the recall phase serves (0 = no cap, review everything)
//   • order         — "due" walks earliest-due first (default); "shuffle" randomises the queue
//   • questionCount — how many quiz questions the test phase asks (0 = skip the test phase)
//
// Stored in localStorage so it survives reloads and is shared across tabs; reads go through
// useSyncExternalStore so the Review hub reflects a change the moment the settings dialog saves it.

import { useSyncExternalStore } from "react";

export type ReviewOrder = "due" | "shuffle";

export interface ReviewSettings {
  sessionSize: number; // 0 = all due cards
  order: ReviewOrder;
  questionCount: number; // 0 = cards only, no test phase
}

const KEY = "cram-review-settings";
const EVENT = "cram-review-settings-change";

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { sessionSize: 0, order: "due", questionCount: 5 };
// 0 = "All"; kept last so the option row reads 10 · 20 · 50 · All.
export const SESSION_SIZES = [10, 20, 50, 0] as const;
// 0 = "None" — a cards-only Review. Short-answer questions are graded by a paid Claude call, so the
// cap is what keeps a daily review's cost bounded.
export const QUESTION_COUNTS = [0, 3, 5, 10] as const;

// Cache the parsed value keyed on the raw string so getSnapshot returns a STABLE reference until
// the stored value actually changes — required by useSyncExternalStore (a fresh object each read
// would loop). Module-level, shared across all hook consumers.
let cache: ReviewSettings = DEFAULT_REVIEW_SETTINGS;
let cacheRaw: string | null = null;

function parse(raw: string): ReviewSettings {
  try {
    const p = JSON.parse(raw) as Partial<ReviewSettings>;
    return {
      sessionSize: typeof p.sessionSize === "number" && p.sessionSize >= 0 ? p.sessionSize : DEFAULT_REVIEW_SETTINGS.sessionSize,
      order: p.order === "shuffle" ? "shuffle" : "due",
      // Absent in settings saved before the test phase existed — fall back to the default, not 0,
      // or an existing user would silently get a Review with no questions.
      questionCount:
        typeof p.questionCount === "number" && p.questionCount >= 0
          ? p.questionCount
          : DEFAULT_REVIEW_SETTINGS.questionCount,
    };
  } catch {
    return DEFAULT_REVIEW_SETTINGS;
  }
}

function read(): ReviewSettings {
  if (typeof window === "undefined") return DEFAULT_REVIEW_SETTINGS;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache; // private mode / storage disabled — keep whatever we have
  }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = raw ? parse(raw) : DEFAULT_REVIEW_SETTINGS;
  return cache;
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
export function setReviewSettings(next: ReviewSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore — the choice still applies for this session via the event below. */
  }
  window.dispatchEvent(new Event(EVENT));
}

// The current review settings. Server render + first client paint return the defaults, then the
// store re-reads once mounted (the Review hub fetches its data client-side, so no hydration clash).
export function useReviewSettings(): ReviewSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_REVIEW_SETTINGS);
}
