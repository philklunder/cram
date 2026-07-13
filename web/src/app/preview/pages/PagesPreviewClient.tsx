"use client";

// DEV-ONLY preview of the routed sidebar destinations (Review/Progress/Quizzes/Flashcards/Settings)
// inside the app shell, with mock library data. The active page + display scale are chosen by the
// server wrapper from the URL (?p=<slug>&scale=<scale>) so headless screenshots capture the right
// surface on the first render (no post-hydration effect). Gated to non-production by the wrapper.
import { useEffect } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { FlashcardPractice } from "@/components/FlashcardPractice";
import { ReviewSession } from "@/components/ReviewSession";
import { ReviewReport } from "@/components/ReviewRun";
import { QuizRunner } from "@/components/QuizRunner";
import { CalendarPlanner } from "@/components/pages/CalendarPlanner";
import { FlashcardsHubView } from "@/components/pages/FlashcardsHub";
import { GradesView } from "@/components/pages/GradesView";
import { ProgressOverviewView } from "@/components/pages/ProgressOverview";
import { QuizzesHubView } from "@/components/pages/QuizzesHub";
import { ReviewHubView } from "@/components/pages/ReviewHub";
import { SettingsView } from "@/components/pages/SettingsView";
import { SubjectDetailView } from "@/components/SubjectDetail";
import { SubjectsListView } from "@/components/SubjectsList";
import { UploadWork } from "@/components/pages/UploadWork";
import type { LibraryData, SubjectBundle } from "@/lib/api/client";
import type { Attempt, Card, Exam, GradeEntry, GradingScale, Question, Quiz, ReviewLog, Source, StudySession, Subject } from "@/lib/api/types";
import { subjectExamDate } from "@/lib/dashboard";
import { setDisplayScale } from "@/lib/useDisplayScale";

const NOW = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function subject(id: string, name: string, scale: GradingScale): Subject {
  return {
    id,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    name,
    grading_scale: scale,
    target_grade: null,
    current_grade: null,
  };
}

const SUBJECTS: Subject[] = [
  subject("s-abu", "ABU", "swiss"),
  subject("s-kripo", "Kripo", "swiss"),
  subject("s-recht", "Strafrecht", "german"),
];

// Exam dates live on exams now (a subject can hold several). Kripo has none.
const EXAMS: Exam[] = [
  { id: "ex-abu", created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null, subject_id: "s-abu", title: "ABU final", exam_date: iso(NOW + 8 * DAY) },
  { id: "ex-recht", created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null, subject_id: "s-recht", title: "Strafrecht AT exam", exam_date: iso(NOW + 3 * DAY) },
];

type Shape = "mastered" | "learning" | "due";
let cardN = 0;
function card(subjectId: string, topic: string, front: string, back: string, shape: Shape): Card {
  const base = {
    id: `c-${cardN++}`,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    subject_id: subjectId,
    exam_id: null,
    source_id: null,
    front,
    back,
    topic,
    ease_factor: 2.5,
  };
  if (shape === "mastered") return { ...base, difficulty: 1, interval_days: 30, repetitions: 5, lapses: 0, due_date: iso(NOW + 12 * DAY) };
  if (shape === "learning") return { ...base, difficulty: 3, interval_days: 5, repetitions: 2, lapses: 0, due_date: iso(NOW + 2 * DAY) };
  return { ...base, difficulty: 5, interval_days: 1, repetitions: 0, lapses: 1, due_date: iso(NOW - 2 * HOUR) };
}

const CARDS: Card[] = [
  card("s-abu", "Obligationenrecht", "What makes a contract valid?", "Offer, acceptance, capacity and lawful cause.", "due"),
  card("s-abu", "Obligationenrecht", "Define Verzug (default).", "Debtor fails to perform a due, enforceable obligation.", "learning"),
  card("s-abu", "Verwaltungsverfahren", "What is a Verfügung?", "An individual, binding administrative act.", "mastered"),
  card("s-abu", "Grundlagen", "Three branches of government?", "Legislative, executive, judiciary.", "mastered"),
  card("s-kripo", "Ermittlungsverfahren", "Purpose of the Ermittlungsverfahren?", "Investigate whether charges should be brought.", "due"),
  card("s-kripo", "Ermittlungsverfahren", "Who leads it?", "The public prosecutor (Staatsanwaltschaft).", "learning"),
  card("s-kripo", "Grundlagen", "Presumption of innocence?", "Everyone is innocent until proven guilty.", "mastered"),
  card("s-recht", "Strafrecht AT", "Elements of a crime?", "Tatbestand, Rechtswidrigkeit, Schuld.", "due"),
  card("s-recht", "Strafrecht AT", "What is Vorsatz?", "Intent — knowing and willing the offence.", "due"),
  card("s-recht", "Grundlagen", "nulla poena sine lege?", "No punishment without a prior law.", "mastered"),
];

