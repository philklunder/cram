"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  Flame,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import { Button, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { GradeEntry, StudySession, Subject } from "@/lib/api/types";
import {
  activityHeatmap,
  computeStreak,
  formatMinutes,
  masteryBuckets,
  nearestExam,
} from "@/lib/dashboard";
import { daysUntil, formatDate, subjectInitials } from "@/lib/format";
import { currentGrade, gradePercent } from "@/lib/grades";
import { computeProgress } from "@/lib/progress";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

interface ProgressData {
  subjects: Subject[];
  cards: DashboardData["cards"];
  gradeEntries: GradeEntry[];
  reviewLogs: DashboardData["reviewLogs"];
  studySessions: StudySession[];
}

function readinessScore(cards: ProgressData["cards"]): number {
  const b = masteryBuckets(cards);
  if (b.total === 0) return 0;
  return Math.round(((b.mastered + b.strong * 0.5) / b.total) * 100);
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
  const { subjects, cards, gradeEntries, reviewLogs, studySessions } = data;
  const scaleOf = useMemo(() => new Map(subjects.map((s) => [s.id, s.grading_scale] as const)), [subjects]);

  const streak = computeStreak(reviewLogs, now);
  const buckets = masteryBuckets(cards);
  const readiness = readinessScore(cards);
  const exam = nearestExam(subjects);

  const allPoints = useMemo(() => trendPoints(gradeEntries, scaleOf), [gradeEntries, scaleOf]);
  const currentAvg = allPoints.length ? Math.round(allPoints.reduce((s, p) => s + p.pct, 0) / allPoints.length) : null;
  const prior = allPoints.filter((p) => p.t < now - 7 * 86_400_000);
  const delta =
    currentAvg != null && prior.length
      ? currentAvg - Math.round(prior.reduce((s, p) => s + p.pct, 0) / prior.length)
      : null;

  const targetPcts = subjects
    .filter((s) => s.target_grade != null)
    .map((s) => gradePercent(s.grading_scale, s.target_grade as number));
  const targetPct = targetPcts.length ? Math.round(targetPcts.reduce((a, b) => a + b, 0) / targetPcts.length) : null;
  const targetSubject = exam?.subject ?? subjects.find((s) => s.target_grade != null) ?? null;

  return (
    <section>
      <PageHeader title="Progress" subtitle="Track your performance and stay on top of your goals." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Stat row */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <Stat icon={TrendingUp} tone="brand" label="Current average" value={currentAvg == null ? "—" : `${currentAvg}%`} sub={delta != null ? <Delta v={delta} /> : "No trend yet"} />
            <Stat icon={Target} tone="red" label="Target grade" value={targetSubject?.target_grade != null ? String(targetSubject.target_grade) : "—"} sub={targetSubject ? `${targetSubject.grading_scale} scale` : "Set a target"} />
            <Stat icon={Award} tone="brand" label="Readiness" value={`${readiness}%`} sub={readinessLabel(readiness)} />
            <Stat icon={Flame} tone="amber" label="Study streak" value={String(streak.current)} sub={streak.current === 1 ? "day in a row" : "days in a row"} />
            <Stat icon={BookOpen} tone="green" label="Cards mastered" value={buckets.mastered.toLocaleString()} sub={`of ${buckets.total.toLocaleString()}`} />
          </div>

          {/* Grade trend + topic mastery */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3">
              <GradeTrend points={allPoints} targetPct={targetPct} now={now} />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <TopicMastery buckets={buckets} />
            </div>
          </div>

          <SubjectsPerformance subjects={subjects} data={data} now={now} />

          <Achievements streak={streak.current} mastered={buckets.mastered} />
        </div>

        {/* Right rail */}
        <aside className="min-w-0 space-y-6">
          <UpcomingExam exam={exam} readiness={readiness} />
          <StudyActivity sessions={studySessions} streak={streak.current} now={now} />
          <AIInsight />
        </aside>
      </div>
    </section>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
      {up ? "↑" : "↓"} {Math.abs(v)}% vs last 7 days
    </span>
  );
}

type Tone = "brand" | "amber" | "green" | "red";
const chip: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  green: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
};

