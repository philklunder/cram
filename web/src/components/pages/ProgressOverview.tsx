"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import { Button, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Exam, GradeEntry, GradingScale, StudySession, Subject } from "@/lib/api/types";
import {
  activityHeatmap,
  computeStreak,
  formatMinutes,
  masteryBuckets,
  subjectExamDate,
} from "@/lib/dashboard";
import { daysUntil, subjectInitials } from "@/lib/format";
import { currentGrade, formatPercentInScale, gradePercent } from "@/lib/grades";
import { computeProgress } from "@/lib/progress";
import { computeReadiness, overallReadiness, readinessBySubject, type Readiness } from "@/lib/readiness";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";
import { useDisplayScale } from "@/lib/useDisplayScale";

interface ProgressData {
  subjects: Subject[];
  exams: Exam[];
  cards: DashboardData["cards"];
  gradeEntries: GradeEntry[];
  reviewLogs: DashboardData["reviewLogs"];
  studySessions: StudySession[];
  // Readiness is card mastery + quiz accuracy + coverage, so it needs the quiz side too.
  questions: DashboardData["questions"];
  quizzes: DashboardData["quizzes"];
  attempts: DashboardData["attempts"];
}

// One definition of readiness for the whole app: lib/readiness.ts, fed only by Reviews.
function subjectReadiness(subjectId: string, data: ProgressData): Readiness {
  return computeReadiness({ subjectId }, data);
}

function readinessLabel(pct: number): string {
  return pct >= 80 ? "Excellent" : pct >= 65 ? "Good" : pct >= 45 ? "Fair" : "Needs work";
}

// A normalized-% point per grade entry, using its subject's scale.
function trendPoints(entries: GradeEntry[], scaleOf: Map<string, Subject["grading_scale"]>) {
  return entries
    .map((e) => ({ t: new Date(e.date).getTime(), pct: gradePercent(scaleOf.get(e.subject_id) ?? "percentage", e.score) }))
    .sort((a, b) => a.t - b.t);
}

