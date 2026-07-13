"use client";

// The Flashcards hub — browse, search and PRACTISE your cards.
//
// Practice is not progress. Flipping through a deck here records study time (so it feeds your
// streak) but never advances a card's SM-2 schedule and never moves mastery. The numbers on this
// page — mastery ring, Due today, Mastered — are written by a Review, which is the only place Cram
// measures what you know. See lib/readiness.ts.

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Play, Search, Sparkles } from "lucide-react";

import { FlashcardPractice } from "@/components/FlashcardPractice";
import { PageHeader } from "@/components/pages/shared";
import { Button, EmptyState, ErrorBox, Skeleton, buttonClass, cn, inputClass } from "@/components/ui";
import { listSources, loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Card, Exam, Source, Subject } from "@/lib/api/types";
import { computeProgress } from "@/lib/progress";
import { WHOLE_SUBJECT, examsForSubject, inExamScope, scopeLabel } from "@/lib/scope";
import { subjectVars } from "@/lib/subjectColor";
import { ALL_SUBJECTS } from "@/lib/studyLink";
import { useAsync } from "@/lib/useAsync";

type Mastery = "high" | "medium" | "low";

// Same three buckets lib/progress.ts counts with, applied to a single card.
function cardMastery(c: Card): Mastery {
  if (c.repetitions >= 2 && c.interval_days >= 21) return "high";
  if (c.lapses > 0 || c.repetitions === 0) return "low";
  return "medium";
}
// A three-state chip, no internal SM-2 scalar. `chip` is a full pill (surface tint + ring) shown on
// each card row; `text` is the bare coloured label reused where a pill would be too heavy.
const MASTERY_META: Record<Mastery, { label: string; chip: string; text: string }> = {
  high: {
    label: "Mastered",
    chip: "bg-green-50 text-green-700 ring-green-600/15 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/20",
    text: "text-green-600 dark:text-green-400",
  },
  medium: {
    label: "Learning",
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
    text: "text-amber-600 dark:text-amber-400",
  },
  low: {
    label: "Shaky",
    chip: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/20",
    text: "text-red-600 dark:text-red-400",
  },
};

// Weakest → strongest, for the "Weakest first" sort.
const MASTERY_RANK: Record<Mastery, number> = { low: 0, medium: 1, high: 2 };

const PAGE_SIZE = 8;

export interface FlashcardsScope {
  subjectId?: string; // a subject id, or ALL_SUBJECTS
  examScope?: string; // an exam id, GENERAL_SCOPE, or WHOLE_SUBJECT
  dueOnly?: boolean;
  autoStart?: boolean; // arrive straight in a practice session (Subject page "Study" links)
}

