"use client";

// DEV-ONLY visual preview of the Dashboard home inside the app shell, with mock data so it can be
// screenshotted/iterated without a Supabase login. Gated to non-production. Delete with the rest of
// the preview harness before shipping.
import { notFound } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DashboardData } from "@/lib/api/client";
import type {
  Attempt,
  Card,
  GradeEntry,
  Question,
  Quiz,
  ReviewLog,
  StudySession,
  Subject,
} from "@/lib/api/types";

const NOW = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

function subject(id: string, name: string, examInDays: number | null, scale: Subject["grading_scale"], target: number | null): Subject {
  return {
    id,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    name,
    exam_date: examInDays === null ? null : iso(NOW + examInDays * DAY),
    grading_scale: scale,
    target_grade: target,
    current_grade: null,
  };
}

const SUBJECTS: Subject[] = [
  subject("s-abu", "ABU", 8, "swiss", 5.5),
  subject("s-kripo", "Kripo", null, "swiss", null),
  subject("s-recht", "Strafrecht", 3, "german", 1.7),
];

type CardShape = "mastered" | "learning" | "due";
function card(id: string, subjectId: string, topic: string, shape: CardShape): Card {
  const base = {
    id,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    subject_id: subjectId,
    source_id: null,
    front: `Q ${id}`,
    back: "…",
    topic,
    ease_factor: 2.5,
  };
  if (shape === "mastered") return { ...base, difficulty: 1, interval_days: 30, repetitions: 5, lapses: 0, due_date: iso(NOW + 12 * DAY) };
  if (shape === "learning") return { ...base, difficulty: 3, interval_days: 5, repetitions: 2, lapses: 0, due_date: iso(NOW + 2 * DAY) };
  return { ...base, difficulty: 5, interval_days: 1, repetitions: 0, lapses: 1, due_date: iso(NOW - 2 * HOUR) };
}

// Build a topic's cards from a shape tally so masteredPct lands roughly where we want it.
function topicCards(prefix: string, subjectId: string, topic: string, m: number, l: number, d: number): Card[] {
  const out: Card[] = [];
  let i = 0;
  for (let k = 0; k < m; k++) out.push(card(`${prefix}-m${i++}`, subjectId, topic, "mastered"));
  for (let k = 0; k < l; k++) out.push(card(`${prefix}-l${i++}`, subjectId, topic, "learning"));
  for (let k = 0; k < d; k++) out.push(card(`${prefix}-d${i++}`, subjectId, topic, "due"));
  return out;
}

const CARDS: Card[] = [
  // ABU — strong overall, two weak topics that become focus areas
  ...topicCards("abu-or", "s-abu", "Obligationenrecht", 4, 3, 2), // ~44%
  ...topicCards("abu-vw", "s-abu", "Verwaltungsverfahren", 5, 3, 1), // ~55%
  ...topicCards("abu-gen", "s-abu", "Grundlagen", 8, 2, 0),
  // Kripo — mid
  ...topicCards("kri-erm", "s-kripo", "Ermittlungsverfahren", 3, 4, 1),
  ...topicCards("kri-gen", "s-kripo", "Grundlagen", 6, 2, 0),
  // Strafrecht — one sharp weak topic, exam soon
  ...topicCards("str-at", "s-recht", "Strafrecht AT", 3, 3, 3), // ~33%
  ...topicCards("str-gen", "s-recht", "Grundlagen", 5, 2, 1),
];

// Quizzes + questions so attempts attribute to subjects.
const QUIZZES: Quiz[] = SUBJECTS.map((s) => ({
  id: `qz-${s.id}`,
  created_at: iso(NOW),
  updated_at: iso(NOW),
  deleted_at: null,
  subject_id: s.id,
  title: `${s.name} quiz`,
}));

const QUESTIONS: Question[] = SUBJECTS.flatMap((s) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: `qn-${s.id}-${i}`,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    quiz_id: `qz-${s.id}`,
    prompt: "…",
    kind: "multipleChoice" as const,
    topic: "…",
    options: [],
    answer_key: "a",
  })),
);

function attempt(id: string, questionId: string, score: number, daysAgo: number): Attempt {
  return {
    id,
    created_at: iso(NOW - daysAgo * DAY),
    question_id: questionId,
    response: "a",
    is_correct: score >= 0.6,
    score,
    feedback: "",
    graded_at: iso(NOW - daysAgo * DAY),
  };
}

const ATTEMPTS: Attempt[] = [
  // this week (higher) vs last week (lower) → positive quiz trend
  attempt("at1", "qn-s-abu-0", 0.8, 1),
  attempt("at2", "qn-s-abu-1", 0.75, 2),
  attempt("at3", "qn-s-kripo-0", 0.7, 1),
  attempt("at4", "qn-s-recht-0", 0.72, 3),
  attempt("at5", "qn-s-abu-2", 0.68, 9),
  attempt("at6", "qn-s-kripo-1", 0.66, 10),
];

// Review logs: an 8-day active streak (incl. today), a few per day.
const REVIEW_LOGS: ReviewLog[] = Array.from({ length: 8 }).flatMap((_, day) =>
  Array.from({ length: 3 }, (_, k) => ({
    id: `rl-${day}-${k}`,
    created_at: iso(NOW - day * DAY),
    card_id: `abu-or-m0`,
    reviewed_at: iso(NOW - day * DAY - k * HOUR),
    rating: 4,
  })),
);

// Study sessions: this week's minutes (with a Thursday peak) and a lighter last week for +delta.
const weekStart = (() => {
  const s = startOfDay(NOW);
  const dow = new Date(s).getDay();
  return s - ((dow + 6) % 7) * DAY; // Monday
})();
const THIS_WEEK_MINUTES = [22, 14, 34, 55, 26, 12, 0];
const STUDY_SESSIONS: StudySession[] = [
  ...THIS_WEEK_MINUTES.map((min, i) => ({
    id: `ss-tw-${i}`,
    created_at: iso(weekStart + i * DAY),
    subject_id: null,
    started_at: iso(weekStart + i * DAY + 18 * HOUR),
    duration_seconds: min * 60,
    kind: "review" as const,
  })).filter((s) => s.duration_seconds > 0),
  // last week total ~ 130m (this week ~163m → ~+25%)
  ...[18, 12, 20, 30, 25, 15, 10].map((min, i) => ({
    id: `ss-lw-${i}`,
    created_at: iso(weekStart - 7 * DAY + i * DAY),
    subject_id: null,
    started_at: iso(weekStart - 7 * DAY + i * DAY + 18 * HOUR),
    duration_seconds: min * 60,
    kind: "review" as const,
  })),
];

const GRADES: GradeEntry[] = [];

const DATA: DashboardData = {
  subjects: SUBJECTS,
  cards: CARDS,
  quizzes: QUIZZES,
  questions: QUESTIONS,
  attempts: ATTEMPTS,
  reviewLogs: REVIEW_LOGS,
  gradeEntries: GRADES,
  studySessions: STUDY_SESSIONS,
};

export default function DashboardPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AppShell email="philipp@cram.study" activeHref="/dashboard">
      <DashboardView data={DATA} now={NOW} name="Philipp" />
    </AppShell>
  );
}
