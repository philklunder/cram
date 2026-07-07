"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Sparkles, Target } from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import { Button, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Exam, StudySession, Subject } from "@/lib/api/types";
import { masteryBuckets, subjectExamDate, weeklyActivity } from "@/lib/dashboard";
import { daysUntil, formatDate, subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

interface PlannerData {
  subjects: Subject[];
  exams: Exam[];
  cards: DashboardData["cards"];
  studySessions: StudySession[];
}

type EventKind = "review" | "quiz" | "exam";
interface CalEvent {
  subject: Subject;
  kind: EventKind;
  label: string;
  time: string; // "10:00" or "All day"
}

const DAY_MS = 86_400_000;
function startOfLocalDay(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Illustrative plan: real exam events on their dates, plus deterministic suggested review/quiz
// sessions across the month (no scheduling backend yet — these are suggestions, flagged in the UI).
function buildEvents(subjects: Subject[], exams: Exam[], monthStart: number): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  const push = (ts: number, e: CalEvent) => {
    const k = dayKey(ts);
    map.set(k, [...(map.get(k) ?? []), e]);
  };
  const view = new Date(monthStart);
  const month = view.getMonth();
  const year = view.getFullYear();
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));

  // Real exam events — a subject can have several exams, each on its own date.
  for (const exam of exams) {
    if (!exam.exam_date) continue;
    const subject = subjectById.get(exam.subject_id);
    if (!subject) continue;
    const ed = new Date(exam.exam_date);
    if (ed.getMonth() === month && ed.getFullYear() === year) {
      push(startOfLocalDay(ed.getTime()), { subject, kind: "exam", label: `${subject.name}: ${exam.title}`, time: "All day" });
    }
  }

  // Suggested sessions ~ every 6 days, alternating review/quiz, at staggered times.
  subjects.forEach((subject, si) => {
    for (let d = 2 + si; d < 28; d += 6) {
      const ts = monthStart + d * DAY_MS;
      const kind: EventKind = d % 12 < 6 ? "review" : "quiz";
      push(ts, { subject, kind, label: `${subject.name} ${kind}`, time: `${9 + (si % 6)}:00` });
    }
  });
  return map;
}

const KIND_LABEL: Record<EventKind, string> = { review: "Review", quiz: "Quiz", exam: "Exam" };

