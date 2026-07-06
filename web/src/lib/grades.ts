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