export function ProgressOverviewView({ data, now = Date.now() }: { data: ProgressData; now?: number }) {
  const { subjects, exams, cards, gradeEntries, reviewLogs, studySessions } = data;
  const displayScale = useDisplayScale();
  const scaleOf = useMemo(() => new Map(subjects.map((s) => [s.id, s.grading_scale] as const)), [subjects]);

  const streak = computeStreak(reviewLogs, now);
  const p = computeProgress(cards);
  // Weighted across subjects, excluding ones never tested — null until a Review has happened.
  const readiness = useMemo(() => overallReadiness([...readinessBySubject(subjects, data).values()]), [subjects, data]);

  const allPoints = useMemo(() => trendPoints(gradeEntries, scaleOf), [gradeEntries, scaleOf]);
  const targetPcts = subjects
    .filter((s) => s.target_grade != null)
    .map((s) => gradePercent(s.grading_scale, s.target_grade as number));
  const targetPct = targetPcts.length ? Math.round(targetPcts.reduce((a, b) => a + b, 0) / targetPcts.length) : null;

  // Study time this month vs last, an honest trend (unlike a fabricated "readiness 30 days ago").
  const nowD = new Date(now);
  const thisMonthMin = monthMinutes(studySessions, nowD.getFullYear(), nowD.getMonth());
  const lastD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const lastMonthMin = monthMinutes(studySessions, lastD.getFullYear(), lastD.getMonth());
  const monthDelta = lastMonthMin > 0 ? Math.round(((thisMonthMin - lastMonthMin) / lastMonthMin) * 100) : null;

  return (
    <section>
      <PageHeader title="Progress" subtitle="How your recall and your real grades have moved over time." />

      <div className="space-y-6">
        {/* Four figures — all read as movement, not static snapshots. Current-average and target
            live on Grades; here it's readiness, consistency and volume. */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="-m-px grid grid-cols-2 sm:grid-cols-4">
            <Figure value={readiness == null ? "—" : `${readiness}%`} label="Readiness, all subjects" foot={readiness == null ? "Run a review" : readinessLabel(readiness)} />
            <Figure value={streak.current} unit={streak.current === 1 ? "day" : "days"} label="Study streak" foot={streak.studiedToday ? "Studied today" : streak.current > 0 ? "Keep it going" : "Start today"} />
            <Figure value={p.mastered} label="Cards mastered" foot={`of ${p.total} total`} tone="green" />
            <Figure
              value={formatMinutes(thisMonthMin)}
              label="Studied this month"
              foot={
                monthDelta == null ? (
                  thisMonthMin > 0 ? "First month tracked" : "No study time yet"
                ) : (
                  <span className={cn("inline-flex items-center gap-1", monthDelta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                    {monthDelta >= 0 ? "↑" : "↓"} {Math.abs(monthDelta)}% vs last month
                  </span>
                )
              }
            />
          </div>
        </div>

        {/* Grade trend + topic mastery */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <GradeTrend points={allPoints} targetPct={targetPct} now={now} displayScale={displayScale} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <TopicMastery progress={p} />
          </div>
        </div>

        <SubjectsPerformance subjects={subjects} data={data} now={now} displayScale={displayScale} />

        <StudyActivityYear sessions={studySessions} now={now} />
      </div>
    </section>
  );
}

// Whole minutes of study in a given calendar month.
function monthMinutes(sessions: StudySession[], year: number, month: number): number {
  let s = 0;
  for (const x of sessions) {
    const d = new Date(x.started_at ?? x.created_at);
    if (d.getFullYear() === year && d.getMonth() === month) s += x.duration_seconds / 60;
  }
  return Math.round(s);
}

// Icon-less figure cell for the strip (mirrors the dashboard). Colour = quality only.
function Figure({ value, unit, label, foot, tone }: { value: number | string; unit?: string; label: string; foot: React.ReactNode; tone?: "green" }) {
  return (
    <div className="border-l border-t border-line p-4">
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tabular-nums", tone === "green" ? "text-green-600 dark:text-green-400" : "text-ink")}>{value}</span>
        {unit ? <span className="text-sm font-medium text-muted">{unit}</span> : null}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
      <div className="mt-1.5 min-h-[16px] text-[11px] font-medium text-muted">{foot}</div>
    </div>
  );
}

// --- Grade trend chart -------------------------------------------------------------------

const RANGES: { label: string; days: number }[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: Infinity },
];

function GradeTrend({ points, targetPct, now, displayScale }: { points: { t: number; pct: number }[]; targetPct: number | null; now: number; displayScale: GradingScale }) {
  const [range, setRange] = useState(2); // default 3M
  const days = RANGES[range].days;
  const shown = days === Infinity ? points : points.filter((p) => p.t >= now - days * 86_400_000);

  const W = 480;
  const H = 200;
  const pad = { l: 28, r: 12, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const t0 = shown.length ? shown[0].t : now - days * 86_400_000;
  const t1 = shown.length ? shown[shown.length - 1].t : now;
  const tSpan = Math.max(1, t1 - t0);
  const x = (t: number) => pad.l + ((t - t0) / tSpan) * iw;
  const y = (pct: number) => pad.t + (1 - pct / 100) * ih;
  const line = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const area = shown.length ? `${line} L${x(t1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(t0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z` : "";

  return (
    <div className="h-full rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">Grade trend over time</h2>
          <p className="mt-0.5 flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" /> Your average</span>
            {targetPct != null ? <span className="inline-flex items-center gap-1"><span className="h-0 w-3 border-t-2 border-dashed border-subtle" /> Target</span> : null}
          </p>
        </div>
        <div className="flex flex-none rounded-lg border border-line bg-surface-2/50 p-0.5">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRange(i)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium transition", i === range ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length < 2 ? (
        <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted">
          Record a few grades to see your trend.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grade average over time">
          <defs>
            <linearGradient id="pg-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7c4dff" stopOpacity="0.18" />
              <stop offset="1" stopColor="#7c4dff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((g) => (
            <g key={g}>
              <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="rgb(148 163 184 / 0.18)" strokeWidth="1" />
              <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" className="fill-[rgb(148_163_184)] text-[9px]">{formatPercentInScale(displayScale, g)}</text>
            </g>
          ))}
          {targetPct != null ? (
            <line x1={pad.l} x2={W - pad.r} y1={y(targetPct)} y2={y(targetPct)} stroke="rgb(148 163 184 / 0.9)" strokeWidth="1.5" strokeDasharray="5 4" />
          ) : null}
          <path d={area} fill="url(#pg-area)" />
          <path d={line} fill="none" stroke="#7c4dff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {shown.length <= 24 ? shown.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.pct)} r="3" fill="#7c4dff" />) : null}
        </svg>
      )}
    </div>
  );
}

// --- Topic mastery bars ------------------------------------------------------------------