function Stat({ icon: Icon, tone, label, value, sub }: { icon: typeof Target; tone: Tone; label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", chip[tone])}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <p className="mt-3 text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
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

function GradeTrend({ points, targetPct, now }: { points: { t: number; pct: number }[]; targetPct: number | null; now: number }) {
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
              <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" className="fill-[rgb(148_163_184)] text-[9px]">{g}</text>
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

// --- Topic mastery donut -----------------------------------------------------------------

function TopicMastery({ buckets }: { buckets: ReturnType<typeof masteryBuckets> }) {
  const segs = [
    { label: "Mastered", value: buckets.mastered, color: "#16a34a" },
    { label: "Strong", value: buckets.strong, color: "#7c4dff" },
    { label: "Practice", value: buckets.practice, color: "#f59e0b" },
    { label: "Weak", value: buckets.weak, color: "#ef4444" },
  ];
  return (
    <div className="h-full rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-base font-semibold tracking-tight text-ink">Topic mastery</h2>
      {/* Donut on top, legend full-width below — the card is only ~2/5 wide, so a side-by-side
          layout squeezes the legend and pushes the %/labels out of the box. Stacking always fits. */}
      <div className="mt-4 flex flex-col items-center gap-5">
        <Donut segments={segs} centerValue={`${buckets.masteredPct}%`} centerSub="Mastered" />
        <ul className="w-full space-y-2">
          {segs.map((s) => {
            const pct = buckets.total ? Math.round((s.value / buckets.total) * 100) : 0;
            return (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
                <span className="flex-none font-semibold tabular-nums text-ink">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Donut({ segments, centerValue, centerSub, size = 128, stroke = 15 }: { segments: { value: number; color: string }[]; centerValue: string; centerSub: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(148 163 184 / 0.2)" strokeWidth={stroke} />
          {segments.map((seg, i) => {
            const len = (seg.value / total) * c;
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-ink">{centerValue}</span>
        <span className="text-[10px] text-muted">{centerSub}</span>
      </div>
    </div>
  );
}

// --- Subjects performance ----------------------------------------------------------------

function SubjectsPerformance({ subjects, data, now }: { subjects: Subject[]; data: ProgressData; now: number }) {
  const withCards = subjects.filter((s) => data.cards.some((c) => c.subject_id === s.id)).slice(0, 4);
  if (withCards.length === 0) return null;
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">Subjects performance</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {withCards.map((s) => (
          <SubjectPerfCard key={s.id} subject={s} data={data} now={now} />
        ))}
      </div>
    </div>
  );
}

function SubjectPerfCard({ subject, data, now }: { subject: Subject; data: ProgressData; now: number }) {
  const cards = data.cards.filter((c) => c.subject_id === subject.id);
  const entries = data.gradeEntries.filter((e) => e.subject_id === subject.id).sort((a, b) => a.date.localeCompare(b.date));
  const cur = currentGrade(subject.current_grade, entries);
  const avgPct = cur != null ? gradePercent(subject.grading_scale, cur) : masteryBuckets(cards).masteredPct;
  const readiness = readinessScore(cards);
  const b = masteryBuckets(cards);
  const topics = new Map<string, typeof cards>();
  for (const c of cards) {
    const arr = topics.get(c.topic) ?? [];
    arr.push(c);
    topics.set(c.topic, arr);
  }
  let weak = 0;
  for (const [, arr] of topics) if (computeProgress(arr).masteredPct < 50) weak++;
  const days = daysUntil(subject.exam_date);
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
        <Metric label="Average" value={`${avgPct}%`} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Trend</p>
          <div className="mt-1"><MiniSpark values={spark} /></div>
        </div>
        <Metric label="Readiness" value={`${readiness}%`} tone={readiness >= 65 ? "green" : readiness >= 45 ? "amber" : "red"} />
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

// --- Right rail --------------------------------------------------------------------------

function UpcomingExam({ exam, readiness }: { exam: ReturnType<typeof nearestExam>; readiness: number }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-ink">Upcoming exam</h2>
        <Link href="/subjects" className="text-xs font-medium text-brand-600 dark:text-brand-300">View subjects</Link>
      </div>
      {exam ? (
        <>
          <div style={subjectVars(exam.subject.id)} className="flex items-center gap-3">
            <span className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
              <span className="text-lg font-bold leading-none tabular-nums">{exam.days}</span>
              <span className="text-[9px] uppercase">days</span>
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{exam.subject.name}</p>
              <p className="text-xs text-muted">{formatDate(exam.subject.exam_date)}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Donut segments={[{ value: readiness, color: "#7c4dff" }, { value: 100 - readiness, color: "transparent" }]} centerValue={`${readiness}%`} centerSub={readinessLabel(readiness)} size={84} stroke={10} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Readiness</p>
              <p className="mt-0.5 text-xs text-muted">Keep studying to reach your target.</p>
            </div>
          </div>
          <Link href={`/subjects/${exam.subject.id}`} className="mt-4 block">
            <Button className="w-full">Exam prep plan <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden /></Button>
          </Link>
        </>
      ) : (
        <p className="rounded-xl bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">No exam scheduled.</p>
      )}
    </section>
  );
}

const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];

function StudyActivity({ sessions, streak, now }: { sessions: StudySession[]; streak: number; now: number }) {
  const { grid, max } = activityHeatmap(sessions, 8, now);
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-ink">Study activity</h2>
        <span className="text-xs text-muted">Last 8 weeks</span>
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-[9px] text-subtle">
          {WEEKDAY.map((d, i) => (<span key={i} className="h-3 leading-3">{i % 2 === 0 ? d : ""}</span>))}
        </div>
        <div className="flex flex-1 justify-between gap-1">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-1">
              {week.map((day) => (
                <span
                  key={day.key}
                  title={`${day.minutes} min`}
                  className="aspect-square w-full rounded-[3px]"
                  style={{ backgroundColor: heatColor(day.minutes, max, day.inFuture) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Flame className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} aria-hidden /> Longest streak: {streak} days
        </p>
        <span className="flex items-center gap-1 text-[10px] text-subtle">
          Less
          {[0.1, 0.35, 0.6, 1].map((o) => (<span key={o} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: `rgb(124 77 255 / ${o})` }} />))}
          More
        </span>
      </div>
    </section>
  );
}

function heatColor(minutes: number, max: number, future: boolean): string {
  if (future) return "rgb(148 163 184 / 0.08)";
  if (minutes <= 0) return "rgb(148 163 184 / 0.16)";
  const o = 0.25 + 0.75 * Math.min(1, minutes / Math.max(1, max));
  return `rgb(124 77 255 / ${o.toFixed(2)})`;
}

// Static, honest stub until an insights backend exists.
function AIInsight() {
  const items = [
    { icon: Target, title: "Review weak topics", sub: "Topics that need more practice" },
    { icon: BookOpen, title: "Space out your reviews", sub: "Short daily sessions beat cramming" },
    { icon: Trophy, title: "Try a full mock exam", sub: "Simulate exam conditions" },
  ];
  return (
    <section className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-5 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
        <h2 className="text-base font-semibold tracking-tight text-ink">Study tips</h2>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.title} className="flex items-center gap-3 rounded-lg bg-surface/70 p-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <it.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{it.title}</p>
              <p className="truncate text-xs text-muted">{it.sub}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Achievements({ streak, mastered }: { streak: number; mastered: number }) {
  const items = [
    { icon: Flame, tone: "amber" as Tone, title: `${streak} days`, sub: "Streak milestone" },
    { icon: BookOpen, tone: "green" as Tone, title: `${mastered.toLocaleString()}`, sub: "Cards mastered" },
    { icon: TrendingUp, tone: "brand" as Tone, title: "On track", sub: "Keep it up" },
    { icon: Trophy, tone: "brand" as Tone, title: "Consistent", sub: "Study habit" },
  ];
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="mb-4 text-base font-semibold tracking-tight text-ink">Recent achievements</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.sub} className="flex items-center gap-2.5">
            <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", chip[it.tone])}>
              <it.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tabular-nums text-ink">{it.title}</p>
              <p className="truncate text-[11px] text-muted">{it.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