export function FlashcardsView({
  subjects,
  exams,
  cards,
  sources,
  scope,
}: {
  subjects: Subject[];
  exams: Exam[];
  cards: Card[];
  sources: Source[];
  scope?: FlashcardsScope;
}) {
  const subjectsWithCards = useMemo(
    () => subjects.filter((s) => cards.some((c) => c.subject_id === s.id)),
    [subjects, cards],
  );

  // A subject deep-linked from elsewhere wins, but only if it actually has cards to show.
  const requested = scope?.subjectId;
  const initialSubject =
    requested === ALL_SUBJECTS || (requested && subjectsWithCards.some((s) => s.id === requested))
      ? requested
      : (subjectsWithCards[0]?.id ?? "");

  const [subjectId, setSubjectId] = useState(initialSubject);
  const [examScope, setExamScope] = useState(scope?.examScope ?? WHOLE_SUBJECT);
  const [deckId, setDeckId] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dueOnly, setDueOnly] = useState(scope?.dueOnly ?? false);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [practising, setPractising] = useState<Card[] | null>(null);

  const allSubjects = subjectId === ALL_SUBJECTS;
  const subject = allSubjects ? null : (subjects.find((s) => s.id === subjectId) ?? subjectsWithCards[0] ?? null);

  // Cards in the current subject + exam scope. Stats and the progress ring read this — NOT the
  // fully-filtered list, so searching for one card doesn't rewrite your mastery.
  const scopeCards = useMemo(() => {
    const inSubject = allSubjects ? cards : cards.filter((c) => c.subject_id === subject?.id);
    return allSubjects ? inSubject : inSubject.filter((c) => inExamScope(c.exam_id, examScope));
  }, [cards, subject, allSubjects, examScope]);

  const subjectExams = useMemo(
    () => (allSubjects ? [] : examsForSubject(exams, subject?.id ?? null)),
    [exams, subject, allSubjects],
  );
  const decks = useMemo(
    () => (allSubjects ? [] : sources.filter((s) => s.subject_id === subject?.id)),
    [sources, subject, allSubjects],
  );

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  const now = Date.now();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = scopeCards.filter((c) => {
      if (deckId !== "all" && c.source_id !== deckId) return false;
      if (status !== "all" && cardMastery(c) !== status) return false;
      if (dueOnly && new Date(c.due_date).getTime() > now) return false;
      if (q && !(c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q)))
        return false;
      return true;
    });
    return out.sort((a, b) => {
      // "Weakest first" sorts by mastery bucket (shaky → learning → mastered), a user-facing
      // signal, not the internal SM-2 difficulty scalar the D1–D5 codes exposed.
      if (sort === "weakest") return MASTERY_RANK[cardMastery(a)] - MASTERY_RANK[cardMastery(b)];
      const d = a.created_at.localeCompare(b.created_at);
      return sort === "oldest" ? d : -d;
    });
    // `now` is deliberately not a dep — it's re-read on every render that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeCards, deckId, status, dueOnly, query, sort]);

  // Arriving from a Subject-page "Study" deep-link opens practice once. The guard must survive a
  // re-render, or Exit would land on a page whose `?start=1` is still in the URL and immediately
  // re-open the session.
  const [autoStarted, setAutoStarted] = useState(false);
  if (scope?.autoStart && !autoStarted && !practising && filtered.length > 0) {
    setAutoStarted(true);
    setPractising(filtered);
  }

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const p = computeProgress(scopeCards);

  if (subjectsWithCards.length === 0) {
    return (
      <section>
        <PageHeader title="Flashcards" subtitle="Study your decks, track mastery, and remember more." />
        <EmptyState title="No cards yet" hint="Upload material to a subject to generate your first deck." />
      </section>
    );
  }

  if (practising) {
    return (
      <section style={subjectVars(subject?.id ?? "cram")}>
        <FlashcardPractice
          cards={practising}
          title={allSubjects ? "All subjects" : subject!.name}
          subtitle={
            allSubjects
              ? "Cards across your subjects"
              : (scopeLabel(subjectExams, examScope) ?? "All cards in this subject")
          }
          subjectId={allSubjects ? null : subject!.id}
          onClose={() => setPractising(null)}
        />
      </section>
    );
  }

  const scopeName = allSubjects ? "all subjects" : subject!.name;

  return (
    <section style={subjectVars(subject?.id ?? "cram")}>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            Flashcards
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line">
              Free practice · doesn&rsquo;t change your score
            </span>
          </span>
        }
        subtitle="Browse, search and cram every card you own. To move your readiness, run a Review instead."
      />

      <div className="space-y-5">
        {/* Selectors + actions */}
        <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[130px] flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">Subject</span>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setExamScope(WHOLE_SUBJECT);
                  setDeckId("all");
                  setPage(0);
                }}
                className={cn(inputClass, "mt-0")}
              >
                <option value={ALL_SUBJECTS}>All subjects</option>
                {subjectsWithCards.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {subjectExams.length > 0 ? (
              <label className="min-w-[130px] flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">Exam</span>
                <select
                  value={examScope}
                  onChange={(e) => {
                    setExamScope(e.target.value);
                    setPage(0);
                  }}
                  className={cn(inputClass, "mt-0")}
                >
                  <option value={WHOLE_SUBJECT}>Whole subject</option>
                  {subjectExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title}
                    </option>
                  ))}
                  <option value="__general__">General (no exam)</option>
                </select>
              </label>
            ) : null}
            {decks.length > 0 ? (
              <label className="min-w-[130px] flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">Deck</span>
                <select
                  value={deckId}
                  onChange={(e) => {
                    setDeckId(e.target.value);
                    setPage(0);
                  }}
                  className={cn(inputClass, "mt-0")}
                >
                  <option value="all">All decks</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button className="flex-none" onClick={() => setPractising(filtered)} disabled={filtered.length === 0}>
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Cram {filtered.length}
            </Button>
            <Link href="/upload" className={cn(buttonClass("secondary", "md"), "flex-none")}>
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden /> Generate
            </Link>
          </div>

          {/* Figures for the current subject + exam scope, as one hairline strip (matches the
              dashboard). Colour is quality only: Mastered green, Shaky red; Total and Due are
              neutral counts. Reads scopeCards, never the filtered list, so searching one card
              never rewrites these. */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="-m-px grid grid-cols-2 sm:grid-cols-4">
              <Figure value={p.total} label={`Cards in ${scopeName}`} />
              <Figure value={p.dueNow} label="Due now" foot={p.dueNow > 0 ? "Cram or review them" : "All caught up"} />
              <Figure value={p.mastered} sub={p.total ? `${p.masteredPct}%` : undefined} label="Mastered" tone="green" />
              <Figure value={p.shaky} label="Shaky" tone="red" foot={p.shaky > 0 ? "Needs attention" : "None"} />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search cards…"
                aria-label="Search cards"
                className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink shadow-sm transition placeholder:text-subtle hover:border-line-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <button
              type="button"
              aria-pressed={dueOnly}
              onClick={() => {
                setDueOnly((v) => !v);
                setPage(0);
              }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                dueOnly
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
                  : "border-line bg-surface text-ink-2 hover:border-line-strong",
              )}
            >
              <BookOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Due only
            </button>
            <FilterSelect value={status} onChange={reset(setStatus)} label="Status">
              <option value="all">Any status</option>
              <option value="high">Mastered</option>
              <option value="medium">Learning</option>
              <option value="low">Shaky</option>
            </FilterSelect>
            <FilterSelect value={sort} onChange={reset(setSort)} label="Sort">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="weakest">Weakest first</option>
            </FilterSelect>
          </div>

          {/* Card list */}
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-6 py-10 text-center text-sm text-muted">
              {dueOnly && scopeCards.length > 0
                ? "Nothing is due here right now. Turn off “Due only” to study ahead."
                : "No cards match your filters."}
            </p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {pageItems.map((c) => (
                  <CardRow key={c.id} card={c} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted tabular-nums">
                  Showing {page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}
                </p>
                {pages > 1 ? (
                  <div className="flex items-center gap-1">
                    <PageBtn disabled={page === 0} onClick={() => setPage((v) => v - 1)}>
                      <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                    </PageBtn>
                    <span className="px-2 text-sm tabular-nums text-ink-2">
                      {page + 1} / {pages}
                    </span>
                    <PageBtn disabled={page >= pages - 1} onClick={() => setPage((v) => v + 1)}>
                      <ChevronRight className="h-4 w-4" strokeWidth={2} />
                    </PageBtn>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
    </section>
  );
}

// A card is one dense row: front + answer + topic on the left, a three-state mastery chip and Edit
// on the right. The old D1–D5 badge and the per-card progress bar are gone — the internal SM-2
// difficulty scalar meant nothing to a learner, and the bar restated the chip in twelve tiny copies.
function CardRow({ card }: { card: Card }) {
  const m = MASTERY_META[cardMastery(card)];
  return (
    <li className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{card.front}</p>
        <p className="mt-0.5 truncate text-sm text-muted">{card.back}</p>
        {/* Topic is a neutral pill, not the subject accent: this is a single-subject view (no
            monogram), and a rose subject tint sat right beside the red "Shaky" chip. */}
        <span className="mt-2 inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
          {card.topic}
        </span>
      </div>
      <span className={cn("flex-none rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", m.chip)}>
        {m.label}
      </span>
    </li>
  );
}

// Icon-less figure cell for the strip (mirrors the dashboard). Colour is quality only, applied to
// the value; the label and foot stay muted.
function Figure({
  value,
  sub,
  label,
  foot,
  tone,
}: {
  value: number | string;
  sub?: string;
  label: string;
  foot?: string;
  tone?: "green" | "red";
}) {
  const color = tone === "green" ? "text-green-600 dark:text-green-400" : tone === "red" ? "text-red-600 dark:text-red-400" : "text-ink";
  return (
    <div className="border-l border-t border-line p-4">
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tabular-nums", color)}>{value}</span>
        {sub ? <span className="text-sm font-medium text-muted">{sub}</span> : null}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
      {foot ? <div className="mt-1.5 min-h-[16px] text-[11px] font-medium text-muted">{foot}</div> : null}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 shadow-sm transition hover:border-line-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
    >
      {children}
    </select>
  );
}

function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-2 transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export function FlashcardsHubPage({ scope }: { scope?: FlashcardsScope }) {
  const { loading, error, data } = useAsync(() => Promise.all([loadDashboard(), listSources()]), []);
  // Practice writes nothing this page displays, so there's no refetch after a session — and hence
  // no way for a reload to unmount the view and re-trigger the `?start=1` auto-open.
  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const [dash, sources]: [DashboardData, Source[]] = data;
  return <FlashcardsView subjects={dash.subjects} exams={dash.exams} cards={dash.cards} sources={sources} scope={scope} />;
}

// Back-compat export name used by the /preview harness.
export { FlashcardsView as FlashcardsHubView };
