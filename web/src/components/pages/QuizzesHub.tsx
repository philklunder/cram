"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, Clock, FileText, HelpCircle, Layers, Play, Sparkles, Target } from "lucide-react";

import { QuizRunner } from "@/components/QuizRunner";
import { LibraryLoader, PageHeader, SelectChevron } from "@/components/pages/shared";
import { Button, EmptyState, cn, selectClass } from "@/components/ui";
import type { LibraryData } from "@/lib/api/client";
import type { Question, Quiz } from "@/lib/api/types";
import { GENERAL_SCOPE, WHOLE_SUBJECT, examsForSubject, inExamScope, scopeLabel } from "@/lib/scope";
import { subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";

// Rough practice-time estimate: ~36s per question, rounded to whole minutes.
function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.round((questionCount * 36) / 60));
}

function questionTypeLabel(questions: Question[]): string {
  const hasMC = questions.some((q) => q.kind === "multipleChoice");
  const hasSA = questions.some((q) => q.kind === "shortAnswer");
  if (hasMC && hasSA) return "Multiple choice + short answer";
  if (hasSA) return "Short answer";
  return "Multiple choice";
}

export function QuizzesHubView({ data }: { data: LibraryData }) {
  // Only subjects that actually have quiz questions can be practised.
  const subjectsWithQuizzes = useMemo(() => {
    const withQuestions = new Set(
      data.quizzes
        .filter((q) => data.questions.some((qn) => qn.quiz_id === q.id))
        .map((q) => q.subject_id),
    );
    return data.subjects.filter((s) => withQuestions.has(s.id));
  }, [data]);

  const [subjectId, setSubjectId] = useState(subjectsWithQuizzes[0]?.id ?? "");
  const [scope, setScope] = useState(WHOLE_SUBJECT);
  const [active, setActive] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const subject = data.subjects.find((s) => s.id === subjectId) ?? subjectsWithQuizzes[0];
  const subjectExams = useMemo(() => examsForSubject(data.exams, subject?.id ?? null), [data.exams, subject]);

  // Quizzes for the chosen subject, narrowed to the chosen exam scope, plus their questions.
  const quizzesInScope = useMemo<Quiz[]>(
    () => data.quizzes.filter((q) => q.subject_id === subject?.id && inExamScope(q.exam_id, scope)),
    [data.quizzes, subject, scope],
  );
  const questionsInScope = useMemo<Question[]>(() => {
    const ids = new Set(quizzesInScope.map((q) => q.id));
    return data.questions.filter((qn) => ids.has(qn.quiz_id));
  }, [data.questions, quizzesInScope]);

  if (subjectsWithQuizzes.length === 0) {
    return (
      <section>
        <PageHeader
          title="Quizzes"
          subtitle="Choose what you want to practice. Select a subject, then pick the exam or quiz scope."
        />
        <EmptyState
          title="No quizzes yet"
          hint="Generating a deck in AI Decks also creates a quiz. Upload some material to get started."
        />
      </section>
    );
  }

  // Practising: hand the in-scope questions to the runner (which reveals answers + accuracy).
  if (active && subject && questionsInScope.length > 0) {
    const label = scopeLabel(subjectExams, scope);
    return (
      <QuizRunner
        title={subject.name}
        subtitle={label ? `${subject.name} · ${label}` : `${subject.name} · all exams`}
        questions={questionsInScope}
        subjectId={subject.id}
        onClose={() => setActive(false)}
      />
    );
  }

  const label = scopeLabel(subjectExams, scope);
  const scopeText = scope === WHOLE_SUBJECT ? "Whole subject" : label ?? "All exams";
  const scopeChip = label ?? "all exams";
  const ready = questionsInScope.length > 0;
  const shownQuizzes = showAll ? quizzesInScope : quizzesInScope.slice(0, 3);

  return (
    <section style={subjectVars(subject!.id)}>
      <PageHeader
        title="Quizzes"
        subtitle="Choose what you want to practice. Select a subject, then pick the exam or quiz scope."
      />

      <div className="space-y-6">
        {/* Practice picker */}
        <div className="animate-rise rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25"
            >
              <Target className="h-5 w-5" strokeWidth={2} />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">What quiz do you want to practice?</h2>
          </div>

          {/* Two-step subject → exam selector */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <div>
              <StepLabel n={1} label="Select subject" />
              <div className="relative mt-2.5">
                <select
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setScope(WHOLE_SUBJECT);
                    setShowAll(false);
                  }}
                  className={selectClass}
                  aria-label="Subject"
                >
                  {subjectsWithQuizzes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
              <Caption icon={BookOpen}>Subject</Caption>
            </div>

            <div className="hidden self-start pt-[42px] sm:block" aria-hidden>
              <span className="flex h-11 w-8 items-center justify-center text-brand-400 dark:text-brand-500">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12h16m0 0-6-6m6 6-6 6" />
                </svg>
              </span>
            </div>

            <div>
              <StepLabel n={2} label="Choose exam" />
              <div className="relative mt-2.5">
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setShowAll(false);
                  }}
                  className={selectClass}
                  aria-label="Exam or scope"
                >
                  <option value={WHOLE_SUBJECT}>Whole subject</option>
                  {subjectExams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                  <option value={GENERAL_SCOPE}>General (no exam)</option>
                </select>
                <SelectChevron />
              </div>
              <Caption icon={FileText}>Exam or scope</Caption>
            </div>
          </div>

          {/* Preview strip */}
          <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-surface-2 to-surface-2/40 p-5 dark:from-white/[0.04] dark:to-transparent">
            <DotGrid />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <span
                aria-hidden
                className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl text-lg font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
              >
                {subjectInitials(subject!.name)}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-ink">
                  {subject!.name} <span className="text-muted">—</span> {scopeText}
                </h3>
                <p className="mt-0.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
                  {ready ? `${questionsInScope.length} question${questionsInScope.length === 1 ? "" : "s"} ready` : "No questions in this scope yet"}
                </p>
                {ready ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Chip icon={Layers}>{quizzesInScope.length} quiz{quizzesInScope.length === 1 ? "" : "zes"}</Chip>
                    <Chip icon={FileText}>{scopeChip}</Chip>
                    <Chip icon={Clock}>~{estimateMinutes(questionsInScope.length)} min</Chip>
                    <Chip icon={HelpCircle}>{questionTypeLabel(questionsInScope)}</Chip>
                  </div>
                ) : null}
              </div>

              <Button
                className="flex-none px-6 py-3 text-[15px] sm:self-center"
                onClick={() => setActive(true)}
                disabled={!ready}
              >
                <Play className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden />
                Start quiz
              </Button>
            </div>
          </div>

          {!ready ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-4 py-5 text-center text-sm text-muted">
              No quiz questions for this exam yet. Add material to it in AI Decks, or pick another exam.
            </p>
          ) : null}
        </div>

        {/* What's included + how grading works */}
        {ready ? (
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <div className="mb-4 flex items-center gap-2.5">
                <Layers className="h-5 w-5 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
                <h2 className="text-base font-semibold tracking-tight text-ink">Included in this practice set</h2>
              </div>
              <ul className="space-y-2.5">
                {shownQuizzes.map((quiz) => {
                  const n = questionsInScope.filter((qn) => qn.quiz_id === quiz.id).length;
                  return (
                    <li key={quiz.id} className="flex items-center gap-3.5 rounded-xl border border-line bg-surface px-3.5 py-3 transition duration-200 hover:border-line-strong">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]"
                      >
                        <FileText className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{quiz.title}</span>
                      <span className="flex-none rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                        {n} question{n === 1 ? "" : "s"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {quizzesInScope.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
                >
                  {showAll ? "Show less" : "Show all details"}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")} strokeWidth={2.5} aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-brand-100/20 p-6 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-brand-500/[0.03]">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-brand-600 shadow-sm ring-1 ring-inset ring-brand-100 dark:bg-white/10 dark:text-brand-300 dark:ring-brand-500/25"
              >
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-4 text-base font-bold text-ink">Claude grades short answers instantly</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Get high-quality feedback on your short answers, plus clear explanations for every question.
              </p>
              <div className="mt-4 flex items-start gap-2.5 border-t border-brand-100/70 pt-4 dark:border-brand-500/15">
                <Check className="mt-0.5 h-4 w-4 flex-none text-brand-600 dark:text-brand-300" strokeWidth={2.5} aria-hidden />
                <p className="text-sm text-ink-2">Mix of multiple-choice and short-answer questions</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
        {n}
      </span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </div>
  );
}

function Caption({ icon: Icon, children }: { icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted">
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {children}
    </p>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof Layers; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 shadow-sm">
      <Icon className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
      {children}
    </span>
  );
}

// Faint dotted texture on the right of the preview strip (matches the reference art).
function DotGrid() {
  return (
    <svg aria-hidden className="pointer-events-none absolute right-40 top-1/2 hidden h-24 w-40 -translate-y-1/2 text-brand-300/40 dark:text-brand-500/20 lg:block" fill="currentColor">
      <defs>
        <pattern id="quiz-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#quiz-dots)" />
    </svg>
  );
}

export function QuizzesHubPage() {
  return <LibraryLoader>{(data) => <QuizzesHubView data={data} />}</LibraryLoader>;
}
