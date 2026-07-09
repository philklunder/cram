"use client";

// The Flashcards hub — browse, search and PRACTISE your cards.
//
// Practice is not progress. Flipping through a deck here records study time (so it feeds your
// streak) but never advances a card's SM-2 schedule and never moves mastery. The numbers on this
// page — mastery ring, Due today, Mastered — are written by a Review, which is the only place Cram
// measures what you know. See lib/readiness.ts.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  Pencil,
  Play,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { FlashcardPractice } from "@/components/FlashcardPractice";
import { PageHeader } from "@/components/pages/shared";
import { Badge, Button, EmptyState, ErrorBox, Skeleton, buttonClass, cn, difficultyTone, inputClass } from "@/components/ui";
import { listSources, loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Card, Exam, Source, Subject } from "@/lib/api/types";
import { computeProgress, type SubjectProgress } from "@/lib/progress";
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
const MASTERY_META: Record<Mastery, { label: string; bar: string; text: string; pct: number }> = {
  high: { label: "Mastered", bar: "bg-green-500", text: "text-green-600 dark:text-green-400", pct: 100 },
  medium: { label: "Learning", bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", pct: 55 },
  low: { label: "Needs work", bar: "bg-red-500", text: "text-red-600 dark:text-red-400", pct: 22 },
};

// The ring's number. Unlike "% of cards mastered" (which needs a card to reach a 21-day interval
// before it moves at all), this gives half credit for a card that's being learned, so a single
// honest Review visibly moves it. Matches the card-mastery term in lib/readiness.ts.
function masteryScore(p: SubjectProgress): number {
  return p.total === 0 ? 0 : Math.round(((p.mastered + 0.5 * p.learning) / p.total) * 100);
}

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
  const [difficulty, setDifficulty] = useState("all");
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
      if (difficulty !== "all" && String(c.difficulty) !== difficulty) return false;
      if (status !== "all" && cardMastery(c) !== status) return false;
      if (dueOnly && new Date(c.due_date).getTime() > now) return false;
      if (q && !(c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q)))
        return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort === "difficulty") return b.difficulty - a.difficulty;
      const d = a.created_at.localeCompare(b.created_at);
      return sort === "oldest" ? d : -d;
    });
    // `now` is deliberately not a dep — it's re-read on every render that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeCards, deckId, difficulty, status, dueOnly, query, sort]);

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
  const difficult = scopeCards.filter((c) => c.difficulty >= 4).length;
  const score = masteryScore(p);

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
        title="Flashcards"
        subtitle="Browse, search and cram your decks. Practice here is free — your progress is measured in Review."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
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

          {/* Stat cards — the current subject + exam scope. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat icon={Layers} tone="brand" value={p.total} label="Total cards" />
            <MiniStat icon={BookOpen} tone="amber" value={p.dueNow} label="Due today" />
            <MiniStat icon={Play} tone="green" value={p.mastered} label="Mastered" sub={`${p.masteredPct}%`} />
            <MiniStat
              icon={TriangleAlert}
              tone="red"
              value={difficult}
              label="Difficult"
              sub={p.total ? `${Math.round((difficult / p.total) * 100)}%` : "0%"}
            />
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
            <FilterSelect value={difficulty} onChange={reset(setDifficulty)} label="Difficulty">
              <option value="all">Any difficulty</option>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={String(d)}>
                  D{d}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={status} onChange={reset(setStatus)} label="Status">
              <option value="all">Any status</option>
              <option value="high">Mastered</option>
              <option value="medium">Learning</option>
              <option value="low">Needs work</option>
            </FilterSelect>
            <FilterSelect value={sort} onChange={reset(setSort)} label="Sort">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="difficulty">Hardest</option>
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

        {/* Rail */}
        <aside className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold tracking-tight text-ink">Your progress</h2>
            <p className="mb-4 truncate text-xs text-muted">
              {allSubjects ? "Across all subjects" : (scopeLabel(subjectExams, examScope) ?? scopeName)}
            </p>
            <div className="flex items-center gap-4">
              <ProgressRing pct={score} />
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                <LegendRow color="#16a34a" label="Mastered" value={p.mastered} />
                <LegendRow color="#f59e0b" label="Learning" value={p.learning} />
                <LegendRow color="#ef4444" label="Needs work" value={p.shaky} />
              </ul>
            </div>
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-subtle">
              Cramming doesn&rsquo;t change these.{" "}
              <Link href="/review" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                Run a Review
              </Link>{" "}
              to test yourself and move your mastery.
            </p>
          </div>

          {decks.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Decks in {subject!.name}</h2>
              <ul className="space-y-1">
                {decks.slice(0, 5).map((d) => {
                  const n = scopeCards.filter((c) => c.source_id === d.id).length;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDeckId(d.id);
                          setPage(0);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
                          <Layers className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{d.title}</span>
                        <span className="flex-none text-xs tabular-nums text-muted">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-5 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
              <h2 className="text-base font-semibold tracking-tight text-ink">Suggestions</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {p.dueNow > 0 ? (
                <li className="rounded-lg bg-surface/70 p-3">
                  <Link href="/review" className="text-sm font-medium text-ink hover:underline">
                    Clear today&rsquo;s backlog
                  </Link>
                  <p className="text-xs text-muted">
                    {p.dueNow} {p.dueNow === 1 ? "card is" : "cards are"} due in {scopeName}
                  </p>
                </li>
              ) : null}
              {p.shaky > 0 ? (
                <li className="rounded-lg bg-surface/70 p-3">
                  <p className="text-sm font-medium text-ink">Cram your weak cards</p>
                  <p className="text-xs text-muted">
                    {p.shaky} {p.shaky === 1 ? "card needs" : "cards need"} attention
                  </p>
                </li>
              ) : null}
              <li className="rounded-lg bg-surface/70 p-3">
                <Link href="/upload" className="text-sm font-medium text-ink hover:underline">
                  Generate more cards
                </Link>
                <p className="text-xs text-muted">Add material to deepen this subject</p>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CardRow({ card }: { card: Card }) {
  const m = MASTERY_META[cardMastery(card)];
  return (
    <li
      style={subjectVars(card.subject_id)}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{card.front}</p>
        <p className="mt-0.5 truncate text-sm text-muted">{card.back}</p>
        <span className="mt-2 inline-flex items-center rounded-full bg-[var(--sc-soft)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
          {card.topic}
        </span>
      </div>
      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <div className="w-28">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={cn("font-medium", m.text)}>{m.label}</span>
            <Badge tone={difficultyTone(card.difficulty)}>D{card.difficulty}</Badge>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className={cn("h-full rounded-full", m.bar)} style={{ width: `${m.pct}%` }} />
          </div>
        </div>
        <button
          type="button"
          title="Editing cards is coming soon"
          disabled
          className="inline-flex flex-none items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted opacity-60"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Edit
        </button>
      </div>
    </li>
  );
}

function MiniStat({
  icon: Icon,
  tone,
  value,
  label,
  sub,
}: {
  icon: typeof Layers;
  tone: "brand" | "amber" | "green" | "red";
  value: number;
  label: string;
  sub?: string;
}) {
  const chip =
    tone === "green"
      ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
      : tone === "amber"
        ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
        : tone === "red"
          ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
          : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300";
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", chip)}>
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
      <p className="mt-2.5 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums text-ink">{value}</span>
        {sub ? <span className="text-xs font-medium text-muted">{sub}</span> : null}
      </p>
      <p className="text-xs text-muted">{label}</p>
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

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-ink-2">{label}</span>
      <span className="flex-none font-semibold tabular-nums text-ink">{value}</span>
    </li>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 96,
    stroke = 10,
    r = (size - stroke) / 2,
    c = 2 * Math.PI * r,
    len = (pct / 100) * c;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(148 163 184 / 0.2)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#7c4dff"
            strokeWidth={stroke}
            strokeDasharray={`${len} ${c - len}`}
            strokeLinecap="round"
            className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-ink">{pct}%</span>
        <span className="text-[10px] text-muted">Mastery</span>
      </div>
    </div>
  );
}

export function FlashcardsHubPage({ scope }: { scope?: FlashcardsScope }) {
  const { loading, error, data } = useAsync(() => Promise.all([loadDashboard(), listSources()]), []);
  // Practice writes nothing this page displays, so there's no refetch after a session — and hence
  // no way for a reload to unmount the view and re-trigger the `?start=1` auto-open.
  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
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