// Three semantic bars, not a four-slice donut: a donut where one slice is 0% is hard to read, and
// mastered/learning/shaky is the same three-state vocabulary the rest of the app uses.
function TopicMastery({ progress }: { progress: ReturnType<typeof computeProgress> }) {
  const total = progress.total || 1;
  const rows = [
    { label: "Mastered", value: progress.mastered, fill: "bg-green-500" },
    { label: "Learning", value: progress.learning, fill: "bg-amber-500" },
    { label: "Shaky", value: progress.shaky, fill: "bg-red-500" },
  ];
  const weak = progress.total ? Math.round((progress.shaky / total) * 100) : 0;
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-ink">Topic mastery</h2>
        <span className="text-xs text-muted">All subjects</span>
      </div>
      <div className="mt-4 space-y-3.5">
        {rows.map((r) => {
          const pct = progress.total ? Math.round((r.value / total) * 100) : 0;
          return (
            <div key={r.label}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-ink-2">{r.label}</span>
                <span className="font-semibold tabular-nums text-ink">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className={cn("h-full rounded-full", r.fill)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {progress.total > 0 ? (
        <p className="mt-auto pt-4 text-xs text-muted">
          {weak > 0 ? (
            <>
              {weak}% of cards are still shaky.{" "}
              <Link href="/review" className="font-medium text-brand-600 hover:underline dark:text-brand-300">Review the weak ones →</Link>
            </>
          ) : (
            "Nothing shaky right now — nicely held."
          )}
        </p>
      ) : null}
    </div>
  );
}

// --- Subjects performance ----------------------------------------------------------------

function SubjectsPerformance({ subjects, data, now, displayScale }: { subjects: Subject[]; data: ProgressData; now: number; displayScale: GradingScale }) {
  const withCards = subjects.filter((s) => data.cards.some((c) => c.subject_id === s.id)).slice(0, 4);
  if (withCards.length === 0) return null;
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">Subjects performance</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {withCards.map((s) => (
          <SubjectPerfCard key={s.id} subject={s} data={data} now={now} displayScale={displayScale} />
        ))}
      </div>
    </div>
  );
}

function SubjectPerfCard({ subject, data, now, displayScale }: { subject: Subject; data: ProgressData; now: number; displayScale: GradingScale }) {
  const cards = data.cards.filter((c) => c.subject_id === subject.id);
  const entries = data.gradeEntries.filter((e) => e.subject_id === subject.id).sort((a, b) => a.date.localeCompare(b.date));
  const cur = currentGrade(subject.current_grade, entries);
  // "Average" shows the subject's grade in the chosen display scale; with no grade yet we fall back
  // to card-mastery %, which is a progress figure (not a grade) so it always stays a percentage.
  const avgDisplay =
    cur != null
      ? formatPercentInScale(displayScale, gradePercent(subject.grading_scale, cur))
      : `${masteryBuckets(cards).masteredPct}%`;
  const readiness = subjectReadiness(subject.id, data);
  const b = masteryBuckets(cards);
  const topics = new Map<string, typeof cards>();
  for (const c of cards) {
    const arr = topics.get(c.topic) ?? [];
    arr.push(c);
    topics.set(c.topic, arr);
  }
  let weak = 0;
  for (const [, arr] of topics) if (computeProgress(arr).masteredPct < 50) weak++;
  const days = daysUntil(subjectExamDate(subject.id, data.exams));
  const spark = entries.map((e) => gradePercent(subject.grading_scale, e.score));

  return (
    <div style={subjectVars(subject.id)} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25">
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{subject.name}</p>
          <p className="truncate text-xs capitalize text-muted">{subject.grading_scale} scale</p>
        </div>
        {days != null && days >= 0 ? (
          <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-medium", days <= 3 ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-surface-2 text-muted")}>
            Exam in {days}d
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric label="Average" value={avgDisplay} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Trend</p>
          <div className="mt-1"><MiniSpark values={spark} /></div>
        </div>
        <Metric
          label="Readiness"
          value={readiness.verdict === "untested" ? "—" : `${readiness.score}%`}
          tone={
            readiness.verdict === "untested"
              ? undefined
              : readiness.score >= 65
                ? "green"
                : readiness.score >= 45
                  ? "amber"
                  : "red"
          }
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink tabular-nums">{b.mastered}</span> mastered
          <span aria-hidden> · </span>
          <span className={cn("font-semibold tabular-nums", weak > 0 ? "text-amber-600 dark:text-amber-400" : "text-ink")}>{weak}</span> weak topic{weak === 1 ? "" : "s"}
        </p>
        <Link href={`/subjects/${subject.id}`}>
          <Button size="sm">
            Study {subject.name.length <= 6 ? subject.name : ""}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const cls = tone === "green" ? "text-green-600 dark:text-green-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : tone === "red" ? "text-red-600 dark:text-red-400" : "text-ink";
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums", cls)}>{value}</p>
    </div>
  );
}

