"use client";

// Coverage level for AI deck generation — how much of the uploaded material Claude turns into
// flashcards + quiz questions. Sent as the optional `density` field on POST /v1/generate; the
// backend maps each value to a fixed prompt instruction (backend/app/prompt.py). "balanced" is the
// server default too, so an unset or stale value never changes what a deck looks like.
//
// The last choice is remembered per device (localStorage + useSyncExternalStore, the same pattern
// as reviewSettings.ts) — it's a working preference, not account data, so it isn't synced.

import { useSyncExternalStore } from "react";

export type GenerationDensity = "essentials" | "balanced" | "comprehensive";

export const DEFAULT_DENSITY: GenerationDensity = "balanced";

export interface DensityOption {
  value: GenerationDensity;
  label: string;
  hint: string;
  level: 1 | 2 | 3; // bars lit in the density glyph
}

// Ordered lightest → heaviest so the picker reads left to right as "more".
export const DENSITY_OPTIONS: readonly DensityOption[] = [
  { value: "essentials", label: "Key concepts", hint: "Only the core ideas you're most likely to be examined on.", level: 1 },
  { value: "balanced", label: "Balanced", hint: "The main ideas plus the detail that supports them.", level: 2 },
  { value: "comprehensive", label: "Everything", hint: "Every definition, fact and example worth testing.", level: 3 },
];

export function densityLabel(value: GenerationDensity): string {
  return DENSITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Anything that isn't a known level (absent, tampered with, or from a future version) falls back
// to the default rather than being sent to the backend, which would reject it with a 422.
export function parseDensity(raw: string | null | undefined): GenerationDensity {
  return DENSITY_OPTIONS.some((o) => o.value === raw) ? (raw as GenerationDensity) : DEFAULT_DENSITY;
}

const KEY = "cram-generation-density";
const EVENT = "cram-generation-density-change";

function read(): GenerationDensity {
  try {
    return parseDensity(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_DENSITY; // private mode / storage disabled
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback); // other tabs
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function setGenerationDensity(next: GenerationDensity): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore — the event below still applies the choice for this session. */
  }
  window.dispatchEvent(new Event(EVENT));
}

// Strings are compared by value, so read() is a stable snapshot without a cache.
export function useGenerationDensity(): GenerationDensity {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_DENSITY);
}