function quiz(id: string, subjectId: string, title: string): Quiz {
  return { id, created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null, subject_id: subjectId, exam_id: null, title };
}
const QUIZZES: Quiz[] = [
  quiz("qz-abu", "s-abu", "ABU — Recht & Staat"),
  quiz("qz-kripo", "s-kripo", "Kripo — Strafprozess"),
  quiz("qz-recht", "s-recht", "Strafrecht AT — Grundlagen"),
];
const QUESTIONS: Question[] = QUIZZES.flatMap((q, qi) =>
  Array.from({ length: qi === 0 ? 6 : 4 }, (_, i) => ({
    id: `qn-${q.id}-${i}`,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    quiz_id: q.id,
    prompt: "…",
    kind: "multipleChoice" as const,
    topic: "…",
    options: [],
    answer_key: "a",
  })),
);

const DATA: LibraryData = { subjects: SUBJECTS, exams: EXAMS, cards: CARDS, quizzes: QUIZZES, questions: QUESTIONS };

// Graded answers from past Review test phases — the quiz-accuracy half of readiness. Without these
// every subject previews as "Untested", which is correct but shows none of the scored states.
const ATTEMPTS: Attempt[] = QUESTIONS.slice(0, 8).map((q, i) => ({
  id: `at-${q.id}`,
  created_at: iso(NOW - (8 - i) * HOUR),
  question_id: q.id,
  response: "a",
  is_correct: i % 3 !== 0,
  score: i % 3 === 0 ? 0.2 : 1,
  feedback: "",
  graded_at: iso(NOW - (8 - i) * HOUR),
}));

// Sources = "decks" on the Flashcards page.
function source(id: string, subjectId: string, title: string): Source {
  return { id, created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null, subject_id: subjectId, kind: "pdf", title, added_at: iso(NOW), storage_paths: [] };
}
const SOURCES: Source[] = [
  source("src-abu-1", "s-abu", "Recht & Staat — Ch. 4"),
  source("src-abu-2", "s-abu", "Lecture slides"),
  source("src-kripo-1", "s-kripo", "Strafprozess script"),
  source("src-recht-1", "s-recht", "Strafrecht AT Skript"),
];
const SRC_BY_SUBJECT = new Map<string, string[]>();
for (const s of SOURCES) SRC_BY_SUBJECT.set(s.subject_id, [...(SRC_BY_SUBJECT.get(s.subject_id) ?? []), s.id]);
// Link each card to one of its subject's decks so the deck filter + counts populate.
const FLASHCARD_CARDS: Card[] = CARDS.map((c, i) => {
  const ids = SRC_BY_SUBJECT.get(c.subject_id) ?? [];
  return ids.length ? { ...c, source_id: ids[i % ids.length] } : c;
});

// Grades mock: subjects with targets + a spread of entries so trends/averages populate.
const GRADE_SUBJECTS: Subject[] = SUBJECTS.map((s) => ({
  ...s,
  target_grade: s.grading_scale === "german" ? 1.7 : 5.5,
}));
let gN = 0;
function grade(subjectId: string, title: string, kind: GradeEntry["kind"], score: number, weight: number, daysAgo: number): GradeEntry {
  return {
    id: `g-${gN++}`,
    created_at: iso(NOW - daysAgo * DAY),
    updated_at: iso(NOW - daysAgo * DAY),
    deleted_at: null,
    subject_id: subjectId,
    exam_id: null,
    title,
    kind,
    score,
    weight,
    date: iso(NOW - daysAgo * DAY),
  };
}
const GRADES: GradeEntry[] = [
  grade("s-abu", "Semester test", "test", 4.5, 0.2, 60),
  grade("s-abu", "Case study", "assignment", 5.0, 0.3, 35),
  grade("s-abu", "Essay: Separation of Powers", "exam", 5.0, 0.3, 4),
  grade("s-kripo", "Procedure quiz", "test", 5.2, 0.25, 50),
  grade("s-kripo", "Mock exam", "exam", 5.5, 0.4, 12),
  grade("s-recht", "Intro test", "test", 2.7, 0.2, 45),
  grade("s-recht", "Midterm", "exam", 2.3, 0.4, 18),
  grade("s-recht", "Case brief", "assignment", 2.0, 0.3, 6),
];

