"use client";

import Link from "next/link";
import { ChevronRight, HelpCircle } from "lucide-react";

import { EmptyState } from "@/components/ui";
import { LibraryLoader, PageHeader } from "@/components/pages/shared";
import type { LibraryData } from "@/lib/api/client";
import type { Quiz, Subject } from "@/lib/api/types";
import { subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";

export function QuizzesHubView({ data }: { data: LibraryData }) {
  const questionCount = new Map<string, number>();
  for (const q of data.questions) {
    questionCount.set(q.quiz_id, (questionCount.get(q.quiz_id) ?? 0) + 1);
  }

  const groups = data.subjects
    .map((subject) => ({
      subject,
      quizzes: data.quizzes.filter((q) => q.subject_id === subject.id),
    }))
    .filter((g) => g.quizzes.length > 0);

  const total = data.quizzes.length;

  return (
    <section>
      <PageHeader
        title="Quizzes"
        subtitle="Practice quizzes generated from your material. Multiple-choice is graded instantly; short answers are graded by Claude."
      />

      {total === 0 ? (
        <EmptyState
          title="No quizzes yet"
          hint="Generating material for a subject also creates a quiz. Upload something to get started."
        />
      ) : (
        <div className="space-y-8">
          {groups.map(({ subject, quizzes }) => (
            <div key={subject.id} style={subjectVars(subject.id)}>
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
                >
                  {subjectInitials(subject.name)}
                </span>
                <h2 className="text-base font-semibold tracking-tight text-ink">{subject.name}</h2>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {quizzes.map((quiz) => (
                  <QuizCard
                    key={quiz.id}
                    quiz={quiz}
                    subject={subject}
                    count={questionCount.get(quiz.id) ?? 0}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuizCard({ quiz, subject, count }: { quiz: Quiz; subject: Subject; count: number }) {
  return (
    <li>
      <Link
        href={`/subjects/${subject.id}`}
        className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--sc-line)] hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:border-[color:var(--sc-solid)]/45"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
          <HelpCircle className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{quiz.title}</p>
          <p className="text-xs text-muted tabular-nums">
            {count} question{count === 1 ? "" : "s"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 flex-none text-subtle transition-transform group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
      </Link>
    </li>
  );
}

export function QuizzesHubPage() {
  return <LibraryLoader>{(data) => <QuizzesHubView data={data} />}</LibraryLoader>;
}
