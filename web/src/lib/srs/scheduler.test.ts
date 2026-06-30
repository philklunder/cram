import { describe, expect, it } from "vitest";

import {
  addDays,
  applyReview,
  effectiveIntervalDays,
  mastery,
  updateSM2,
  wholeDaysBetween,
  type SM2State,
} from "./scheduler";

// Parity vectors derived by hand from ios/Cram/Study/Scheduler.swift + Card.mastery. If the Swift
// scheduler changes, these must change with it — a failure here means web and iOS would diverge.

const FRESH: SM2State = { ease_factor: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };

describe("updateSM2 — SM-2 state transition", () => {
  it("first 'good' (q4): interval 1, reps 1, ease unchanged (2.5)", () => {
    const s = updateSM2(FRESH, 4);
    expect(s.interval_days).toBe(1);
    expect(s.repetitions).toBe(1);
    expect(s.lapses).toBe(0);
    expect(s.ease_factor).toBeCloseTo(2.5, 10);
  });

  it("first 'easy' (q5): ease rises to 2.6", () => {
    expect(updateSM2(FRESH, 5).ease_factor).toBeCloseTo(2.6, 10);
  });

  it("first 'hard' (q3): ease falls to 2.36", () => {
    expect(updateSM2(FRESH, 3).ease_factor).toBeCloseTo(2.36, 10);
  });

  it("'again' (q1): reset reps, interval 1, lapse +1, ease 1.96", () => {
    const s = updateSM2(FRESH, 1);
    expect(s.interval_days).toBe(1);
    expect(s.repetitions).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.ease_factor).toBeCloseTo(1.96, 10);
  });

  it("second 'good': reps 1 → interval 6, reps 2", () => {
    const s = updateSM2({ ease_factor: 2.5, interval_days: 1, repetitions: 1, lapses: 0 }, 4);
    expect(s.interval_days).toBe(6);
    expect(s.repetitions).toBe(2);
  });

  it("third 'good': interval = round(6 * 2.5) = 15, reps 3", () => {
    const s = updateSM2({ ease_factor: 2.5, interval_days: 6, repetitions: 2, lapses: 0 }, 4);
    expect(s.interval_days).toBe(15);
    expect(s.repetitions).toBe(3);
  });

  it("'easy' on a mature card: interval = round(15 * 2.36) = 35, ease 2.46", () => {
    const s = updateSM2({ ease_factor: 2.36, interval_days: 15, repetitions: 3, lapses: 0 }, 5);
    expect(s.interval_days).toBe(35);
    expect(s.repetitions).toBe(4);
    expect(s.ease_factor).toBeCloseTo(2.46, 10);
  });

  it("ease is clamped to the 1.3 floor", () => {
    const s = updateSM2({ ease_factor: 1.42, interval_days: 6, repetitions: 3, lapses: 2 }, 1);
    expect(s.ease_factor).toBe(1.3); // 1.42 - 0.54 = 0.88 → clamped
    expect(s.lapses).toBe(3);
  });
});

describe("mastery — Card.mastery", () => {
  it("default ease, 0 reps → 0.5", () => {
    expect(mastery({ ease_factor: 2.5, interval_days: 0, repetitions: 0, lapses: 0 })).toBeCloseTo(0.5, 10);
  });
  it("floor ease, 0 reps → 0", () => {
    expect(mastery({ ease_factor: 1.3, interval_days: 0, repetitions: 0, lapses: 0 })).toBeCloseTo(0, 10);
  });
  it("default ease, 5 reps → 1.0", () => {
    expect(mastery({ ease_factor: 2.5, interval_days: 0, repetitions: 5, lapses: 0 })).toBeCloseTo(1, 10);
  });
  it("mid ease (1.9), 2 reps → 0.45", () => {
    expect(mastery({ ease_factor: 1.9, interval_days: 0, repetitions: 2, lapses: 0 })).toBeCloseTo(0.45, 10);
  });
  it("ease above default and reps above 5 clamp to 1.0", () => {
    expect(mastery({ ease_factor: 3.0, interval_days: 0, repetitions: 10, lapses: 0 })).toBeCloseTo(1, 10);
  });
});

describe("effectiveIntervalDays — exam compression", () => {
  it("no exam → plain interval", () => {
    expect(effectiveIntervalDays(15, 0.5, null, null)).toBe(15);
  });
  it("mastery 0.5, no subject strength, 10 days to exam → 3", () => {
    // fraction = 0.15 + 0.35*0.5 = 0.325; round(10*0.325)=3; min(15,3)=3
    expect(effectiveIntervalDays(15, 0.5, null, 10)).toBe(3);
  });
  it("strong card + strong subject, 2 days → 1", () => {
    // strength = 0.5*1 + 0.5*1 = 1; fraction 0.5; round(2*0.5)=1
    expect(effectiveIntervalDays(1, 1, 1, 2)).toBe(1);
  });
  it("weak card, far exam → capped at the weak fraction", () => {
    // fraction 0.15; round(100*0.15)=15; min(30,15)=15
    expect(effectiveIntervalDays(30, 0, null, 100)).toBe(15);
  });
  it("short interval wins over a larger capped interval", () => {
    // strength 0.5; fraction 0.325; round(100*0.325)=33; min(5,33)=5
    expect(effectiveIntervalDays(5, 1, 0, 100)).toBe(5);
  });
  it("days-to-exam and capped interval both floor to >= 1", () => {
    expect(effectiveIntervalDays(10, 0, null, 0)).toBe(1);
  });
});

describe("date helpers", () => {
  it("addDays preserves wall-clock and adds calendar days", () => {
    const start = new Date("2025-01-01T12:00:00.000Z");
    expect(wholeDaysBetween(start, addDays(start, 5))).toBe(5);
  });
  it("wholeDaysBetween counts complete days only", () => {
    const a = new Date("2025-01-01T18:00:00.000Z");
    const b = new Date("2025-01-03T09:00:00.000Z"); // 1 day + 15h
    expect(wholeDaysBetween(a, b)).toBe(1);
  });
});

describe("applyReview — SM-2 + due date composition", () => {
  const now = new Date("2025-01-01T12:00:00.000Z");
  const dayDelta = (iso: string) => Math.round((Date.parse(iso) - now.getTime()) / 86_400_000);

  it("no exam: due = now + plain interval (1 day after a first 'good')", () => {
    const out = applyReview(FRESH, 4, null, null, now);
    expect(out.interval_days).toBe(1);
    expect(out.repetitions).toBe(1);
    expect(dayDelta(out.due_date)).toBe(1);
  });

  it("with exam: due is compressed toward the exam", () => {
    // next state after q4 on {2.5,6,2}: interval 15, reps 3 → mastery 0.8; subjStr null →
    // strength 0.8; fraction 0.15+0.35*0.8 = 0.43; 10 days → round(4.3)=4; min(15,4)=4
    const exam = addDays(now, 10);
    const out = applyReview({ ease_factor: 2.5, interval_days: 6, repetitions: 2, lapses: 0 }, 4, exam, null, now);
    expect(out.interval_days).toBe(15); // canonical SM-2 untouched by compression
    expect(dayDelta(out.due_date)).toBe(4); // effective due is compressed
  });

  it("never schedules past the exam", () => {
    const exam = addDays(now, 3);
    const out = applyReview({ ease_factor: 2.5, interval_days: 15, repetitions: 3, lapses: 0 }, 5, exam, 1, now);
    expect(Date.parse(out.due_date)).toBeLessThanOrEqual(exam.getTime());
  });
});
