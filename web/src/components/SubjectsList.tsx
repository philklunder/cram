"use client";

import Link from "next/link";

import { Badge, EmptyState, ErrorBox, Skeleton, cn } from "@/components/ui";
import { listSubjects } from "@/lib/api/client";
import type { Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown, subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

type Urgency = "none" | "far" | "soon" | "urgent" | "past";

function urgency(days: number | null): Urgency {
  if (days === null) return "none";
  if (days < 0) return "past";
  if (days <= 3) return "urgent";
  if (days <= 10) return "soon";
  return "far";
}

// Semantic urgency color for the exam countdown — kept separate from the subject accent so a
// looming exam always reads red regardless of the subject's own hue. "far" borrows the subject
// accent (calm, on-brand); "none"/"past" stay muted.
const urgencyText: Record<Urgency, string> = {
  urgent: "text-red-600 dark:text-red-400",
  soon: "text-amber-600 dark:text-amber-400",
  far: "text-[color:var(--sc-ink)] dark:text-[color:var(--sc-ink-dark)]",
  past: "text-subtle",
  none: "text-subtle",
};
const urgencyDot: Record<Urgency, string> = {
  urgent: "bg-red-500",
  soon: "bg-amber-500",
  far: "bg-[var(--sc-solid)]",
  past: "bg-line-strong",
  none: "bg-line-strong",
};

function byNearestExam(a: Subject, b: Subject): number {
  const da = daysUntil(a.exam_date);
  const db = daysUntil(b.exam_date);
  if (da === null) return 1;
  if (db === null) return -1;
  return da - db;
}

export function SubjectCard({ subject, index }: { subject: Subject; index: number }) {
  const days = daysUntil(subject.exam_date);
  const u = urgency(days);

  return (
    // Entrance is a one-shot CSS fade-up (staggered by index) — declarative, so the resting state
    // is visible even before JS hydrates and it never ships blank in a headless render. Respects
    // reduced-motion via the global clamp in globals.css.
    <Link
      href={`/subjects/${subject.id}`}
      style={{ ...subjectVars(subject.id), animationDelay: `${Math.min(index, 12) * 45}ms` }}
      className={cn(
        "animate-fade-up group relative block overflow-hidden rounded-xl border border-line bg-surface shadow-card",
        "transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--sc-line)] hover:shadow-card-hover",
        "dark:hover:border-[color:var(--sc-solid)]/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
      )}
    >
      {/* Header: a quiet per-subject identity tile + the subject name and scale/grade meta. The
          subject color lives only in the tile and the hover accent — the surface stays neutral. */}
      <div className="flex items-start gap-3.5 px-4 pb-3.5 pt-4">
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-[0.9rem] font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
          aria-hidden
        >
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.95rem] font-semibold text-ink transition-colors duration-200 group-hover:text-[color:var(--sc-ink)] dark:group-hover:text-[color:var(--sc-ink-dark)]">
            {subject.name}
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            <span className="capitalize">{subject.grading_scale}</span> scale
            {subject.current_grade != null ? ` · now ${subject.current_grade}` : ""}
            {subject.target_grade != null ? ` · target ${subject.target_grade}` : ""}
          </p>
        </div>
      </div>

      {/* Footer: the single countdown, semantic-colored by exam urgency, plus the affordance. */}
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <span className={cn("inline-flex items-center gap-2 text-sm font-medium tabular-nums", urgencyText[u])}>
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", urgencyDot[u])} />
          {formatCountdown(days)}
        </span>
        <svg
          className="h-4 w-4 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[color:var(--sc-ink)] dark:group-hover:text-[color:var(--sc-ink-dark)]"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </Link>
  );
}

function SummaryStrip({ subjects }: { subjects: Subject[] }) {
  const urgent = subjects.filter((s) => {
    const d = daysUntil(s.exam_date);
    return d !== null && d >= 0 && d <= 3;
  }).length;
  const next = [...subjects].sort(byNearestExam).find((s) => {
    const d = daysUntil(s.exam_date);
    return d !== null && d >= 0;
  });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Badge tone="brand">
        {subjects.length} {subjects.length === 1 ? "subject" : "subjects"}
      </Badge>
      {next ? (
        <span className="text-sm text-muted">
          Next up <span className="font-medium text-ink-2">{next.name}</span>,{" "}
          {formatCountdown(daysUntil(next.exam_date))}
        </span>
      ) : null}
      {urgent > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {urgent} within 3 days
        </span>
      ) : null}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-card">
          <Skeleton className="h-24 rounded-none" />
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-4 h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubjectsList() {
  const { loading, error, data } = useAsync<Subject[]>(() => listSubjects(), []);

  return (
    <section>
      <div className="animate-rise mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Subjects</h1>
        <p className="mt-1 text-sm text-muted">Your courses, ordered by the nearest exam.</p>
        {data && data.length > 0 ? <SummaryStrip subjects={data} /> : null}
      </div>

      {loading ? <LoadingGrid /> : null}
      {error ? <ErrorBox message={error} /> : null}

      {data && data.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          hint="Add a subject in the iOS app, or open one here and upload material to generate a deck."
        />
      ) : null}

      {data && data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...data].sort(byNearestExam).map((s, i) => (
            <SubjectCard key={s.id} subject={s} index={i} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
