// Port of the bits of ios/Cram/Models/Enums.swift (GradingScale.strength) and Subject.swift
// (currentGrade / gradeStrength) that the scheduler's exam compression needs. Kept here next to
// the scheduler because subject strength is one of the two inputs (with card mastery) to the
// compression fraction — and it has to be derived the same way iOS does it, or web and iOS
// compress the same card differently.

import type { GradeEntry, GradingScale } from "@/lib/api/types";

// Valid numeric range per scale (mirrors GradingScale.range).
const RANGES: Record<GradingScale, readonly [number, number]> = {
  german: [1, 6],
  swiss: [1, 6],
  percentage: [0, 100],
  letter: [0, 4],
  gpa: [0, 4],
};

// Only the German scale is "lower is better" (1.0 best … 6.0 worst).
function lowerIsBetter(scale: GradingScale): boolean {
  return scale === "german";
}

// Normalize a grade to 0…1 where 1 = best. Mirrors GradingScale.strength(for:).
export function gradeStrengthForScore(scale: GradingScale, score: number): number {
  const [lo, hi] = RANGES[scale];
  const clamped = Math.min(Math.max(score, lo), hi);
  const t = (clamped - lo) / (hi - lo);
  return lowerIsBetter(scale) ? 1 - t : t;
}

// The subject's current grade: the manual value if set, else the weighted average of grade
// entries (weight > 0). Returns null when neither is available. Mirrors Subject.currentGrade.
// Note: `manual` is the backend's `current_grade` column (== iOS manualCurrentGrade); 0 is a
// valid manual grade, so the check is `!= null`, not falsy.
export function currentGrade(manual: number | null, entries: GradeEntry[]): number | null {
  if (manual != null) return manual;
  const weighted = entries.filter((e) => e.weight > 0);
  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return null;
  return weighted.reduce((sum, e) => sum + e.score * e.weight, 0) / totalWeight;
}

// 0…1 subject strength from its grade, or null if no grade yet. Mirrors Subject.gradeStrength.
export function subjectStrength(
  scale: GradingScale,
  manual: number | null,
  entries: GradeEntry[],
): number | null {
  const g = currentGrade(manual, entries);
  return g == null ? null : gradeStrengthForScore(scale, g);
}
