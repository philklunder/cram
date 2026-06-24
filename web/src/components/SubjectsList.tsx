"use client";

import Link from "next/link";

import { Badge, EmptyState, ErrorBox, PageLoader, cn } from "@/components/ui";
import { listSubjects } from "@/lib/api/client";
import type { Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

type Urgency = "none" | "far" | "soon" | "urgent" | "past";

function urgency(days: number | null): Urgency {
  if (days === null) return "none";
  if (days < 0) return "past";
  if (days <= 3) return "urgent";
  if (days <= 10) return "soon";
  return "far";
}

const accentClass: Record<Urgency, string> = {
  urgent: "before:bg-red-500",
  soon: "before:bg-amber-400",
  far: "before:bg-brand-500",
  past: "before:bg-gray-300",
  none: "before:bg-gray-200",
};

const badgeTone: Record<Urgency, "neutral" | "brand" | "amber" | "red"> = {
  urgent: "red",
  soon: "amber",
  far: "brand",
  past: "neutral",
  none: "neutral",
};

function SubjectRow({ subject }: { subject: Subject }) {
  const days = daysUntil(subject.exam_date);
  const u = urgency(days);

  return (
    <Link
      href={`/subjects/${subject.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-gray-200/80 bg-white p-5 pl-6 shadow-card transition",
        "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:content-['']",
        "hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-card-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        accentClass[u],
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-brand-700">
            {subject.name}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            <span className="capitalize">{subject.grading_scale}</span> scale
            {subject.current_grade != null ? ` · current ${subject.current_grade}` : ""}
            {subject.target_grade != null ? ` · target ${subject.target_grade}` : ""}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <Badge tone={badgeTone[u]}>{formatCountdown(days)}</Badge>
          <svg
            className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-400"
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
  );
}

export function SubjectsList() {
  const { loading, error, data } = useAsync<Subject[]>(() => listSubjects(), []);

  return (
    <section className="animate-rise">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Subjects</h1>
        <p className="mt-1 text-sm text-gray-500">Your courses, ordered by the nearest exam.</p>
      </div>

      {loading ? <PageLoader label="Loading subjects…" /> : null}
      {error ? <ErrorBox message={error} /> : null}

      {data && data.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          hint="Add a subject in the iOS app, or open one here and upload material to generate a deck."
        />
      ) : null}

      {data && data.length > 0 ? (
        <div className="grid gap-3">
          {[...data]
            .sort((a, b) => {
              const da = daysUntil(a.exam_date);
              const db = daysUntil(b.exam_date);
              if (da === null) return 1;
              if (db === null) return -1;
              return da - db;
            })
            .map((s) => (
              <SubjectRow key={s.id} subject={s} />
            ))}
        </div>
      ) : null}
    </section>
  );
}
