"use client";

// DEV-ONLY visual preview harness. Renders the authenticated product surfaces with mock data so
// they can be screenshotted/iterated without a Supabase login. NOT linked anywhere and excluded
// from the real app shell. Delete before shipping (or leave gated behind NODE_ENV).
import { notFound } from "next/navigation";

import { GradesPanel } from "@/components/GradesPanel";
import { ProgressPanel } from "@/components/ProgressPanel";
import { ExamSection, SubjectHero } from "@/components/SubjectDetail";
import { SubjectCard } from "@/components/SubjectsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { subjectVars } from "@/lib/subjectColor";
import type { Card, Exam, GradeEntry, GradingScale, Subject } from "@/lib/api/types";

function mockSubject(
  i: number,
  name: string,
  scale: GradingScale,
  current: number | null,
  target: number | null,
): Subject {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  return {
    id: `mock-${i}-${name}`,
    created_at: iso,
    updated_at: iso,
    deleted_at: null,
    name,
    grading_scale: scale,
    target_grade: target,
    current_grade: current,
  };
}

const SUBJECTS: Subject[] = [
  mockSubject(0, "Organic Chemistry", "swiss", 4.5, 5.5),
  mockSubject(1, "Linear Algebra", "swiss", 5.0, 5.5),
  mockSubject(2, "Constitutional Law", "german", 2.3, 1.7),
  mockSubject(3, "Molecular Biology", "percentage", 78, 90),
  mockSubject(4, "Macroeconomics", "letter", null, null),
  mockSubject(5, "Art History", "gpa", 3.4, 3.8),
];

const NOW = Date.now();
const ISO = new Date(NOW).toISOString();

function mockCard(i: number, reps: number, intervalDays: number, dueOffsetDays: number, difficulty: number): Card {
  return {
    id: `card-${i}`,
    created_at: ISO,
    updated_at: ISO,
    deleted_at: null,
    subject_id: "mock-0-Organic Chemistry",
    exam_id: null,
    source_id: null,
    front: `Card ${i}`,
    back: "…",
    topic: "Topic",
    difficulty,
    ease_factor: 2.5,
    interval_days: intervalDays,
    repetitions: reps,
    lapses: 0,
    due_date: new Date(NOW + dueOffsetDays * 86_400_000).toISOString(),
  };
}

// A realistic spread: some mastered (long intervals, many reps), some learning, some shaky/new,
// and a handful due now (negative due offset).
const MOCK_CARDS: Card[] = [
  ...Array.from({ length: 18 }, (_, i) => mockCard(i, 6, 30, 12, 1)),
  ...Array.from({ length: 14 }, (_, i) => mockCard(100 + i, 2, 4, -1, 3)),
  ...Array.from({ length: 10 }, (_, i) => mockCard(200 + i, 0, 1, -1, 5)),
];

function mockGrade(i: number, title: string, kind: GradeEntry["kind"], score: number, weight: number, daysAgo: number): GradeEntry {
  return {
    id: `grade-${i}`,
    created_at: ISO,
    updated_at: ISO,
    deleted_at: null,
    subject_id: "mock-2-Constitutional Law",
    exam_id: null,
    title,
    kind,
    score,
    weight,
    date: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  };
}

function mockExam(id: string, title: string, inDays: number): Exam {
  return {
    id,
    created_at: ISO,
    updated_at: ISO,
    deleted_at: null,
    subject_id: SUBJECTS[0].id,
    title,
    exam_date: new Date(NOW + inDays * 86_400_000).toISOString(),
  };
}

const MOCK_GRADES: GradeEntry[] = [
  mockGrade(0, "Midterm", "exam", 2.0, 0.4, 20),
  mockGrade(1, "Case brief", "assignment", 2.7, 0.3, 40),
  mockGrade(2, "Pop quiz", "test", 3.3, 0.3, 55),
];

export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 flex items-start justify-between">
          <header>
            <h1 className="text-3xl font-bold tracking-tight text-ink">Subjects</h1>
            <p className="mt-2 max-w-prose text-[0.95rem] text-ink-2">
              Your courses. Open one to study it, add material, or track grades.
            </p>
            <dl className="mt-6 flex flex-wrap items-stretch gap-x-8 gap-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subjects</dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{SUBJECTS.length}</dd>
              </div>
              <div className="border-l border-line pl-8">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">Due now</dt>
                <dd className="mt-0.5 inline-flex items-center gap-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" />24
                </dd>
              </div>
              <div className="border-l border-line pl-8">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">Mastery</dt>
                <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">43%</dd>
              </div>
            </dl>
          </header>
          <ThemeToggle />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SUBJECTS.map((s, i) => (
            <SubjectCard key={s.id} subject={s} cards={i === 0 ? MOCK_CARDS : []} index={i} />
          ))}
        </div>

        <div className="mt-12">
          <span className="mb-4 block text-xs font-medium uppercase tracking-wide text-subtle">
            Preview · subject detail hero
          </span>
          <div style={subjectVars(SUBJECTS[0].id)}>
            <SubjectHero subject={SUBJECTS[0]} cards={MOCK_CARDS} />
          </div>
          <div className="mt-4" style={subjectVars(SUBJECTS[2].id)}>
            <SubjectHero subject={SUBJECTS[2]} cards={[]} />
          </div>
        </div>

        <div className="mt-12" style={subjectVars(SUBJECTS[0].id)}>
          <span className="mb-4 block text-xs font-medium uppercase tracking-wide text-subtle">
            Preview · subject exams (one expanded)
          </span>
          <div className="border-b border-line">
            <ExamSection
              exam={mockExam("ex-1", "Midterm — Chapters 1–4", 5)}
              cards={MOCK_CARDS.slice(0, 20)}
              quizzes={[]}
              questions={[]}
              href="/flashcards"
              onAddMaterial={() => {}}
              onEdit={() => {}}
              defaultOpen
            />
            <ExamSection
              exam={mockExam("ex-2", "Final exam", 24)}
              cards={MOCK_CARDS.slice(20, 32)}
              quizzes={[]}
              questions={[]}
              href="/flashcards"
              onAddMaterial={() => {}}
              onEdit={() => {}}
            />
            <ExamSection
              exam={null}
              cards={MOCK_CARDS.slice(32)}
              quizzes={[]}
              questions={[]}
              href="/flashcards"
              onAddMaterial={() => {}}
            />
          </div>
        </div>

        <div className="mt-12" style={subjectVars(SUBJECTS[0].id)}>
          <span className="mb-4 block text-xs font-medium uppercase tracking-wide text-subtle">
            Preview · progress panel
          </span>
          <ProgressPanel examDate={new Date(NOW + 2 * 86_400_000).toISOString()} cards={MOCK_CARDS} />
        </div>

        <div className="mt-12" style={subjectVars(SUBJECTS[2].id)}>
          <span className="mb-4 block text-xs font-medium uppercase tracking-wide text-subtle">
            Preview · grades panel
          </span>
          <GradesPanel subject={SUBJECTS[2]} entries={MOCK_GRADES} onChanged={() => {}} />
        </div>
      </div>
    </div>
  );
}
