"use client";

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

import { PageHeader } from "@/components/pages/shared";
import { Badge, Button, EmptyState, ErrorBox, Skeleton, cn, difficultyTone, inputClass } from "@/components/ui";
import { listSources, loadLibrary } from "@/lib/api/client";
import type { Card, Source, Subject } from "@/lib/api/types";
import { subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

type Mastery = "high" | "medium" | "low";
function cardMastery(c: Card): Mastery {
  if (c.lapses > 0 || c.repetitions === 0) return "low";
  if (c.repetitions >= 2 && c.interval_days >= 21) return "high";
  return "medium";
}
const MASTERY_META: Record<Mastery, { label: string; bar: string; text: string; pct: number }> = {
  high: { label: "High", bar: "bg-green-500", text: "text-green-600 dark:text-green-400", pct: 100 },
  medium: { label: "Medium", bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", pct: 55 },
  low: { label: "Low", bar: "bg-red-500", text: "text-red-600 dark:text-red-400", pct: 22 },
};

const PAGE_SIZE = 8;

export function FlashcardsView({ subjects, cards, sources }: { subjects: Subject[]; cards: Card[]; sources: Source[] }) {
  const subjectsWithCards = useMemo(
    () => subjects.filter((s) => cards.some((c) => c.subject_id === s.id)),
    [subjects, cards],
  );
  const [subjectId, setSubjectId] = useState(subjectsWithCards[0]?.id ?? "");
  const [deckId, setDeckId] = useState("all");
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);

  const subject = subjects.find((s) => s.id === subjectId) ?? subjectsWithCards[0];
  const subjectCards = useMemo(() => cards.filter((c) => c.subject_id === subject?.id), [cards, subject]);
  const decks = useMemo(() => sources.filter((s) => s.subject_id === subject?.id), [sources, subject]);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = subjectCards.filter((c) => {
      if (deckId !== "all" && c.source_id !== deckId) return false;
      if (difficulty !== "all" && String(c.difficulty) !== difficulty) return false;
      if (status !== "all" && cardMastery(c) !== status) return false;
      if (q && !(c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q))) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "difficulty") return b.difficulty - a.difficulty;
      const d = a.created_at.localeCompare(b.created_at);
      return sort === "oldest" ? d : -d;
    });
    return out;
  }, [subjectCards, deckId, difficulty, status, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Stats for the selected subject.
  const now = Date.now();
  const total = subjectCards.length;
  const due = subjectCards.filter((c) => new Date(c.due_date).getTime() <= now).length;
  const mastered = subjectCards.filter((c) => cardMastery(c) === "high").length;
  const difficult = subjectCards.filter((c) => c.difficulty >= 4).length;
  const newCount = subjectCards.filter((c) => c.repetitions === 0).length;
  const learning = Math.max(0, total - mastered - newCount);
  const masteredPct = total ? Math.round((mastered / total) * 100) : 0;

  if (subjectsWithCards.length === 0) {
    return (
      <section>
        <PageHeader title="Flashcards" subtitle="Study your decks, track mastery, and remember more." />
        <EmptyState title="No cards yet" hint="Upload material to a subject to generate your first deck." />
      </section>
    );
  }

  return (
    <section style={subjectVars(subject!.id)}>
      <PageHeader title="Flashcards" subtitle="Study your decks, track mastery, and remember more." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* Selectors + actions */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[140px] flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">Subject</span>
              <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setDeckId("all"); setPage(0); }} className={cn(inputClass, "mt-0")}>
                {subjectsWithCards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="min-w-[140px] flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">Deck</span>
              <select value={deckId} onChange={(e) => { setDeckId(e.target.value); setPage(0); }} className={cn(inputClass, "mt-0")}>
                <option value="all">All decks</option>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            <Link href={`/subjects/${subject!.id}`} className="flex-none">
              <Button><Play className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Study deck</Button>
            </Link>
            <Link href="/upload" className="flex-none">
              <Button variant="secondary"><Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden /> Generate</Button>
            </Link>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat icon={Layers} tone="brand" value={total} label="Total cards" />
            <MiniStat icon={BookOpen} tone="amber" value={due} label="Due today" />
            <MiniStat icon={Play} tone="green" value={mastered} label="Mastered" sub={`${masteredPct}%`} />
            <MiniStat icon={TriangleAlert} tone="red" value={difficult} label="Difficult" sub={total ? `${Math.round((difficult / total) * 100)}%` : "0%"} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search cards…" aria-label="Search cards" className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink shadow-sm transition placeholder:text-subtle hover:border-line-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </div>
            <FilterSelect value={difficulty} onChange={reset(setDifficulty)} label="Difficulty">
              <option value="all">Any difficulty</option>
              {[1, 2, 3, 4, 5].map((d) => <option key={d} value={String(d)}>D{d}</option>)}
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
            <p className="rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-6 py-10 text-center text-sm text-muted">No cards match your filters.</p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {pageItems.map((c) => <CardRow key={c.id} card={c} subjectId={subject!.id} />)}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted tabular-nums">
                  Showing {page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}
                </p>
                {pages > 1 ? (
                  <div className="flex items-center gap-1">
                    <PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" strokeWidth={2} /></PageBtn>
                    <span className="px-2 text-sm tabular-nums text-ink-2">{page + 1} / {pages}</span>
                    <PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" strokeWidth={2} /></PageBtn>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Rail */}
        <aside className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold tracking-tight text-ink">Your progress</h2>
            <div className="flex items-center gap-4">
              <ProgressRing pct={masteredPct} />
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                <LegendRow color="#16a34a" label="Mastered" value={mastered} />
                <LegendRow color="#f59e0b" label="Learning" value={learning} />
                <LegendRow color="#94a3b8" label="New" value={newCount} />
              </ul>
            </div>
          </div>

          {decks.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Decks in {subject!.name}</h2>
              <ul className="space-y-1">
                {decks.slice(0, 5).map((d) => {
                  const n = subjectCards.filter((c) => c.source_id === d.id).length;
                  return (
                    <li key={d.id}>
                      <button type="button" onClick={() => { setDeckId(d.id); setPage(0); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]"><Layers className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
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
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden /><h2 className="text-base font-semibold tracking-tight text-ink">Suggestions</h2></div>
            <ul className="mt-3 space-y-2">
              <li className="rounded-lg bg-surface/70 p-3">
                <p className="text-sm font-medium text-ink">Review your weak cards</p>
                <p className="text-xs text-muted">{newCount + (total - mastered - learning)} cards need attention</p>
              </li>
              <li className="rounded-lg bg-surface/70 p-3">
                <p className="text-sm font-medium text-ink">Generate more cards</p>
                <p className="text-xs text-muted">Add material to deepen this subject</p>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CardRow({ card, subjectId }: { card: Card; subjectId: string }) {
  const m = MASTERY_META[cardMastery(card)];
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{card.front}</p>
        <p className="mt-0.5 truncate text-sm text-muted">{card.back}</p>
        <span className="mt-2 inline-flex items-center rounded-full bg-[var(--sc-soft)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">{card.topic}</span>
      </div>
      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <div className="w-28">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={cn("font-medium", m.text)}>{m.label}</span>
            <Badge tone={difficultyTone(card.difficulty)}>D{card.difficulty}</Badge>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className={cn("h-full rounded-full", m.bar)} style={{ width: `${m.pct}%` }} /></div>
        </div>
        <div className="flex flex-none items-center gap-1">
          <button type="button" title="Editing cards is coming soon" disabled className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted opacity-60"><Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Edit</button>
          <Link href={`/subjects/${subjectId}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200"><Play className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Study</Link>
        </div>
      </div>
    </li>
  );
}

function MiniStat({ icon: Icon, tone, value, label, sub }: { icon: typeof Layers; tone: "brand" | "amber" | "green" | "red"; value: number; label: string; sub?: string }) {
  const chip = tone === "green" ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400" : tone === "amber" ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" : tone === "red" ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300";
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", chip)}><Icon className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
      <p className="mt-2.5 flex items-baseline gap-1"><span className="text-xl font-bold tabular-nums text-ink">{value}</span>{sub ? <span className="text-xs font-medium text-muted">{sub}</span> : null}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 shadow-sm transition hover:border-line-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15">
      {children}
    </select>
  );
}

function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-2 transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent">{children}</button>;
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
  const size = 96, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r, len = (pct / 100) * c;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(148 163 184 / 0.2)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#7c4dff" strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeLinecap="round" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-ink">{pct}%</span>
        <span className="text-[10px] text-muted">Mastery</span>
      </div>
    </div>
  );
}

export function FlashcardsHubPage() {
  const { loading, error, data } = useAsync(() => Promise.all([loadLibrary(), listSources()]), []);
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const [lib, sources] = data;
  return <FlashcardsView subjects={lib.subjects} cards={lib.cards} sources={sources} />;
}

// Back-compat export name used by the route + preview.
export { FlashcardsView as FlashcardsHubView };
