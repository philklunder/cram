"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

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
  urgent: "text-red-600",
  soon: "text-amber-600",
  far: "text-[color:var(--sc-ink)]",
  past: "text-gray-400",
  none: "text-gray-400",
};
const urgencyDot: Record<Urgency, string> = {
  urgent: "bg-red-500",
  soon: "bg-amber-500",
  far: "bg-[var(--sc-solid)]",
  past: "bg-gray-300",
  none: "bg-gray-300",
};

// Compact countdown for the frosted chip on the gradient header.
function shortCountdown(days: number | null): string {
  if (days === null) return "No date";
  if (days === 0) return "Today";
  if (days < 0) return "Past";
  return `${days}d`;
}

function byNearestExam(a: Subject, b: Subject): number {
  const da = daysUntil(a.exam_date);
  const db = daysUntil(b.exam_date);
  if (da === null) return 1;
  if (db === null) return -1;
  return da - db;
}

function SubjectCard({ subject, index }: { subject: Subject; index: number }) {
  const reduce = useReducedMotion();
  const days = daysUntil(subject.exam_date);
  const u = urgency(days);

  return (
    <motion.div
      style={subjectVars(subject.id)}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay: Math.min(index, 10) * 0.05 }}
    >
      <Link
        href={`/subjects/${subject.id}`}
        className={cn(
          "group relative block overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-card",
          "transition duration-300 ease-out hover:-translate-y-1 hover:border-[var(--sc-line)]",
          "hover:shadow-[0_20px_44px_-14px_rgb(var(--sc-glow)_/_0.5)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2",
        )}
      >
        {/* Gradient header — the subject's identity. Full band (not a side-stripe): monogram left,
            frosted exam-countdown chip right. */}
        <div className="relative flex h-24 items-center justify-between overflow-hidden px-5 [background-image:linear-gradient(135deg,var(--sc-from),var(--sc-to))]">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-white/25 blur-2xl transition-transform duration-500 ease-out group-hover:scale-125"
          />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold text-white ring-1 ring-inset ring-white/40 backdrop-blur-sm">
            {subjectInitials(subject.name)}
          </span>
          <span className="relative inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/30 backdrop-blur-sm">
            {shortCountdown(days)}
          </span>
        </div>

        {/* Body */}
        <div className="p-5">
          <h3 className="truncate text-base font-semibold text-gray-900 transition-colors duration-200 group-hover:text-[color:var(--sc-ink)]">
            {subject.name}
          </h3>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            <span className="capitalize">{subject.grading_scale}</span> scale
            {subject.current_grade != null ? ` · now ${subject.current_grade}` : ""}
            {subject.target_grade != null ? ` · target ${subject.target_grade}` : ""}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className={cn("inline-flex items-center gap-2 text-sm font-medium tabular-nums", urgencyText[u])}>
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", urgencyDot[u])} />
              {formatCountdown(days)}
            </span>
            <svg
              className="h-4 w-4 text-gray-300 transition group-hover:translate-x-1 group-hover:text-[color:var(--sc-ink)]"
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
        </div>
      </Link>
    </motion.div>
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
        <span className="text-sm text-gray-500">
          Next up <span className="font-medium text-gray-700">{next.name}</span>,{" "}
          {formatCountdown(daysUntil(next.exam_date))}
        </span>
      ) : null}
      {urgent > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
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
        <div key={i} className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-card">
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
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Subjects</h1>
        <p className="mt-1 text-sm text-gray-500">Your courses, ordered by the nearest exam.</p>
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
