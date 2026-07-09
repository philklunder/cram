import { describe, expect, it } from "vitest";

import type { Attempt, Card, Question, Quiz } from "@/lib/api/types";
import { computeReadiness, examReadiness, overallReadiness } from "./readiness";

const NOW = Date.parse("2026-07-09T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function card(over: Partial<Card> & { id: string; topic: string }): Card {
  return {
    subject_id: "s1",
    exam_id: null,
    source_id: null,
    front: "f",
    back: "b",
    difficulty: 3,
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    due_date: iso(NOW),
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    ...over,
  } as Card;
}

const mastered = (id: string, topic: string) => card({ id, topic, repetitions: 4, interval_days: 30 });
const learning = (id: string, topic: string) => card({ id, topic, repetitions: 1, interval_days: 6 });
const fresh = (id: string, topic: string) => card({ id, topic, repetitions: 0 });

function quiz(id: string, over: Partial<Quiz> = {}): Quiz {
  return { id, subject_id: "s1", exam_id: null, title: "q", created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null, ...over } as Quiz;
}
function question(id: string, topic: string, quizId = "qz1"): Question {
  return { id, quiz_id: quizId, topic, prompt: "p", kind: "multipleChoice", options: [], answer_key: "a", created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null } as unknown as Question;
}
function attempt(questionId: string, score: number, at = NOW): Attempt {
  return { id: `a-${questionId}-${at}`, question_id: questionId, response: "r", is_correct: score >= 0.5, score, feedback: "", graded_at: iso(at), created_at: iso(at) };
}

const SCOPE = { subjectId: "s1" };

describe("computeReadiness", () => {
  it("reports 'untested' when nothing has ever been reviewed or answered", () => {
    const r = computeReadiness(SCOPE, { cards: [fresh("c1", "T1")], questions: [], quizzes: [], attempts: [] });
    expect(r.verdict).toBe("untested");
    expect(r.coverage).toBe(0);
    expect(r.quizAccuracy).toBeNull();
  });

  // The whole point of the model: cramming writes nothing, so readiness must not move.
  it("ignores cards that have never survived a review", () => {
    const before = computeReadiness(SCOPE, { cards: [fresh("c1", "T1"), fresh("c2", "T1")], questions: [], quizzes: [], attempts: [] });
    expect(before.cardMastery).toBe(0);
    expect(before.coverage).toBe(0);
  });

  it("gives a learning card half the credit of a mastered one", () => {
    const all = computeReadiness(SCOPE, { cards: [mastered("c1", "T1"), learning("c2", "T1")], questions: [], quizzes: [], attempts: [] });
    expect(all.cardMastery).toBe(75); // (1 + 0.5) / 2
  });

  it("scores quiz accuracy from attempts on in-scope questions only", () => {
    const qs = [question("q1", "T1"), question("q2", "T1")];
    const foreign = question("q9", "T9", "qz-other");
    const r = computeReadiness(SCOPE, {
      cards: [mastered("c1", "T1")],
      questions: [...qs, foreign],
      quizzes: [quiz("qz1"), quiz("qz-other", { id: "qz-other", subject_id: "s2" })],
      attempts: [attempt("q1", 1), attempt("q2", 0), attempt("q9", 0)], // q9 belongs to another subject
    });
    expect(r.quizAccuracy).toBe(50);
    expect(r.attemptCount).toBe(2);
  });

  it("counts a topic as covered once its card is reviewed or its question is answered", () => {
    const r = computeReadiness(SCOPE, {
      cards: [mastered("c1", "T1"), fresh("c2", "T2")],
      questions: [question("q3", "T3")],
      quizzes: [quiz("qz1")],
      attempts: [attempt("q3", 1)],
    });
    // T1 reviewed, T3 answered, T2 never touched → 2 of 3.
    expect(r.coverage).toBe(67);
  });

  it("surfaces untested topics as weak, worst first", () => {
    const r = computeReadiness(SCOPE, {
      cards: [mastered("c1", "T1"), fresh("c2", "Untouched")],
      questions: [],
      quizzes: [],
      attempts: [],
    });
    expect(r.weakTopics[0].topic).toBe("Untouched");
    expect(r.weakTopics[0].tested).toBe(false);
  });

  // A subject with only flashcards must not be penalised for having no quiz to answer.
  it("redistributes the quiz weight when there are no attempts", () => {
    const cardsOnly = computeReadiness(SCOPE, { cards: [mastered("c1", "T1")], questions: [], quizzes: [], attempts: [] });
    // mastery 1.0 (weight .5) + coverage 1.0 (weight .2) over weight .7 → 100
    expect(cardsOnly.score).toBe(100);
    expect(cardsOnly.verdict).toBe("ready");
  });

  it("scopes to a single exam when one is given", () => {
    const data = {
      cards: [card({ id: "c1", topic: "T1", exam_id: "e1", repetitions: 4, interval_days: 30 }), fresh("c2", "T2")],
      questions: [],
      quizzes: [],
      attempts: [],
    };
    const exam = computeReadiness({ subjectId: "s1", examId: "e1" }, data);
    expect(exam.cardCount).toBe(1);
    expect(exam.cardMastery).toBe(100);
  });

  // The bug this guards: readiness used to be `mastered / total`, where "mastered" needs
  // repetitions >= 2 AND interval_days >= 21 — so it stayed at 0% for the first several reviews of
  // a card and read as "reviewing does nothing". One review must visibly move the number.
  it("moves after a single review of a previously-fresh card", () => {
    const before = computeReadiness(SCOPE, { cards: [fresh("c1", "T1"), fresh("c2", "T1")], questions: [], quizzes: [], attempts: [] });

    // What one "Good" rating leaves behind: repetitions 1, interval 1 — nowhere near "mastered".
    const afterOneReview = [card({ id: "c1", topic: "T1", repetitions: 1, interval_days: 1 }), fresh("c2", "T1")];
    const after = computeReadiness(SCOPE, { cards: afterOneReview, questions: [], quizzes: [], attempts: [] });

    expect(before.score).toBe(0);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.verdict).not.toBe("untested");
  });

  it("weights overall readiness by material, and ignores untested subjects", () => {
    const big = computeReadiness(SCOPE, { cards: Array.from({ length: 90 }, (_, i) => learning(`b${i}`, "T1")), questions: [], quizzes: [], attempts: [] });
    const small = computeReadiness(SCOPE, { cards: [mastered("s1", "T1")], questions: [], quizzes: [], attempts: [] });
    const untested = computeReadiness(SCOPE, { cards: [fresh("u1", "T9")], questions: [], quizzes: [], attempts: [] });

    const combined = overallReadiness([big, small, untested])!;
    // The 90-card subject dominates; the untested one contributes nothing rather than a 0.
    expect(combined).toBeLessThan(small.score);
    expect(combined).toBeGreaterThanOrEqual(big.score);
    expect(overallReadiness([untested])).toBeNull();
  });

  it("only counts the most recent attempts, so an old bad quiz stops dragging", () => {
    const questions = Array.from({ length: 25 }, (_, i) => question(`q${i}`, "T1"));
    const attempts = [
      ...Array.from({ length: 5 }, (_, i) => attempt(`q${i}`, 0, NOW - (30 - i) * 86_400_000)), // old, wrong
      ...Array.from({ length: 20 }, (_, i) => attempt(`q${i + 5}`, 1, NOW - (20 - i) * 3_600_000)), // recent, right
    ];
    const r = computeReadiness(SCOPE, { cards: [], questions, quizzes: [quiz("qz1")], attempts });
    expect(r.quizAccuracy).toBe(100); // the 5 old zeros fall outside the 20-attempt window
  });
});

