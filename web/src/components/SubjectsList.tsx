"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Plus, Search } from "lucide-react";

import { ExamFormModal } from "@/components/ExamFormModal";
import { SubjectFormModal } from "@/components/SubjectFormModal";
import { Button, EmptyState, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Card, Exam, Subject } from "@/lib/api/types";
import { DATE_LOCALE, daysUntil, subjectInitials } from "@/lib/format";
import { computeProgress, type SubjectProgress } from "@/lib/progress";
import { computeReadiness, examReadiness, VERDICT_FILL, type Readiness } from "@/lib/readiness";
import { examsForSubject } from "@/lib/scope";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

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

// --- Row model ------------------------------------------------------------------------------
//
// The list's job is a good overview of subjects AND the exams inside them — the old card grid
// showed neither the exams nor their countdowns. Each subject becomes one row that expands to its
// exams; rows are bucketed by state so "what needs me" reads before the calm subjects.

type GroupKey = "att" | "booked" | "noexam" | "past";

interface ExamRow {
  exam: Exam;
  days: number | null; // whole days until exam_date; null when undated
  past: boolean;
  cardCount: number; // cards filed under this exam
  score: number | null; // exam readiness %, null when untested
}

interface Row {
  subject: Subject;
  progress: SubjectProgress;
  readiness: Readiness;
  exams: ExamRow[]; // upcoming (soonest first), then undated, then past (most recent first)
  nextDays: number | null; // days to the soonest upcoming exam
  upcomingCount: number;
  group: GroupKey;
}

const GROUPS: { key: GroupKey; label: string; dot: string }[] = [
  { key: "att", label: "Needs attention", dot: "bg-red-500" },
  { key: "booked", label: "Exam booked, on track", dot: "bg-green-500" },
  { key: "noexam", label: "No exam booked", dot: "bg-subtle" },
  { key: "past", label: "Past exams", dot: "bg-line-strong" },
];

function buildRows(data: DashboardData): Row[] {
  const cardsBy = new Map<string, Card[]>();
  for (const c of data.cards) {
    const list = cardsBy.get(c.subject_id);
    if (list) list.push(c);
    else cardsBy.set(c.subject_id, [c]);
  }

  return data.subjects.map((subject) => {
    const cards = cardsBy.get(subject.id) ?? [];
    const progress = computeProgress(cards);
    const readiness = computeReadiness({ subjectId: subject.id }, data);

    const exams: ExamRow[] = examsForSubject(data.exams, subject.id).map((exam) => {
      const days = daysUntil(exam.exam_date);
      const sr = examReadiness(subject.id, exam.id, data);
      return {
        exam,
        days,
        past: days != null && days < 0,
        cardCount: cards.filter((c) => c.exam_id === exam.id).length,
        score: sr.readiness.verdict === "untested" ? null : sr.readiness.score,
      };
    });
    // Upcoming first (soonest), then undated, then past (most recently gone first).
    exams.sort((a, b) => rank(a) - rank(b) || (a.days ?? 0) - (b.days ?? 0));

    const upcoming = exams.filter((e) => e.days != null && e.days >= 0);
    const nextDays = upcoming.length ? Math.min(...upcoming.map((e) => e.days as number)) : null;
    const allPast = exams.length > 0 && exams.every((e) => e.past);
    const weakTested = readiness.verdict !== "untested" && readiness.score < 60;

    let group: GroupKey;
    if (allPast) group = "past";
    else if ((nextDays != null && nextDays <= 14) || weakTested) group = "att";
    else if (exams.length > 0) group = "booked";
    else group = "noexam";

    return { subject, progress, readiness, exams, nextDays, upcomingCount: upcoming.length, group };
  });
}

// Sort key for exams within a subject: upcoming (0) → undated (1) → past (2).
function rank(e: ExamRow): number {
  if (e.days == null) return 1;
  return e.days >= 0 ? 0 : 2;
}

// Attention order inside a group: soonest exam first, then weakest readiness, then name.
function byAttention(a: Row, b: Row): number {
  const da = a.nextDays ?? Infinity;
  const db = b.nextDays ?? Infinity;
  if (da !== db) return da - db;
  const ra = a.readiness.verdict === "untested" ? 1000 : a.readiness.score;
  const rb = b.readiness.verdict === "untested" ? 1000 : b.readiness.score;
  if (ra !== rb) return ra - rb;
  return a.subject.name.localeCompare(b.subject.name);
}

// --- Header summary + toolbar ---------------------------------------------------------------

function HeaderMeta({ rows }: { rows: Row[] }) {
  const upcoming = rows.flatMap((r) => r.exams.filter((e) => e.days != null && e.days >= 0));
  const nearest = upcoming.length ? Math.min(...upcoming.map((e) => e.days as number)) : null;
  return (
    <p className="mt-2 text-[0.95rem] text-ink-2">
      <b className="font-semibold text-ink tabular-nums">{rows.length}</b> subject{rows.length === 1 ? "" : "s"} ·{" "}
      <b className="font-semibold text-ink tabular-nums">{upcoming.length}</b> exam{upcoming.length === 1 ? "" : "s"} booked
      {nearest != null ? (
        <>
          {" "}· nearest in{" "}
          <b className={cn("font-semibold tabular-nums", nearest <= 7 ? "text-red-600 dark:text-red-400" : "text-ink")}>
            {nearest} day{nearest === 1 ? "" : "s"}
          </b>
        </>
      ) : null}
    </p>
  );
}