export function CalendarPlanner({ subjects, exams, cards, studySessions, now = Date.now() }: PlannerData & { now?: number }) {
  const today = new Date(now);
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const monthStart = view.getTime();
  const events = useMemo(() => buildEvents(subjects, exams, monthStart), [subjects, exams, monthStart]);

  // Build the 6×7 Monday-first grid for the visible month.
  const firstDow = (new Date(monthStart).getDay() + 6) % 7; // Mon=0
  const gridStart = monthStart - firstDow * DAY_MS;
  const cells = Array.from({ length: 42 }, (_, i) => {
    const ts = gridStart + i * DAY_MS;
    const d = new Date(ts);
    return { ts, day: d.getDate(), inMonth: d.getMonth() === view.getMonth(), isToday: startOfLocalDay(ts) === startOfLocalDay(now) };
  });

  const monthLabel = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const upcoming = subjects
    .map((s) => {
      const examDate = subjectExamDate(s.id, exams);
      return { s, examDate, days: daysUntil(examDate) };
    })
    .filter((x) => x.days != null && x.days >= 0)
    .sort((a, b) => (a.days as number) - (b.days as number))
    .slice(0, 4);

  const activity = weeklyActivity(studySessions, now);
  const goalHours = 10;
  const doneHours = activity.totalMinutes / 60;
  const goalPct = Math.min(100, Math.round((doneHours / goalHours) * 100));

  // Today's agenda = suggested events on today (if the visible month contains today).
  const agenda = (events.get(dayKey(startOfLocalDay(now))) ?? []).slice(0, 4);

  return (
    <section>
      <PageHeader
        title="Study planner"
        subtitle="Plan your study, stay consistent, ace your exams."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled title="Auto-planning is coming soon">
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden /> Auto-plan
            </Button>
            <Button size="sm" disabled title="Session scheduling is coming soon">
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Add session
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
            {/* Calendar toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-2 transition hover:bg-surface-2"><ChevronLeft className="h-4 w-4" strokeWidth={2} /></button>
                <button type="button" onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 transition hover:bg-surface-2">Today</button>
                <button type="button" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-2 transition hover:bg-surface-2"><ChevronRight className="h-4 w-4" strokeWidth={2} /></button>
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">{monthLabel}</h2>
              <div className="flex gap-3 text-xs text-muted">
                <Legend color="var(--legend-review)" label="Review" style={{ ["--legend-review" as string]: "#7c4dff" }} />
                <Legend color="#0ea5e9" label="Quiz" />
                <Legend color="#f59e0b" label="Exam" />
              </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-xs font-medium text-muted">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7">
              {cells.map((c) => {
                const evs = events.get(dayKey(c.ts)) ?? [];
                return (
                  <div key={c.ts} className={cn("min-h-[76px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !c.inMonth && "bg-surface-2/30")}>
                    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums", c.isToday ? "bg-brand-500 text-white" : c.inMonth ? "text-ink-2" : "text-subtle")}>{c.day}</span>
                    <div className="mt-1 space-y-1">
                      {evs.slice(0, 2).map((e, i) => (
                        <EventPill key={i} event={e} />
                      ))}
                      {evs.length > 2 ? <p className="px-1 text-[10px] font-medium text-muted">+{evs.length - 2} more</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">Suggested sessions are illustrative — session scheduling is coming soon.</p>
          </div>

          {/* Upcoming exams */}
          {upcoming.length > 0 ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">Upcoming exams</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {upcoming.map(({ s, days, examDate }) => {
                  const readiness = masteryBuckets(cards.filter((c) => c.subject_id === s.id)).masteredPct;
                  return (
                    <Link key={s.id} href={`/subjects/${s.id}`} style={subjectVars(s.id)} className="rounded-xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">{subjectInitials(s.name)}</span>
                          <div><p className="font-semibold text-ink">{s.name} exam</p><p className="text-xs text-muted">{formatDate(examDate)}</p></div>
                        </div>
                        <div className="text-right"><p className={cn("text-lg font-bold tabular-nums", (days as number) <= 7 ? "text-red-600 dark:text-red-400" : "text-ink")}>{days}</p><p className="text-[10px] uppercase text-muted">days left</p></div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[var(--sc-solid)]" style={{ width: `${readiness}%` }} /></div>
                        <span className="text-xs font-medium tabular-nums text-muted">{readiness}% ready</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Rail */}
        <aside className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Readiness countdown</h2>
            {upcoming.length === 0 ? <p className="text-sm text-muted">No exams scheduled.</p> : (
              <ul className="space-y-3">
                {upcoming.slice(0, 3).map(({ s, days }) => {
                  const readiness = masteryBuckets(cards.filter((c) => c.subject_id === s.id)).masteredPct;
                  return (
                    <li key={s.id} style={subjectVars(s.id)}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <span className={cn("flex-none font-semibold tabular-nums", (days as number) <= 7 ? "text-red-600 dark:text-red-400" : "text-muted")}>{days}d</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[var(--sc-solid)]" style={{ width: `${readiness}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Today&rsquo;s agenda</h2>
            {agenda.length === 0 ? <p className="text-sm text-muted">Nothing planned for today.</p> : (
              <ul className="space-y-2">
                {agenda.map((e, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="w-12 flex-none text-xs font-medium tabular-nums text-muted">{e.time}</span>
                    <span style={subjectVars(e.subject.id)} className="h-2 w-2 flex-none rounded-full bg-[var(--sc-solid)]" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{e.subject.name} <span className="text-muted">{KIND_LABEL[e.kind]}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold tracking-tight text-ink">Weekly goal</h2><Link href="/progress" className="text-xs font-medium text-brand-600 dark:text-brand-300">Details</Link></div>
            <div className="flex items-center gap-4">
              <GoalRing pct={goalPct} />
              <div><p className="text-sm text-muted">This week</p><p className="text-lg font-bold tabular-nums text-ink">{doneHours.toFixed(1)}h <span className="text-sm font-medium text-muted">/ {goalHours}h</span></p></div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-5 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden /><h2 className="text-base font-semibold tracking-tight text-ink">AI recommended</h2></div>
            <ul className="mt-3 space-y-2">
              {[{ i: Target, t: "Focus on your weakest subject", s: "Lower retention needs attention" }, { i: CalendarDays, t: "Review before your nearest exam", s: "High-impact this week" }, { i: Clock, t: "Take a quiz tomorrow", s: "Strengthen recall" }].map((r, k) => (
                <li key={k} className="flex items-center gap-3 rounded-lg bg-surface/70 p-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><r.i className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{r.t}</p><p className="truncate text-xs text-muted">{r.s}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

const KIND_COLOR: Record<EventKind, string> = { review: "#7c4dff", quiz: "#0ea5e9", exam: "#f59e0b" };
function EventPill({ event }: { event: CalEvent }) {
  const color = event.kind === "exam" ? KIND_COLOR.exam : undefined;
  return (
    <div style={color ? undefined : subjectVars(event.subject.id)} className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium" >
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: color ?? "var(--sc-solid)" }} />
      <span className="truncate text-ink-2">{event.kind === "exam" ? event.label : `${event.subject.name} ${KIND_LABEL[event.kind]}`}</span>
    </div>
  );
}

function Legend({ color, label, style }: { color: string; label: string; style?: React.CSSProperties }) {
  return <span className="inline-flex items-center gap-1" style={style}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function GoalRing({ pct }: { pct: number }) {
  const size = 76, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r, len = (pct / 100) * c;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><g transform={`rotate(-90 ${size / 2} ${size / 2})`}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(148 163 184 / 0.2)" strokeWidth={stroke} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#7c4dff" strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeLinecap="round" /></g></svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className="text-sm font-bold tabular-nums text-ink">{pct}%</span></div>
    </div>
  );
}

export function CalendarPlannerPage() {
  const { loading, error, data } = useAsync(() => loadDashboard(), []);
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Skeleton className="h-[480px] w-full rounded-2xl" /></div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  return <CalendarPlanner subjects={data.subjects} exams={data.exams} cards={data.cards} studySessions={data.studySessions} />;
}