function MiniSpark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-sm text-subtle">—</span>;
  const w = 60;
  const h = 22;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const dir = values[values.length - 1] - values[0];
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden><polyline points={pts} stroke={dir > 3 ? "#16a34a" : dir < -3 ? "#dc2626" : "#7c4dff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// --- Study activity: a year-long contribution graph ------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GitHub-style contribution graph in BLUE — a rolling year, one column per week, one row per
// weekday. Blue is a deliberate fifth hue: not the violet brand accent, not the semantic
// green/amber/red, so the graph reads as *volume* (how much you studied), never as good/urgent.
function StudyActivityYear({ sessions, now }: { sessions: StudySession[]; now: number }) {
  const { grid } = activityHeatmap(sessions, 52, now);

  // A month label sits above the first week column that falls in a new month. dayKey is
  // "year-month0-date"; the Monday of each column is week[0].
  let seenMonth = -1;
  const monthCols = grid.map((week) => {
    const month = Number(week[0].key.split("-")[1]);
    if (month !== seenMonth) {
      seenMonth = month;
      return MONTHS[month] ?? "";
    }
    return "";
  });

  const days = grid.flat().filter((d) => !d.inFuture);
  const studied = days.filter((d) => d.minutes > 0).length;
  const totalMin = days.reduce((s, d) => s + d.minutes, 0);
  const hours = Math.round(totalMin / 60);

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-ink">Study activity</h2>
        <span className="text-xs text-muted">Last 12 months</span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-1.5">
          {/* weekday labels */}
          <div className="mt-[18px] grid grid-rows-7 gap-[3px] pr-0.5 text-right text-[9px] leading-[12px] text-muted" aria-hidden>
            <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span />
          </div>
          <div className="flex flex-col gap-[3px]">
            {/* month labels */}
            <div className="grid grid-flow-col auto-cols-[12px] gap-[3px] text-[9.5px] leading-[15px] text-muted" aria-hidden>
              {monthCols.map((m, i) => (
                <span key={i} className="overflow-visible whitespace-nowrap">{m}</span>
              ))}
            </div>
            {/* cells: column-major (grid.flat() is week-by-week), grid-rows-7 fills each column */}
            <div
              className="grid grid-flow-col auto-cols-[12px] grid-rows-7 gap-[3px]"
              role="img"
              aria-label={`Study activity for the last year: studied on ${studied} of ${days.length} days, about ${hours} hours total`}
            >
              {grid.flat().map((d) =>
                d.inFuture ? (
                  <span key={d.key} className="h-3 w-3" />
                ) : (
                  <span
                    key={d.key}
                    title={`${d.minutes} min on ${formatCellDate(d.key)}`}
                    className={cn("h-3 w-3 rounded-[3px]", heatLevel(d.minutes))}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          <b className="tabular-nums text-ink">{studied}</b> days studied · <b className="tabular-nums text-ink">{hours}h</b> total
        </span>
        <span className="flex items-center gap-1 text-[10px]">
          Less
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[#eef1f5] dark:bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-blue-200" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-blue-400" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-blue-600" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-blue-800" />
          More
        </span>
      </div>
    </section>
  );
}

// Five steps, like GitHub: empty then four ramping blues.
function heatLevel(minutes: number): string {
  if (minutes <= 0) return "bg-[#eef1f5] dark:bg-white/10";
  if (minutes < 20) return "bg-blue-200 dark:bg-blue-500/40";
  if (minutes < 35) return "bg-blue-400 dark:bg-blue-500/70";
  if (minutes < 50) return "bg-blue-600";
  return "bg-blue-800 dark:bg-blue-500";
}

// dayKey is "year-month0-date". Render a friendly "13 Jul" for the tooltip.
function formatCellDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m] ?? ""} ${y}`;
}

// --- Fetching wrapper --------------------------------------------------------------------

export function ProgressOverviewPage() {
  const { loading, error, data } = useAsync(() => loadDashboard(), []);
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  return <ProgressOverviewView data={data} />;
}