// --- The list -------------------------------------------------------------------------------

// Self-fetching wrapper for the /subjects route. Reads the shared dashboard snapshot (cached +
// deduped) — it carries attempts, which readiness needs. The pure view below takes the rows as
// props so the /preview harness can render it without a backend.
export function SubjectsList() {
  const { loading, error, data, reload } = useAsync<DashboardData>(() => loadDashboard(), []);
  return <SubjectsListView data={data ?? null} loading={loading} error={error} onReload={reload} />;
}

export function SubjectsListView({
  data,
  loading = false,
  error = null,
  onReload = () => {},
}: {
  data: DashboardData | null;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newExamFor, setNewExamFor] = useState<Subject | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GroupKey | "all">("all");
  // The first render seeds the expanded set from the data (open the most urgent subject) exactly
  // once, without an effect: a ref-free guard keyed on "have we seeded".
  const [seeded, setSeeded] = useState(false);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  const q = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      q
        ? rows.filter(
            (r) =>
              r.subject.name.toLowerCase().includes(q) ||
              r.exams.some((e) => e.exam.title.toLowerCase().includes(q)),
          )
        : rows,
    [rows, q],
  );

  // Counts drive the filter chips; computed from the search-filtered set so a chip's number always
  // matches what clicking it will show.
  const counts = useMemo(() => {
    const c: Record<GroupKey, number> = { att: 0, booked: 0, noexam: 0, past: 0 };
    for (const r of filteredRows) c[r.group]++;
    return c;
  }, [filteredRows]);

  if (data && !seeded && rows.length > 0) {
    setSeeded(true);
    const urgent = [...rows].filter((r) => r.group === "att").sort(byAttention)[0];
    if (urgent) setExpanded(new Set([urgent.subject.id]));
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const subjectCount = data?.subjects.length ?? 0;

  return (
    <section>
      <header className="animate-rise mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Subjects</h1>
          {data && subjectCount > 0 ? (
            <HeaderMeta rows={rows} />
          ) : (
            <p className="mt-2 max-w-prose text-[0.95rem] text-ink-2">
              Your courses and the exams inside them. Open one to study it or add material.
            </p>
          )}
        </div>
        <Button onClick={() => setCreating(true)} className="flex-none">
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          New subject
        </Button>
      </header>

      {loading ? <LoadingList /> : null}
      {error ? <ErrorBox message={error} /> : null}

      {data && subjectCount === 0 ? (
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

      {data && subjectCount > 0 ? (
        <>
          {/* Toolbar: search + state filter chips */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter subjects and exams…"
                aria-label="Filter subjects and exams"
                className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink shadow-sm transition placeholder:text-subtle hover:border-line-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <Chip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={filteredRows.length} />
            {GROUPS.map((g) =>
              counts[g.key] > 0 ? (
                <Chip key={g.key} active={filter === g.key} onClick={() => setFilter(g.key)} label={g.label} count={counts[g.key]} />
              ) : null,
            )}
          </div>

          {filteredRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-6 py-10 text-center text-sm text-muted">
              No subjects match “{query}”.
            </p>
          ) : (
            <div className="space-y-6">
              {GROUPS.map((g) => {
                if (filter !== "all" && filter !== g.key) return null;
                const items = filteredRows.filter((r) => r.group === g.key).sort(byAttention);
                if (items.length === 0) return null;
                return (
                  <div key={g.key} className={g.key === "past" ? "opacity-90" : undefined}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <span aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", g.dot)} />
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{g.label}</h2>
                      <span className="text-[11px] font-medium tabular-nums text-subtle">{items.length}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    <ul className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                      {items.map((row) => (
                        <SubjectRow
                          key={row.subject.id}
                          row={row}
                          expanded={expanded.has(row.subject.id)}
                          onToggle={() => toggle(row.subject.id)}
                          onNewExam={() => setNewExamFor(row.subject)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      <SubjectFormModal open={creating} onClose={() => setCreating(false)} onSaved={() => onReload()} />
      <ExamFormModal
        open={newExamFor != null}
        subjectId={newExamFor?.id ?? ""}
        onClose={() => setNewExamFor(null)}
        onSaved={() => {
          setNewExamFor(null);
          onReload();
        }}
      />
    </section>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-200"
          : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "text-brand-600 dark:text-brand-300" : "text-subtle")}>{count}</span>
    </button>
  );
}

// --- Subject row (collapsed summary + expandable exam drawer) -------------------------------

function SubjectRow({
  row,
  expanded,
  onToggle,
  onNewExam,
}: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  onNewExam: () => void;
}) {
  const { subject, progress, readiness, exams, nextDays, upcomingCount } = row;
  const drawerId = `exams-${subject.id}`;

  return (
    <li style={subjectVars(subject.id)} className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={drawerId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1 pr-2 text-left transition hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronRight
            className={cn("h-4 w-4 flex-none text-subtle transition-transform duration-200", expanded && "rotate-90")}
            strokeWidth={2}
            aria-hidden
          />
          <span
            aria-hidden
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
          >
            {subjectInitials(subject.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{subject.name}</span>
            <span className="block truncate text-xs text-muted">
              <span className="capitalize">{subject.grading_scale}</span> scale
              {subject.target_grade != null ? ` · target ${subject.target_grade}` : ""}
            </span>
          </span>

          {/* Exams summary */}
          <span className="hidden w-[132px] flex-none text-xs md:block">
            {upcomingCount > 0 ? (
              <>
                <span className="block font-medium text-ink-2">
                  {exams.length} exam{exams.length === 1 ? "" : "s"}
                </span>
                <span className={cn(nextDays != null && nextDays <= 7 ? "text-red-600 dark:text-red-400" : "text-muted")}>
                  next in {nextDays}d
                </span>
              </>
            ) : exams.length > 0 ? (
              <span className="block text-muted">
                {exams.length} exam{exams.length === 1 ? "" : "s"} · all past
              </span>
            ) : (
              <>
                <span className="block text-subtle">No exam yet</span>
                <span className="text-muted">Add one</span>
              </>
            )}
          </span>

          {/* Readiness */}
          <span className="hidden w-[130px] flex-none items-center gap-2 sm:flex">
            {readiness.verdict === "untested" ? (
              <span className="text-[11px] text-subtle">Not tested yet</span>
            ) : (
              <>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span className={cn("block h-full rounded-full", VERDICT_FILL[readiness.verdict])} style={{ width: `${readiness.score}%` }} />
                </span>
                <b className="w-8 flex-none text-right text-xs font-semibold tabular-nums text-ink">{readiness.score}%</b>
              </>
            )}
          </span>

          {/* Cards / due */}
          <span className="w-[64px] flex-none text-right">
            <span className="block text-sm font-semibold tabular-nums text-ink">{progress.total}</span>
            <span className={cn("block text-[11px]", progress.dueNow > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted")}>
              {progress.dueNow > 0 ? `${progress.dueNow} due` : "cards"}
            </span>
          </span>
        </button>

        <Link
          href={`/subjects/${subject.id}`}
          className="flex-none rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
        >
          Open →
        </Link>
      </div>

      {expanded ? (
        <div id={drawerId} className="border-t border-line bg-surface-2/40 px-3 pb-3 pt-1 sm:pl-[52px]">
          {exams.length > 0 ? (
            <ul className="divide-y divide-line/70">
              {exams.map((e) => (
                <ExamLine key={e.exam.id} subjectId={subject.id} row={e} />
              ))}
            </ul>
          ) : (
            <p className="px-1 py-3 text-xs text-muted">
              No exam booked yet. Cram paces your revision toward an exam date — add one and this subject joins the countdown.
            </p>
          )}
          <button
            type="button"
            onClick={onNewExam}
            className="mt-1 inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-xs font-semibold text-brand-600 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-line-strong text-muted">
              <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </span>
            New exam for {subject.name}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function ExamLine({ subjectId, row }: { subjectId: string; row: ExamRow }) {
  const { exam, days, past, cardCount, score } = row;
  const chip =
    past || days == null
      ? "bg-surface-2 text-muted"
      : days <= 7
        ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
        : days <= 14
          ? "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
          : "bg-surface-2 text-muted";
  const chipText = past ? "Done" : days == null ? "No date" : days === 0 ? "Today" : `${days}d`;
  const scoreTone = score == null ? "" : score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <li className="flex items-center gap-3 py-2">
      <CalendarDays className="h-3.5 w-3.5 flex-none text-subtle" strokeWidth={2} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{exam.title}</span>
        <span className="block text-[11px] text-muted">
          {exam.exam_date ? formatExamDate(exam.exam_date) : "No date set"} · {cardCount} card{cardCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", chip)}>{chipText}</span>
      <span className="hidden w-[104px] flex-none items-center gap-2 sm:flex">
        {score == null ? (
          <span className="text-[11px] text-subtle">Untested</span>
        ) : (
          <>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <span className={cn("block h-full rounded-full", scoreTone)} style={{ width: `${score}%` }} />
            </span>
            <b className="w-7 flex-none text-right text-[11px] font-semibold tabular-nums text-ink-2">{score}%</b>
          </>
        )}
      </span>
      <Link
        href={`/subjects/${subjectId}?exam=${exam.id}`}
        className="flex-none rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
      >
        {past ? "Open" : "Prep plan"} →
      </Link>
    </li>
  );
}

// Dates are pinned to the app-wide DATE_LOCALE; an exam shows day + month, plus the year only when
// it isn't the current one.
function formatExamDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === new Date().getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" };
  return d.toLocaleDateString(DATE_LOCALE, opts);
}

function LoadingList() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
