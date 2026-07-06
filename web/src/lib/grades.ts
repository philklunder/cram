// Display + classification helpers for grades — a TypeScript port of the iOS GradeFormat.swift
// and the GradingScale label / range / pass-mark logic in ios/Cram/Models/Enums.swift. Kept in
// sync so web and iOS read a grade identically. The numeric strength/current-grade derivation
// lives next to the scheduler in lib/srs/grade-strength.ts (it feeds SM-2 exam compression);
// `currentGrade` is re-exported here so the Grades UI has one import.

import type { GradeKind, GradingScale } from "@/lib/api/types";
import { currentGrade, gradeStrengthForScore } from "@/lib/srs/grade-strength";

export { currentGrade };

// Normalize any scale's score to a 0–100 "performance" percent (100 = best), so grades on
// different scales (Swiss 1–6, percentage, letter…) can be averaged and compared on one axis —
// the way the cross-subject Grades and Progress pages show them.
export function gradePercent(scale: GradingScale, score: number): number {
  return Math.round(gradeStrengthForScore(scale, score) * 100);
}

// Valid numeric range per scale (mirrors GradingScale.range).
const RANGES: Record<GradingScale, readonly [number, number]> = {
  german: [1, 6],
  swiss: [1, 6],
  percentage: [0, 100],
  letter: [0, 4],
  gpa: [0, 4],
};

// The minimum score that counts as a pass (mirrors GradingScale.passMark).
const PASS_MARK: Record<GradingScale, number> = {
  german: 4,
  swiss: 4,
  percentage: 50,
  letter: 1,
  gpa: 1,
};

// Only the German scale is "lower is better" (1.0 best … 6.0 worst).
function lowerIsBetter(scale: GradingScale): boolean {
  return scale === "german";
}

export function scaleRange(scale: GradingScale): readonly [number, number] {
  return RANGES[scale];
}

export const gradingScaleLabel: Record<GradingScale, string> = {
  german: "German (1.0–6.0)",
  swiss: "Swiss (6.0–1.0)",
  percentage: "Percentage",
  letter: "Letter (A–F)",
  gpa: "GPA (0–4)",
};

export const gradeKindLabel: Record<GradeKind, string> = {
  exam: "Exam",
  test: "Test",
  assignment: "Assignment",
  overall: "Overall",
};

// Display order for the kind picker (mirrors GradeKind.allCases).
export const gradeKinds: readonly GradeKind[] = ["exam", "test", "assignment", "overall"];

// Maps a 0–4 GPA-like value to a letter grade (mirrors GradeFormat.letter(for:)).
function letterFor(value: number): string {
  if (value >= 3.7) return "A";
  if (value >= 3.0) return "B";
  if (value >= 2.0) return "C";
  if (value >= 1.0) return "D";
  return "F";
}

// Format a numeric grade for display according to its scale (mirrors GradeFormat.string).
export function formatGrade(scale: GradingScale, value: number): string {
  switch (scale) {
    case "german":
    case "swiss":
    case "gpa":
      return value.toFixed(1);
    case "percentage":
      return `${Math.round(value)}%`;
    case "letter":
      return letterFor(value);
  }
}

// Whether a score is a passing grade on this scale (mirrors GradingScale.isPassing).
export function isPassing(scale: GradingScale, score: number): boolean {
  return lowerIsBetter(scale) ? score <= PASS_MARK[scale] : score >= PASS_MARK[scale];
}

// --- Display-scale conversion ------------------------------------------------------------
// The app normalizes every subject's grade to a 0–100 "performance" percent (see gradePercent)
// so grades on different per-subject scales can be averaged. The Settings "Grading scale" picker
// then chooses how those aggregate numbers are *shown*: "percentage" keeps the raw %, any other
// scale converts the % back to a grade on that scale. This is the inverse of gradeStrengthForScore.

// Turn a 0–100 performance percent back into a score on `scale` (100 = best performance).
export function gradeFromPercent(scale: GradingScale, pct: number): number {
  const [lo, hi] = scaleRange(scale);
  const t = Math.min(1, Math.max(0, pct / 100)); // performance fraction, 1 = best
  return lowerIsBetter(scale) ? hi - t * (hi - lo) : lo + t * (hi - lo);
}

// Format a 0–100 performance percent for display under the chosen display scale. For "percentage"
// this is just "NN%"; every other scale converts to a grade and formats it (e.g. 88 → "5.4" Swiss).
export function formatPercentInScale(scale: GradingScale, pct: number): string {
  return scale === "percentage" ? `${Math.round(pct)}%` : formatGrade(scale, gradeFromPercent(scale, pct));
}

// Format a *change* in performance percent (e.g. a 7-day trend delta) under the display scale, with
// a leading sign. Percentage stays in points ("+5%"); other scales express the change in grade
// points, sign-flipped for lower-is-better scales so "better" always reads as positive.
export function formatPercentDeltaInScale(scale: GradingScale, pctDelta: number): string {
  if (scale === "percentage") {
    const r = Math.round(pctDelta);
    return `${r >= 0 ? "+" : "−"}${Math.abs(r)}%`;
  }
  const [lo, hi] = scaleRange(scale);
  const gradeDelta = (pctDelta / 100) * (hi - lo) * (lowerIsBetter(scale) ? -1 : 1);
  const abs = Math.abs(gradeDelta);
  const digits = scale === "letter" ? 2 : 1;
  return `${gradeDelta >= 0 ? "+" : "−"}${abs.toFixed(digits)}`;
}

// Whether "better" means a higher displayed number on this scale — used to colour trend deltas.
export function higherIsBetter(scale: GradingScale): boolean {
  return !lowerIsBetter(scale);
}

// Labels for the Settings display-scale picker. "percentage" is the app default (raw %).
export const displayScaleLabel: Record<GradingScale, string> = {
  percentage: "Percentage (%)",
  swiss: "Swiss (6.0–1.0)",
  german: "German (1.0–6.0)",
  letter: "Letter (A–F)",
  gpa: "GPA (0–4)",
};