// Review logs (streak) + study sessions (8-week heatmap) for the rich Progress page.
const REVIEW_LOGS: ReviewLog[] = Array.from({ length: 12 }).flatMap((_, d) =>
  Array.from({ length: 2 }, (_, k) => ({
    id: `rl-${d}-${k}`,
    created_at: iso(NOW - d * DAY),
    card_id: "c-0",
    reviewed_at: iso(NOW - d * DAY - k * HOUR),
    rating: 4,
  })),
);
const STUDY_SESSIONS: StudySession[] = Array.from({ length: 56 })
  .map((_, i) => {
    const daysAgo = 55 - i;
    // Deterministic pseudo-variation: study on ~65% of days, more on weekdays.
    const seed = (i * 37) % 100;
    const minutes = seed < 35 ? 0 : 12 + (seed % 45);
    return { daysAgo, minutes };
  })
  .filter((d) => d.minutes > 0)
  .map((d, i) => ({
    id: `ss-${i}`,
    created_at: iso(NOW - d.daysAgo * DAY),
    subject_id: null,
    started_at: iso(NOW - d.daysAgo * DAY + 18 * HOUR),
    duration_seconds: d.minutes * 60,
    kind: "review" as const,
  }));

const PROGRESS_DATA = {
  subjects: GRADE_SUBJECTS,
  exams: EXAMS,
  cards: CARDS,
  gradeEntries: GRADES,
  reviewLogs: REVIEW_LOGS,
  studySessions: STUDY_SESSIONS,
  questions: QUESTIONS,
  quizzes: QUIZZES,
  attempts: ATTEMPTS,
};

const REVIEW_DUE = CARDS.filter((c) => new Date(c.due_date).getTime() <= NOW);
const REVIEW_SUBJECT_BY_ID = new Map(GRADE_SUBJECTS.map((s) => [s.id, s] as const));

// Quiz session mock: MC questions across 4 topics.
let qN = 0;
function mkQ(topic: string, prompt: string, options: string[]): Question {
  return {
    id: `qq-${qN++}`,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    deleted_at: null,
    quiz_id: "qz-abu",
    prompt,
    kind: "multipleChoice",
    topic,
    options,
    answer_key: options[0],
  };
}
const QUIZ_QS: Question[] = [
  mkQ("Microeconomics", "What happens to quantity demanded when price falls, all else equal?", ["It rises", "It falls", "It stays the same", "It becomes zero"]),
  mkQ("Microeconomics", "A normal good sees demand rise when…", ["Income rises", "Income falls", "Its price rises", "Substitutes get cheaper"]),
  mkQ("Microeconomics", "Marginal utility typically…", ["Diminishes with more units", "Increases forever", "Is always zero", "Equals total utility"]),
  mkQ("Microeconomics", "Which is most likely to increase demand for electric cars?", ["A decrease in the price of lithium batteries", "An increase in the price of gasoline", "A decrease in consumer income", "An increase in the cost of car insurance"]),
  mkQ("Market structures", "A monopoly is characterised by…", ["A single seller", "Many small sellers", "Perfect information", "Free entry"]),
  mkQ("Market structures", "Perfect competition assumes…", ["Homogeneous products", "Branded products", "Price-setting firms", "Barriers to entry"]),
  mkQ("Fiscal policy", "Expansionary fiscal policy involves…", ["Higher government spending", "Higher interest rates", "Lower money supply", "Selling bonds"]),
  mkQ("Fiscal policy", "A budget deficit occurs when…", ["Spending exceeds revenue", "Revenue exceeds spending", "The budget balances", "Debt is repaid"]),
  mkQ("International trade", "Comparative advantage is about…", ["Lower opportunity cost", "Absolute output", "Higher tariffs", "Fixed exchange rates"]),
  mkQ("International trade", "A tariff is…", ["A tax on imports", "A subsidy on exports", "A quota", "A free-trade zone"]),
];
function seedResult(topic: string): { topic: string; score: number; is_correct: boolean; feedback: string; answerKey: string; isMC: boolean } {
  return { topic, score: 1, is_correct: true, feedback: "", answerKey: "", isMC: true };
}
const QUIZ_SEED = [seedResult("Microeconomics"), seedResult("Microeconomics"), seedResult("Microeconomics")];

// One subject's bundle (ABU) for the subject-detail preview: its exam, cards, quiz, questions,
// attempts and grades, sliced from the mocks the same way loadSubjectBundle slices the snapshot.
const ABU_BUNDLE: SubjectBundle = {
  subject: GRADE_SUBJECTS.find((s) => s.id === "s-abu")!,
  exams: EXAMS.filter((e) => e.subject_id === "s-abu"),
  sources: SOURCES.filter((s) => s.subject_id === "s-abu"),
  cards: CARDS.filter((c) => c.subject_id === "s-abu"),
  quizzes: QUIZZES.filter((q) => q.subject_id === "s-abu"),
  questions: QUESTIONS.filter((q) => q.quiz_id === "qz-s-abu"),
  gradeEntries: GRADES.filter((g) => g.subject_id === "s-abu"),
  attempts: ATTEMPTS.filter((a) => a.question_id.startsWith("qn-s-abu-")),
};

