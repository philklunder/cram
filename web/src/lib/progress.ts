// Client-side progress heuristics derived from each card's SM-2 state. These are simple,
// transparent rules (documented inline) — the authoritative scheduler lives in the iOS app;
// the web just visualizes the stored state.

import type { Card } from "@/lib/api/types";

export type TrackStatus = "on-track" | "catch-up" | "no-cards";

export interface SubjectProgress {
  total: number;
  mastered: number; // well-retained
  shaky: number; // lapsed or never reviewed
  learning: number; // in between
  dueNow: number; // due_date already passed
  masteredPct: number; // 0..100
  status: TrackStatus;
}

// Buckets are mutually exclusive, in priority order:
//   mastered = reviewed at least twice AND on a long interval (>= 21 days, "mature")
//   shaky    = has lapsed before, or has never been successfully reviewed
//   learning = everything else (actively being learned)
export function computeProgress(cards: Card[]): SubjectProgress {
  const total = cards.length;
  const now = Date.now();
  let mastered = 0;
  let shaky = 0;
  let dueNow = 0;

  for (const c of cards) {
    if (new Date(c.due_date).getTime() <= now) dueNow++;

    if (c.repetitions >= 2 && c.interval_days >= 21) {
      mastered++;
    } else if (c.lapses > 0 || c.repetitions === 0) {
      shaky++;
    }
  }

  const learning = Math.max(0, total - mastered - shaky);
  const masteredPct = total === 0 ? 0 : Math.round((mastered / total) * 100);
  const status: TrackStatus = total === 0 ? "no-cards" : dueNow === 0 ? "on-track" : "catch-up";

  return { total, mastered, shaky, learning, dueNow, masteredPct, status };
}
