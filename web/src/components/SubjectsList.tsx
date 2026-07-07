"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { SubjectFormModal } from "@/components/SubjectFormModal";
import { Button, EmptyState, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadLibrary, type LibraryData } from "@/lib/api/client";
import type { Card, Subject } from "@/lib/api/types";
import { subjectInitials } from "@/lib/format";
import { computeProgress } from "@/lib/progress";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

// Subjects with the most cards due first (what needs attention), then alphabetically. Exam dates
// no longer sort the list — a subject spans many exams, so "nearest exam" isn't a subject property.
function byAttention(cardsBySubject: Map<string, Card[]>) {
  return (a: Subject, b: Subject): number => {
    const da = computeProgress(cardsBySubject.get(a.id) ?? []).dueNow;
    const db = computeProgress(cardsBySubject.get(b.id) ?? []).dueNow;
    if (da !== db) return db - da;
    return a.name.localeCompare(b.name);
  };
}

export function SubjectCard({ subject, cards, index }: { subject: Subject; cards: Card[]; index: number }) {
  const p = computeProgress(cards);
  const share = (n: number) => (p.total === 0 ? 0 : (n / p.total) * 100);

  return (
    // Entrance is a one-shot CSS fade-up (staggered by index) — declarative, so the resting state
    // is visible even before JS hydrates and it never ships blank in a headless render.
    <Link
      href={`/subjects/${subject.id}`}
      style={{ ...subjectVars(subject.id), animationDelay: `${Math.min(index, 12) * 45}ms` }}
      className={cn(
        "animate-fade-up group relative block overflow-hidden rounded-xl border border-line bg-surface shadow-card",
        // A hairline of the subject accent along the top edge — subtle at rest, full on hover.
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[var(--sc-solid)] before:opacity-40 before:transition-opacity before:duration-200 group-hover:before:opacity-100",
        "transition duration-200 ease-out hover:-translate-y-1 hover:border-[var(--sc-line)] hover:shadow-card-hover",
        "dark:hover:border-[color:var(--sc-solid)]/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
      )}
    >
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-start gap-4">
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
              {subject.target_grade != null ? ` · target ${subject.target_grade}` : ""}
            </p>
          </div>
        </div>

        {/* Mastery composition at a glance — mastered / learning / shaky. Only when there are cards. */}
        {p.total > 0 ? (
          <div
            className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-line"
            role="img"
            aria-label={`${p.mastered} mastered, ${p.learning} learning, ${p.shaky} shaky of ${p.total} cards`}
          >
            <span className="bg-green-500" style={{ width: `${share(p.mastered)}%` }} />
            <span className="bg-amber-400" style={{ width: `${share(p.learning)}%` }} />
            <span className="bg-red-500" style={{ width: `${share(p.shaky)}%` }} />
          </div>
        ) : null}
      </div>

      {/* Footer: learning status instead of an exam countdown — mastery + how many are due now. */}
      <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
        {p.total === 0 ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-line-strong" />
            No cards yet
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-medium tabular-nums text-ink-2">
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", p.dueNow > 0 ? "bg-amber-500" : "bg-green-500")} />
            {p.masteredPct}% mastered
            {p.dueNow > 0 ? (
              <span className="font-semibold text-amber-700 dark:text-amber-400">· {p.dueNow} due</span>
            ) : null}
          </span>
        )}
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

// A compact, inline stat strip (no boxes) — the "at a glance" read that opens the list. Built from
// the aggregate SM-2 state across every subject, so it stays meaningful without exam dates.
function SummaryStrip({ subjects, cards }: { subjects: Subject[]; cards: Card[] }) {
  const overall = computeProgress(cards);
  return (
    <dl className="mt-6 flex flex-wrap items-stretch gap-x-8 gap-y-4">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subjects</dt>
        <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{subjects.length}</dd>
      </div>
      <div className="border-l border-line pl-8">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Due now</dt>
        <dd
          className={cn(
            "mt-0.5 inline-flex items-center gap-2 text-2xl font-bold tabular-nums",
            overall.dueNow > 0 ? "text-amber-600 dark:text-amber-400" : "text-ink",
          )}
        >
          {overall.dueNow > 0 ? <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" /> : null}
          {overall.dueNow}
        </dd>
      </div>
      {cards.length > 0 ? (
        <div className="border-l border-line pl-8">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Mastery</dt>
          <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{overall.masteredPct}%</dd>
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
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 flex-none rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="mt-4 h-1.5 w-full" />
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
  const { loading, error, data, reload } = useAsync<LibraryData>(() => loadLibrary(), []);
  const [creating, setCreating] = useState(false);

  const cardsBySubject = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of data?.cards ?? []) {
      const list = map.get(c.subject_id);
      if (list) list.push(c);
      else map.set(c.subject_id, [c]);
    }
    return map;
  }, [data?.cards]);

  const subjects = data?.subjects ?? [];
  const sorted = useMemo(() => [...subjects].sort(byAttention(cardsBySubject)), [subjects, cardsBySubject]);

  return (
    <section>
      <header className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Subjects</h1>
          <p className="mt-2 max-w-prose text-[0.95rem] text-ink-2">
            Your courses. Open one to study it, add material, or track grades.
          </p>
          {data && subjects.length > 0 ? <SummaryStrip subjects={subjects} cards={data.cards} /> : null}
        </div>
        <Button onClick={() => setCreating(true)} className="flex-none">
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          New subject
        </Button>
      </header>

      {loading ? <LoadingGrid /> : null}
      {error ? <ErrorBox message={error} /> : null}

      {data && subjects.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          hint="Create your first subject, then generate flashcards and quizzes from your notes."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              New subject
            </Button>
          }
        />
      ) : null}

      {data && subjects.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((s, i) => (
            <SubjectCard key={s.id} subject={s} cards={cardsBySubject.get(s.id) ?? []} index={i} />
          ))}
        </div>
      ) : null}

      <SubjectFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => reload()}
      />
    </section>
  );
}
