"use client";

import { useMemo, useState } from "react";
import { HelpCircle, Layers, Play } from "lucide-react";

import { QuizRunner } from "@/components/QuizRunner";
import { LibraryLoader, PageHeader, ScopePicker } from "@/components/pages/shared";
import { Badge, Button, EmptyState } from "@/components/ui";
import type { LibraryData } from "@/lib/api/client";
import type { Question, Quiz } from "@/lib/api/types";
import { WHOLE_SUBJECT, inExamScope, scopeLabel } from "@/lib/scope";
import { subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";

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

  const subject = data.subjects.find((s) => s.id === subjectId) ?? subjectsWithQuizzes[0];
  const subjectExams = useMemo(() => data.exams.filter((e) => e.subject_id === subject?.id), [data.exams, subject]);

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
          subtitle="Pick a subject and exam, then test yourself. Multiple-choice is graded instantly; short answers are graded by Claude."
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

  return (
    <section style={subjectVars(subject!.id)}>
      <PageHeader
        title="Quizzes"
        subtitle="Pick a subject and exam, then test yourself. Multiple-choice is graded instantly; short answers are graded by Claude."
      />

      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <ScopePicker
            subjects={subjectsWithQuizzes}
            exams={data.exams}
            subjectId={subjectId}
            scope={scope}
            onChange={(sid, sc) => {
              setSubjectId(sid);
              setScope(sc);
            }}
          />

          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-sm font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
              >
                {subjectInitials(subject!.name)}
              </span>
              <div>
                <p className="font-semibold text-ink">
                  {questionsInScope.length} question{questionsInScope.length === 1 ? "" : "s"} ready
                </p>
                <p className="text-sm text-muted">
                  {quizzesInScope.length} quiz{quizzesInScope.length === 1 ? "" : "zes"}
                  {scopeLabel(subjectExams, scope) ? ` · ${scopeLabel(subjectExams, scope)}` : " · all exams"}
                </p>
              </div>
            </div>
            <Button
              className="flex-none"
              onClick={() => setActive(true)}
              disabled={questionsInScope.length === 0}
            >
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Start quiz
            </Button>
          </div>

          {questionsInScope.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-4 py-6 text-center text-sm text-muted">
              No quiz questions for this exam yet. Add material to it in AI Decks, or pick another exam.
            </p>
          ) : null}
        </div>

        {/* What's included — the quizzes folded into this session. */}
        {quizzesInScope.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-2">Included in this session</h2>
            <ul className="space-y-2">
              {quizzesInScope.map((quiz) => {
                const n = questionsInScope.filter((qn) => qn.quiz_id === quiz.id).length;
                return (
                  <li
                    key={quiz.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card"
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
                      <HelpCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{quiz.title}</span>
                    <Badge tone="neutral">
                      <Layers className="h-3 w-3" strokeWidth={2} aria-hidden />
                      {n}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function QuizzesHubPage() {
  return <LibraryLoader>{(data) => <QuizzesHubView data={data} />}</LibraryLoader>;
}
