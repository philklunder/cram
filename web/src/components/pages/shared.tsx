"use client";

import type { ReactNode } from "react";

import { ErrorBox, Skeleton, cn, labelClass, selectClass } from "@/components/ui";
import { loadLibrary, type LibraryData } from "@/lib/api/client";
import type { Exam, Subject } from "@/lib/api/types";
import { GENERAL_SCOPE, WHOLE_SUBJECT, examsForSubject } from "@/lib/scope";
import { useAsync } from "@/lib/useAsync";

// Consistent page heading across the routed sidebar destinations.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-prose text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </header>
  );
}

// A Subject → Exam scope picker, shared by the Quizzes and Flashcards hubs so both narrow the
// same way. Controlled: the parent owns `subjectId` + `scope` (see lib/scope.ts for scope values).
// The Exam dropdown appears only once a subject with exams is chosen; picking a new subject resets
// the scope to the whole subject.
export function ScopePicker({
  subjects,
  exams,
  subjectId,
  scope,
  onChange,
  className,
}: {
  subjects: Subject[];
  exams: Exam[];
  subjectId: string;
  scope: string;
  onChange: (subjectId: string, scope: string) => void;
  className?: string;
}) {
  const subjectExams = examsForSubject(exams, subjectId);
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <label className="min-w-[160px] flex-1">
        <span className={cn(labelClass, "mb-1.5")}>Subject</span>
        <div className="relative">
          <select
            value={subjectId}
            onChange={(e) => onChange(e.target.value, WHOLE_SUBJECT)}
            className={selectClass}
            aria-label="Subject"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <SelectChevron />
        </div>
      </label>
      {subjectExams.length > 0 ? (
        <label className="min-w-[160px] flex-1">
          <span className={cn(labelClass, "mb-1.5")}>Exam</span>
          <div className="relative">
            <select
              value={scope}
              onChange={(e) => onChange(subjectId, e.target.value)}
              className={selectClass}
              aria-label="Exam"
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
        </label>
      ) : null}
    </div>
  );
}

// The chevron overlaid on our appearance-none selects (selectClass hides the native arrow).
export function SelectChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Loads the shared library data (subjects/cards/quizzes/questions) once and hands it to the page's
// presentational view. Loading shows a skeleton, errors surface inline — the pages themselves stay
// pure (and previewable with mock data).
export function LibraryLoader({ children }: { children: (data: LibraryData) => ReactNode }) {
  const { loading, error, data } = useAsync(() => loadLibrary(), []);
  if (loading) return <LibrarySkeleton />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  return <>{children(data)}</>;
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
