import { describe, expect, it } from "vitest";

import type { Card } from "@/lib/api/types";
import { buildSessionQueue } from "./queue";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-09T12:00:00.000Z");

function card(id: string, dueOffsetDays: number): Card {
  return {
    id,
    subject_id: "s1",
    exam_id: null,
    source_id: null,
    front: `front ${id}`,
    back: `back ${id}`,
    topic: "topic",
    difficulty: 3,
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    due_date: new Date(NOW + dueOffsetDays * DAY).toISOString(),
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    deleted_at: null,
  } as Card;
}

describe("buildSessionQueue", () => {
  const cards = [card("a", 3), card("b", -5), card("c", 0), card("d", -1)];

  it("orders the most-overdue card first by default", () => {
    expect(buildSessionQueue(cards).map((c) => c.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("caps the session at the limit, keeping the most-overdue cards", () => {
    expect(buildSessionQueue(cards, "due", 2).map((c) => c.id)).toEqual(["b", "d"]);
  });

  it("treats limit 0 as no cap", () => {
    expect(buildSessionQueue(cards, "due", 0)).toHaveLength(4);
  });

  // The hub's filters decide what's in a session; the queue must not silently drop not-yet-due
  // cards, or "Cram 4" would serve 2 when you're studying ahead.
  it("never filters out cards that aren't due yet", () => {
    expect(buildSessionQueue([card("a", 3), card("e", 10)])).toHaveLength(2);
  });

  it("shuffles without losing or duplicating cards, and never mutates the input", () => {
    const input = [...cards];
    const out = buildSessionQueue(input, "shuffle");
    expect(out.map((c) => c.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(input.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
});
