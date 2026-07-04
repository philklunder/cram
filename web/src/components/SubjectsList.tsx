"use client";

import Link from "next/link";

import { EmptyState, ErrorBox, Skeleton, cn } from "@/components/ui";
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
        // A hairline of the subject accent along the top edge — subtle at rest, full on hover — so
        // the card carries its identity without a heavy color band. (Top edge, not a side-stripe.)
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[var(--sc-solid)] before:opacity-40 before:transition-opacity before:duration-200 group-hover:before:opacity-100",
        "transition duration-200 ease-out hover:-translate-y-1 hover:border-[var(--sc-line)] hover:shadow-card-hover",
        "dark:hover:border-[color:var(--sc-solid)]/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
      )}
    >
      {/* Header: a confident per-subject identity tile + the subject name and scale/grade meta. The
          subject color lives in the tile, the top hairline, and the hover accent — the surface
          itself stays neutral. */}
      <div className="flex items-start gap-4 px-5 pb-4 pt-5">
        <span
          className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-base font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] transition-transform duration-200 group-hover:scale-[1.04] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
          aria-hidden
        >
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-ink transition-colors duration-200 group-hover:text-[color:var(--sc-ink)] dark:group-hover:text-[color:var(--sc-ink-dark)]">
            {subject.name}
          </h3>
          <p className="mt-1 truncate text-sm text-muted">
            <span className="capitalize">{subject.grading_scale}</span> scale
            {subject.current_grade != null ? ` · now ${subject.current_grade}` : ""}
            {subject.target_grade != null ? ` · target ${subject.target_grade}` : ""}
          </p>
        </div>
      </div>

      {/* Footer: the single countdown, semantic-colored by exam urgency, plus the affordance. */}
      <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
        <span className={cn("inline-flex items-center gap-2 text-sm font-semibold tabular-nums", urgencyText[u])}>
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", urgencyDot[u])} />
          {formatCountdown(days)}
        </span>
        <svg
          className="h-4 w-4 text-subtle transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[color:var(--sc-ink)] dark:group-hover:text-[color:var(--sc-ink-dark)]"
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

// A compact, inline stat strip (no boxes) — the "at a glance" read that opens the overview.
// Numbers are the emphasis; labels sit under them. Adapted from the flat Linear-style KPI-strip
// pattern rather than boxed stat cards, so it stays quiet against the card grid below.
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
    <dl className="mt-6 flex flex-wrap items-stretch gap-x-8 gap-y-4">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subjects</dt>
        <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{subjects.length}</dd>
      </div>

      {next ? (
        <div className="border-l border-line pl-8">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Next exam</dt>
          <dd className="mt-0.5 flex items-baseline gap-2 text-sm">
            <span className="max-w-[16ch] truncate font-semibold text-ink">{next.name}</span>
            <span className="tabular-nums text-muted">{formatCountdown(daysUntil(next.exam_date))}</span>
          </dd>
        </div>
      ) : null}

      {urgent > 0 ? (
        <div className="border-l border-line pl-8">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Within 3 days</dt>
          <dd className="mt-0.5 inline-flex items-center gap-2 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
            <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
            {urgent}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-start gap-4 px-5 pb-4 pt-5">
            <Skeleton className="h-12 w-12 flex-none rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="border-t border-line px-5 py-3.5">
            <Skeleton className="h-3.5 w-24" />
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
      <header className="animate-rise mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Subjects</h1>
        <p className="mt-2 max-w-prose text-[0.95rem] text-ink-2">
          Your courses, ordered by the nearest exam.
        </p>
        {data && data.length > 0 ? <SummaryStrip subjects={data} /> : null}
      </header>

      {loading ? <LoadingGrid /> : null}
      {error ? <ErrorBox message={error} /> : null}

      {data && data.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          hint="Add a subject in the iOS app, or open one here and upload material to generate a deck."
        />
      ) : null}

      {data && data.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...data].sort(byNearestExam).map((s, i) => (
            <SubjectCard key={s.id} subject={s} index={i} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