const PAGES: Record<string, { href: string; node: React.ReactNode }> = {
  review: {
    href: "/review",
    node: <ReviewHubView subjects={SUBJECTS} cards={CARDS} exams={EXAMS} questions={QUESTIONS} quizzes={QUIZZES} attempts={ATTEMPTS} streak={2} now={NOW} onStart={() => {}} />,
  },
  reviewsettings: {
    href: "/review",
    node: <ReviewHubView subjects={SUBJECTS} cards={CARDS} exams={EXAMS} questions={QUESTIONS} quizzes={QUIZZES} attempts={ATTEMPTS} streak={2} now={NOW} onStart={() => {}} initialSettingsOpen />,
  },
  reviewsession: {
    href: "/review",
    node: (
      <ReviewSession
        cards={REVIEW_DUE}
        streak={12}
        initialFlipped
        contextFor={(card: Card) => {
          const subject = REVIEW_SUBJECT_BY_ID.get(card.subject_id) ?? GRADE_SUBJECTS[0];
          return { subject, examDate: subjectExamDate(subject.id, EXAMS), strength: 0.6 };
        }}
        onExit={() => {}}
        onFinish={() => {}}
      />
    ),
  },
  reviewreport: {
    href: "/review",
    node: (
      <ReviewReport
        title="ABU — Review"
        subtitle="Swiss scale"
        recall={{
          reviewed: 8,
          recalledWell: 6,
          ratings: [
            { cardId: "c1", topic: "Obligationenrecht", rating: 1 },
            { cardId: "c2", topic: "Grundlagen", rating: 4 },
          ],
        }}
        quiz={[
          { topic: "Grundlagen", score: 1, is_correct: true, feedback: "", answerKey: "", isMC: true },
          { topic: "Fiscal policy", score: 0.2, is_correct: false, feedback: "", answerKey: "", isMC: false },
        ]}
        hadQuestions
        questionLimit={5}
        generateHref="/upload?subject=ABU"
        onDone={() => {}}
      />
    ),
  },
  flashcardpractice: {
    href: "/flashcards",
    node: (
      <FlashcardPractice
        cards={REVIEW_DUE}
        title="Biology"
        subtitle="Cell division"
        subjectId="s-bio"
        initialFlipped
        onClose={() => {}}
      />
    ),
  },
  progress: { href: "/progress", node: <ProgressOverviewView data={PROGRESS_DATA} now={NOW} /> },
  quizzes: { href: "/quizzes", node: <QuizzesHubView data={DATA} /> },
  quizsession: {
    href: "/quizzes",
    node: (
      <QuizRunner
        title="ABU — Economics"
        subtitle="ABU · Swiss scale · adaptive practice"
        questions={QUIZ_QS}
        subjectId="s-abu"
        initialIdx={3}
        initialResponse={QUIZ_QS[3].options[0]}
        initialResults={QUIZ_SEED}
        onClose={() => {}}
      />
    ),
  },
  flashcards: { href: "/flashcards", node: <FlashcardsHubView subjects={SUBJECTS} exams={EXAMS} cards={FLASHCARD_CARDS} sources={SOURCES} /> },
  aidecks: {
    href: "/upload",
    node: (
      <UploadWork
        demoSubject="ABU"
        demoFiles={[
          { name: "ABU_Lecture_1.pdf", size: Math.round(12.4 * 1024 * 1024) },
          { name: "Market_Structures.pdf", size: Math.round(4.8 * 1024 * 1024) },
          { name: "Textbook_Ch3.jpg", size: Math.round(2.1 * 1024 * 1024) },
        ]}
      />
    ),
  },
  subjects: { href: "/subjects", node: <SubjectsListView data={PROGRESS_DATA} /> },
  subjectdetail: { href: "/subjects", node: <SubjectDetailView data={ABU_BUNDLE} /> },
  grades: { href: "/grades", node: <GradesView subjects={GRADE_SUBJECTS} exams={EXAMS} entries={GRADES} /> },
  calendar: { href: "/calendar", node: <CalendarPlanner subjects={GRADE_SUBJECTS} exams={EXAMS} cards={CARDS} studySessions={STUDY_SESSIONS} questions={QUESTIONS} quizzes={QUIZZES} attempts={ATTEMPTS} now={NOW} /> },
  settings: { href: "/settings", node: <SettingsView email="philipp@cram.study" /> },
};

export function PagesPreviewClient({ slug, scale }: { slug: string; scale?: string }) {
  // Dev convenience: ?scale=swiss forces the display grading scale so the Settings-driven
  // conversion can be previewed without clicking through the picker.
  useEffect(() => {
    if (scale) setDisplayScale(scale as GradingScale);
  }, [scale]);

  const page = PAGES[slug] ?? PAGES.review;
  return (
    <AppShell email="philipp@cram.study" activeHref={page.href}>
      {page.node}
    </AppShell>
  );
}
