// Exam readiness — "how close am I to done?"
//
// Progress is only ever measured by a Review session. Practising on the Flashcards or Quizzes page
// is activity (it records study time and feeds the streak) but it never moves any of the numbers
// below. The two signals a Review writes are:
//
//   • card SM-2 state    — from rating a flashcard Again/Hard/Good/Easy (PATCH /v1/cards)
//   • quiz attempts      — from answering a quiz question in the test phase (POST /v1/attempts)
//
// A Question has no SM-2 state and no foreign key to a Card — they only share a `topic` string. So
// we deliberately do NOT try to fold a quiz answer into a card's schedule; that would mean guessing
// a join. Instead the two stay separate, honest measurements and are combined here into one score:
//
//   readiness = 0.5 × cardMastery + 0.3 × quizAccuracy + 0.2 × coverage
//
// When a signal is missing (no cards, or nothing has been tested yet) its weight is redistributed
// across the signals that do exist, so a subject with only flashcards still gets a real score
// rather than being silently penalised for having no quiz.

import type { Attempt, Card, Question, Quiz } from "@/lib/api/types";
import { computeProgress } from "@/lib/progress";

// Only the most recent answers count toward accuracy — a quiz you bombed a month ago shouldn't
// hold down a subject you've since learned.
const RECENT_ATTEMPTS = 20;

const WEIGHTS = { mastery: 0.5, accuracy: 0.3, coverage: 0.2 } as const;

export type Verdict = "ready" | "almost" | "keep-going" | "untested";

export interface TopicStat {
  topic: string;
  cardMastery: number | null; // 0..1 over the topic's cards, null when it has none
  accuracy: number | null; // 0..1 over the topic's attempts, null when never tested
  tested: boolean;
}

export interface Readiness {
  score: number; // 0..100
  verdict: Verdict;
  cardMastery: number | null; // 0..100
  quizAccuracy: number | null; // 0..100
  coverage: number; // 0..100
  cardCount: number;
  questionCount: number;
  attemptCount: number;
  weakTopics: TopicStat[]; // worst first — what to generate more material for
}

export interface ReadinessScope {
  subjectId: string;
  examId?: string | null; // null/undefined = the whole subject
}

// A card counts as "seen" once it has survived at least one review. Practising never sets this.
function cardSeen(c: Card): boolean {
  return c.repetitions > 0 || c.lapses > 0;
}

// Partial credit, matching the Flashcards ring: a card being learned is worth half a mastered one.
function masteryFraction(cards: Card[]): number | null {
  if (cards.length === 0) return null;
  const p = computeProgress(cards);
  return (p.mastered + 0.5 * p.learning) / p.total;
}

