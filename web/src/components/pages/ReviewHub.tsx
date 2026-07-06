"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Play, RefreshCw } from "lucide-react";

import { ReviewSession, type ReviewCardContext } from "@/components/ReviewSession";
import { PageHeader } from "@/components/pages/shared";
import { Badge, Button, EmptyState, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Card, Subject } from "@/lib/api/types";
import { computeStreak } from "@/lib/dashboard";
import { daysUntil, formatCountdown, subjectInitials } from "@/lib/format";
import { subjectStrength } from "@/lib/srs/grade-strength";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

interface Row {
  subject: Subject;
  due: number;
  total: number;
  days: number | null;
}

function rows(subjects: Subject[], cards: Card[], now: number): Row[] {
  return subjects
    .map((subject) => {
      const own = cards.filter((c) => c.subject_id === subject.id);
      const due = own.filter((c) => new Date(c.due_date).getTime() <= now).length;
      return { subject, due, total: own.length, days: daysUntil(subject.exam_date) };
    })
    .filter((r) => r.total > 0)
    .sort(
      (a, b) =>
        b.due - a.due ||
        (a.days ?? 1e9) - (b.days ?? 1e9) ||
        a.subject.name.localeCompare(b.subject.name),
    );
}

// The hub: subjects to review + a prominent "start a cross-subject session" CTA.
export function ReviewHubView({
  subjects,
  cards,
  now = Date.now(),
  onStart,
}: {
  subjects: Subject[];
  cards: Card[];
  now?: number;
  onStart?: () => void;
}) {
  const list = rows(subjects, cards, now);
  const totalDue = list.reduce((n, r) => n + r.due, 0);

  return (
    <section>
      <PageHeader
        title="Review"
        subtitle="Run a spaced-repetition session across everything due, or pick a single subject."
        action={
          totalDue > 0 && onStart ? (
            <Button onClick={onStart}>
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Start review · {totalDue} due
            </Button>
          ) : (
            <Badge tone="green">All caught up</Badge>
          )
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="No cards to review yet"
          hint="Upload material to a subject to generate a deck, then come back to review it."
        />
      ) : (
        <ul className="space-y-3">
          {list.map(({ subject, due, total, days }) => (
            <li key={subject.id}>
              <Link
                href={`/subjects/${subject.id}`}
                style={subjectVars(subject.id)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--sc-line)] hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:border-[color:var(--sc-solid)]/45"
              >
                <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-sm font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25">
                  {subjectInitials(subject.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{subject.name}</p>
                  <p className="text-sm text-muted">
                    <span className="tabular-nums">{total}</span> card{total === 1 ? "" : "s"}
                    <span aria-hidden> · </span>
                    <span className="tabular-nums">{formatCountdown(days)}</span>
                  </p>
                </div>
                <span className={cn("flex-none text-sm font-semibold tabular-nums", due > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted")}>
                  {due > 0 ? `${due} due` : "0 due"}
                </span>
                <span className="hidden flex-none rounded-lg bg-[var(--sc-soft)] px-3 py-1.5 text-sm font-medium text-[color:var(--sc-ink)] transition group-hover:bg-[var(--sc-solid)] group-hover:text-white sm:inline-flex dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:group-hover:text-white">
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    Review
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-subtle transition-transform group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The /review route: hub → cross-subject session and back.
export function ReviewHubPage() {
  const { loading, error, data, reload } = useAsync(() => loadDashboard(), []);
  const [active, setActive] = useState(false);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const now = Date.now();
  const dueCards = data.cards.filter((c) => new Date(c.due_date).getTime() <= now);
  const streak = computeStreak(data.reviewLogs, now).current;

  if (active && dueCards.length > 0) {
    return (
      <ReviewSession
        cards={dueCards}
        streak={streak}
        contextFor={(card) => contextFor(data, card)}
        onClose={() => setActive(false)}
        onReviewed={reload}
      />
    );
  }

  return (
    <ReviewHubView
      subjects={data.subjects}
      cards={data.cards}
      now={now}
      onStart={dueCards.length > 0 ? () => setActive(true) : undefined}
    />
  );
}

function contextFor(data: DashboardData, card: Card): ReviewCardContext {
  const subject = data.subjects.find((s) => s.id === card.subject_id)!;
  const entries = data.gradeEntries.filter((e) => e.subject_id === subject.id);
  return {
    subject,
    examDate: subject.exam_date,
    strength: subjectStrength(subject.grading_scale, subject.current_grade, entries),
  };
}
