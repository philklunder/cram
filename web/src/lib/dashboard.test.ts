import { describe, expect, it } from "vitest";

import type { Exam, Subject } from "@/lib/api/types";
import { nearestExam } from "./dashboard";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const now = () => Date.now();

function subject(id: string): Subject {
  return {
    id,
    name: id,
    grading_scale: "swiss",
    target_grade: null,
    current_grade: null,
    created_at: iso(now()),
    updated_at: iso(now()),
    deleted_at: null,
  } as Subject;
}

function exam(id: string, subjectId: string, inDays: number | null): Exam {
  return {
    id,
    subject_id: subjectId,
    title: id,
    exam_date: inDays === null ? null : iso(now() + inDays * DAY),
    created_at: iso(now()),
    updated_at: iso(now()),
    deleted_at: null,
  } as Exam;
}

const SUBJECTS = [subject("a"), subject("b")];

describe("nearestExam", () => {
  it("returns the soonest upcoming exam, with the exam row itself", () => {
    const exams = [exam("far", "a", 20), exam("soon", "b", 3), exam("mid", "a", 9)];
    const best = nearestExam(SUBJECTS, exams)!;
    expect(best.exam.id).toBe("soon");
    expect(best.subject.id).toBe("b");
    expect(best.days).toBe(3);
  });

  // Callers scope readiness to `exam.id`, so picking the subject's soonest exam (not just any of
  // its exams) matters.
  it("picks a subject's soonest exam, not its first", () => {
    const exams = [exam("later", "a", 12), exam("earlier", "a", 4)];
    expect(nearestExam(SUBJECTS, exams)!.exam.id).toBe("earlier");
  });

  it("ignores past and undated exams", () => {
    const exams = [exam("past", "a", -5), exam("undated", "a", null), exam("future", "b", 6)];
    expect(nearestExam(SUBJECTS, exams)!.exam.id).toBe("future");
  });

  it("returns null when no exam is upcoming", () => {
    expect(nearestExam(SUBJECTS, [exam("past", "a", -1), exam("undated", "b", null)])).toBeNull();
  });

  it("breaks a tie by subject order, matching the previous behaviour", () => {
    const exams = [exam("b-exam", "b", 5), exam("a-exam", "a", 5)];
    expect(nearestExam(SUBJECTS, exams)!.subject.id).toBe("a");
  });
});