function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function computeReadiness(
  scope: ReadinessScope,
  data: { cards: Card[]; questions: Question[]; quizzes: Quiz[]; attempts: Attempt[] },
): Readiness {
  const inExam = (examId: string | null) =>
    scope.examId == null ? true : examId === scope.examId;

  const cards = data.cards.filter((c) => c.subject_id === scope.subjectId && inExam(c.exam_id));

  // question → its quiz → subject/exam. A question whose quiz is gone is unattributable; drop it.
  const quizById = new Map(data.quizzes.map((q) => [q.id, q]));
  const questions = data.questions.filter((q) => {
    const quiz = quizById.get(q.quiz_id);
    return quiz != null && quiz.subject_id === scope.subjectId && inExam(quiz.exam_id);
  });

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const attempts = data.attempts
    .filter((a) => questionById.has(a.question_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const recent = attempts.slice(-RECENT_ATTEMPTS);

  const cardMastery = masteryFraction(cards);
  const quizAccuracy = mean(recent.map((a) => a.score));

  // Coverage: of every topic in this scope, how many have actually been tested — either a card of
  // that topic has been reviewed, or a question of that topic has been answered in a Review.
  const topics = new Map<string, TopicStat>();
  const ensure = (topic: string): TopicStat => {
    let t = topics.get(topic);
    if (!t) {
      t = { topic, cardMastery: null, accuracy: null, tested: false };
      topics.set(topic, t);
    }
    return t;
  };
  for (const c of cards) {
    const t = ensure(c.topic);
    if (cardSeen(c)) t.tested = true;
  }
  for (const q of questions) ensure(q.topic);
  for (const a of attempts) {
    const q = questionById.get(a.question_id)!;
    ensure(q.topic).tested = true;
  }
  // Per-topic detail, for "which topics still need work".
  for (const [topic, stat] of topics) {
    stat.cardMastery = masteryFraction(cards.filter((c) => c.topic === topic));
    stat.accuracy = mean(attempts.filter((a) => questionById.get(a.question_id)!.topic === topic).map((a) => a.score));
  }

  const topicList = [...topics.values()];
  const coverage = topicList.length === 0 ? 0 : topicList.filter((t) => t.tested).length / topicList.length;

  // Weighted mean over the signals that exist. Coverage always exists (it's 0 when nothing's tested).
  const parts: Array<[number, number]> = [[coverage, WEIGHTS.coverage]];
  if (cardMastery != null) parts.push([cardMastery, WEIGHTS.mastery]);
  if (quizAccuracy != null) parts.push([quizAccuracy, WEIGHTS.accuracy]);
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  const score = Math.round((parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight) * 100);

  const nothingTested = coverage === 0 && attempts.length === 0;
  const verdict: Verdict = nothingTested ? "untested" : score >= 80 ? "ready" : score >= 60 ? "almost" : "keep-going";

  // Worst first. A topic is weak if its cards are shaky or its answers are wrong; untested topics
  // rank as weak too, because an untested topic is an unknown, not a pass.
  const weakness = (t: TopicStat) => {
    if (!t.tested) return -1; // unknown → surface first
    return Math.min(t.cardMastery ?? 1, t.accuracy ?? 1);
  };
  const weakTopics = topicList
    .filter((t) => !t.tested || weakness(t) < 0.6)
    .sort((a, b) => weakness(a) - weakness(b))
    .slice(0, 5);

  return {
    score,
    verdict,
    cardMastery: cardMastery == null ? null : Math.round(cardMastery * 100),
    quizAccuracy: quizAccuracy == null ? null : Math.round(quizAccuracy * 100),
    coverage: Math.round(coverage * 100),
    cardCount: cards.length,
    questionCount: questions.length,
    attemptCount: attempts.length,
    weakTopics,
  };
}

// Readiness for one exam, with an honest fallback.
//
// Material is filed under an exam only if you chose one when generating it — the AI Decks upload
// defaults to "General" (`exam_id: null`). So an exam often has no cards or questions of its own
// even though its subject has plenty. Scoring that exam "untested" would be misleading, so we fall
// back to the whole subject and tell the caller which scope the number actually describes.
export interface ScopedReadiness {
  readiness: Readiness;
  scope: "exam" | "subject";
}

export function examReadiness(
  subjectId: string,
  examId: string,
  data: { cards: Card[]; questions: Question[]; quizzes: Quiz[]; attempts: Attempt[] },
): ScopedReadiness {
  const own = computeReadiness({ subjectId, examId }, data);
  if (own.cardCount + own.questionCount > 0) return { readiness: own, scope: "exam" };
  return { readiness: computeReadiness({ subjectId }, data), scope: "subject" };
}

// Readiness across several subjects, weighted by how much material each has — a 4-card subject at
// 100% shouldn't outweigh a 90-card one at 40%. Subjects you've never been tested on are excluded
// rather than counted as 0: an unknown isn't a failure. Returns null when nothing has been tested.
export function overallReadiness(all: Readiness[]): number | null {
  const tested = all.filter((r) => r.verdict !== "untested");
  if (tested.length === 0) return null;
  const weightOf = (r: Readiness) => Math.max(1, r.cardCount);
  const totalWeight = tested.reduce((n, r) => n + weightOf(r), 0);
  return Math.round(tested.reduce((n, r) => n + r.score * weightOf(r), 0) / totalWeight);
}

// Readiness for every subject, keyed by id — the shape the Dashboard/Progress/Calendar pages want.
export function readinessBySubject(
  subjects: { id: string }[],
  data: { cards: Card[]; questions: Question[]; quizzes: Quiz[]; attempts: Attempt[] },
): Map<string, Readiness> {
  return new Map(subjects.map((s) => [s.id, computeReadiness({ subjectId: s.id }, data)]));
}

export const VERDICT_COPY: Record<Verdict, { label: string; hint: string }> = {
  ready: { label: "Exam ready", hint: "You're on top of this. Keep reviewing to hold it." },
  almost: { label: "Almost there", hint: "A few topics still need a pass." },
  "keep-going": { label: "Keep going", hint: "Review regularly — this isn't solid yet." },
  untested: { label: "Not tested yet", hint: "Run a review to find out where you stand." },
};

// Semantic fill for a readiness bar. Readiness is a *quality* measure, so it takes the
// green/amber/red vocabulary — never the subject's identity accent, which would paint a
// healthy subject red purely because of which colour family its id hashed to.
export const VERDICT_FILL: Record<Verdict, string> = {
  ready: "bg-green-500",
  almost: "bg-amber-500",
  "keep-going": "bg-red-500",
  untested: "bg-line-strong",
};

// Same vocabulary keyed on a raw 0–100 percentage, for bars that have a score but no
// Readiness object (topic mastery, per-exam readiness). Thresholds mirror `verdict`.
export function scoreFill(pct: number): string {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-red-500";
}
