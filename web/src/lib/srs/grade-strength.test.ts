import { describe, expect, it } from "vitest";

import type { GradeEntry } from "@/lib/api/types";

import { currentGrade, gradeStrengthForScore, subjectStrength } from "./grade-strength";

// Vectors derived from ios/Cram/Models/Enums.swift (GradingScale.strength) and Subject.swift.

function entry(score: number, weight: number): GradeEntry {
  return {
    id: crypto.randomUUID(),
    created_at: "",
    updated_at: "",
    deleted_at: null,
    subject_id: "s",
    title: "t",
    kind: "exam",
    score,
    weight,
    date: "",
  };
}

describe("gradeStrengthForScore", () => {
  it("german is lower-is-better: 1.0 → 1 (strong), 6.0 → 0, 4.0 → 0.4", () => {
    expect(gradeStrengthForScore("german", 1.0)).toBeCloseTo(1, 10);
    expect(gradeStrengthForScore("german", 6.0)).toBeCloseTo(0, 10);
    expect(gradeStrengthForScore("german", 4.0)).toBeCloseTo(0.4, 10);
  });
  it("swiss is higher-is-better: 6.0 → 1", () => {
    expect(gradeStrengthForScore("swiss", 6.0)).toBeCloseTo(1, 10);
  });
  it("percentage 50 → 0.5; gpa 4.0 → 1; letter 2.0 → 0.5", () => {
    expect(gradeStrengthForScore("percentage", 50)).toBeCloseTo(0.5, 10);
    expect(gradeStrengthForScore("gpa", 4.0)).toBeCloseTo(1, 10);
    expect(gradeStrengthForScore("letter", 2.0)).toBeCloseTo(0.5, 10);
  });
  it("clamps out-of-range scores", () => {
    expect(gradeStrengthForScore("german", 0.5)).toBeCloseTo(1, 10); // below best → best
  });
});

describe("currentGrade", () => {
  it("uses the manual grade when set (including 0)", () => {
    expect(currentGrade(3.0, [])).toBe(3.0);
    expect(currentGrade(0, [entry(5, 1)])).toBe(0);
  });
  it("returns null when no manual grade and no entries", () => {
    expect(currentGrade(null, [])).toBeNull();
  });
  it("weighted-averages entries when manual is null", () => {
    expect(currentGrade(null, [entry(2, 1), entry(4, 1)])).toBeCloseTo(3, 10);
    expect(currentGrade(null, [entry(2, 1), entry(5, 3)])).toBeCloseTo(4.25, 10);
  });
  it("ignores zero-weight entries; null if all are zero-weight", () => {
    expect(currentGrade(null, [entry(1, 0)])).toBeNull();
  });
});

describe("subjectStrength", () => {
  it("null when no grade", () => {
    expect(subjectStrength("german", null, [])).toBeNull();
  });
  it("derives from the weighted average when manual is null", () => {
    // avg = 3.0 on the german scale → strength 0.6
    expect(subjectStrength("german", null, [entry(2, 1), entry(4, 1)])).toBeCloseTo(0.6, 10);
  });
});