describe("examReadiness", () => {
  const mastered1 = card({ id: "c1", topic: "T1", exam_id: "e1", repetitions: 4, interval_days: 30 });
  const generalFresh = card({ id: "c2", topic: "T2", exam_id: null, repetitions: 4, interval_days: 30 });

  it("scores the exam's own material when it has some", () => {
    const { readiness, scope } = examReadiness("s1", "e1", {
      cards: [mastered1, fresh("c3", "T3")],
      questions: [],
      quizzes: [],
      attempts: [],
    });
    expect(scope).toBe("exam");
    expect(readiness.cardCount).toBe(1);
    expect(readiness.cardMastery).toBe(100);
  });

  // Uploading without picking an exam files material under "General" (exam_id null) — the default.
  // Scoring such an exam "untested" would be misleading, so fall back to the subject and say so.
  it("falls back to the whole subject when nothing is filed under the exam", () => {
    const { readiness, scope } = examReadiness("s1", "e-empty", {
      cards: [generalFresh],
      questions: [],
      quizzes: [],
      attempts: [],
    });
    expect(scope).toBe("subject");
    expect(readiness.cardCount).toBe(1);
    expect(readiness.verdict).not.toBe("untested");
  });

  it("treats an exam with only questions as having its own material", () => {
    const { scope, readiness } = examReadiness("s1", "e1", {
      cards: [generalFresh],
      questions: [question("q1", "T1", "qz-e1")],
      quizzes: [quiz("qz-e1", { exam_id: "e1" })],
      attempts: [],
    });
    expect(scope).toBe("exam");
    expect(readiness.questionCount).toBe(1);
    expect(readiness.cardCount).toBe(0);
  });
});
