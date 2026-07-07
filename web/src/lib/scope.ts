// Subject + exam scoping shared by the Quizzes and Flashcards hubs (and the AI Decks exam picker).
// A "scope" is which slice of a subject you're working with:
//   ""          → the whole subject (every exam + General)
//   GENERAL     → only cards/quizzes not tied to an exam
//   <exam id>   → only that exam's cards/quizzes
// One source of truth so both hubs filter identically and the exam dropdowns match.

import type { Exam } from "@/lib/api/types";

export const WHOLE_SUBJECT = "";
export const GENERAL_SCOPE = "__general__";

// A subject's exams, soonest-dated first, undated last, then by title — matching the subject page.
export function examsForSubject(exams: Exam[], subjectId: string | null): Exam[] {
  if (!subjectId) return [];
  return exams
    .filter((e) => e.subject_id === subjectId)
    .sort((a, b) => {
      const da = a.exam_date ? new Date(a.exam_date).getTime() : null;
      const db = b.exam_date ? new Date(b.exam_date).getTime() : null;
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }
      return a.title.localeCompare(b.title);
    });
}

// True when a row with `examId` (its exam, or null when unassigned) belongs in `scope`.
export function inExamScope(examId: string | null, scope: string): boolean {
  if (scope === WHOLE_SUBJECT) return true;
  if (scope === GENERAL_SCOPE) return examId === null;
  return examId === scope;
}

// Human label for a chosen scope, used in session titles ("ABU · Midterm").
export function scopeLabel(exams: Exam[], scope: string): string | null {
  if (scope === WHOLE_SUBJECT) return null;
  if (scope === GENERAL_SCOPE) return "General";
  return exams.find((e) => e.id === scope)?.title ?? null;
}
