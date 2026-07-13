"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";

import { Modal } from "@/components/Modal";
import { PageHeader, SelectChevron } from "@/components/pages/shared";
import { Button, EmptyState, ErrorBox, Skeleton, cn, inputClass, labelClass, selectClass } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Exam, StudySession, Subject } from "@/lib/api/types";
import { subjectExamDate, weeklyActivity } from "@/lib/dashboard";
import { VERDICT_FILL, readinessBySubject } from "@/lib/readiness";
import { DATE_LOCALE, daysUntil, formatDate, subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

interface PlannerData {
  subjects: Subject[];
  exams: Exam[];
  cards: DashboardData["cards"];
  studySessions: StudySession[];
  // "% ready" is the app-wide readiness score, which needs the quiz side too (lib/readiness.ts).
  questions: DashboardData["questions"];
  quizzes: DashboardData["quizzes"];
  attempts: DashboardData["attempts"];
}

type EventKind = "exam" | "study";
interface CalEvent {
  id: string;
  subject: Subject;
  kind: EventKind;
  label: string;
  time: string; // "10:00" or "All day"
  note?: string;
}

// A user-added study block. Local-only (browser localStorage) until a planning backend exists —
// so it survives refresh but does not sync to iOS. Kept deliberately simple.
interface StudyBlock {
  id: string;
  date: string; // "YYYY-MM-DD" (local day)
  subjectId: string;
  time: string; // "" for all-day, else "HH:MM"
  note: string;
}

const BLOCKS_KEY = "cram:planner:blocks";

const DAY_MS = 86_400_000;
function startOfLocalDay(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// Parse a "YYYY-MM-DD" as a local day.
function parseLocalDate(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

// Real exam events on their dates, plus the learner's own study blocks. No fabricated suggestions —
// everything on the calendar is either a real exam or something the user added.
function buildEvents(subjects: Subject[], exams: Exam[], blocks: StudyBlock[], monthStart: number): Map<string, CalEvent[]> {
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
      push(startOfLocalDay(ed.getTime()), { id: exam.id, subject, kind: "exam", label: `${subject.name}: ${exam.title}`, time: "All day" });
    }
  }

  // User-added study blocks in this month.
  for (const b of blocks) {
    const subject = subjectById.get(b.subjectId);
    if (!subject) continue;
    const ts = parseLocalDate(b.date);
    const d = new Date(ts);
    if (d.getMonth() === month && d.getFullYear() === year) {
      push(startOfLocalDay(ts), { id: b.id, subject, kind: "study", label: `${subject.name} study`, time: b.time || "All day", note: b.note });
    }
  }
  return map;
}

const KIND_LABEL: Record<EventKind, string> = { exam: "Exam", study: "Study" };

export function CalendarPlanner({ subjects, exams, cards, studySessions, questions, quizzes, attempts, now = Date.now() }: PlannerData & { now?: number }) {
  const today = new Date(now);
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // The learner's own study blocks, persisted locally (see StudyBlock). Loaded once on mount.
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BLOCKS_KEY);
      if (raw) setBlocks(JSON.parse(raw) as StudyBlock[]);
    } catch {
      // ignore malformed / unavailable storage
    }
  }, []);
  const persist = (next: StudyBlock[]) => {
    setBlocks(next);
    try {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / unavailable storage
    }
  };
  const addBlock = (b: StudyBlock) => persist([...blocks, b]);
  const removeBlock = (id: string) => persist(blocks.filter((b) => b.id !== id));

  const monthStart = view.getTime();
  const events = useMemo(() => buildEvents(subjects, exams, blocks, monthStart), [subjects, exams, blocks, monthStart]);

  // Build the 6×7 Monday-first grid for the visible month.
  const firstDow = (new Date(monthStart).getDay() + 6) % 7; // Mon=0
  const gridStart = monthStart - firstDow * DAY_MS;
  const cells = Array.from({ length: 42 }, (_, i) => {
    const ts = gridStart + i * DAY_MS;
    const d = new Date(ts);
    return { ts, day: d.getDate(), inMonth: d.getMonth() === view.getMonth(), isToday: startOfLocalDay(ts) === startOfLocalDay(now) };
  });

  const monthLabel = view.toLocaleDateString(DATE_LOCALE, { month: "long", year: "numeric" });

  // "% ready" is the app-wide readiness score, written only by Reviews — not card mastery alone.
  const readinessOf = useMemo(
    () => readinessBySubject(subjects, { cards, questions, quizzes, attempts }),
    [subjects, cards, questions, quizzes, attempts],
  );

  const upcoming = subjects
    .map((s) => {
      const examDate = subjectExamDate(s.id, exams);
      return { s, examDate, days: daysUntil(examDate) };
    })
    .filter((x) => x.days != null && x.days >= 0)
    .sort((a, b) => (a.days as number) - (b.days as number))
    .slice(0, 4);

  // The learner's own upcoming study blocks (today onward), resolved to their subject.
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s] as const)), [subjects]);
  const todayStart = startOfLocalDay(now);
  const upcomingBlocks = blocks
    .map((block) => ({ block, subject: subjectById.get(block.subjectId) }))
    .filter((x): x is { block: StudyBlock; subject: Subject } => !!x.subject && parseLocalDate(x.block.date) >= todayStart)
    .sort((a, b) => a.block.date.localeCompare(b.block.date))
    .slice(0, 6);

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
        subtitle="See every exam date at a glance and block out your own study time."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled title="Claude-generated study plans are coming soon">
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden /> Plan with Claude
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={subjects.length === 0}>
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
                <Legend color="#f59e0b" label="Exam" />
                <Legend color="#7c4dff" label="Study" />
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
            <p className="mt-3 text-xs text-muted">
              Exam dates come from your subjects. Study sessions you add are saved on this device only (not yet synced to iOS).
            </p>
          </div>

          {/* Upcoming exams */}
          {upcoming.length > 0 ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">Upcoming exams</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {upcoming.map(({ s, days, examDate }) => {
                  const r = readinessOf.get(s.id)!;
                  const untested = r.verdict === "untested";
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
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className={cn("h-full rounded-full", VERDICT_FILL[r.verdict])} style={{ width: `${untested ? 0 : r.score}%` }} /></div>
                        <span className="text-xs font-medium tabular-nums text-muted">{untested ? "Untested" : `${r.score}% ready`}</span>
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
                  const r = readinessOf.get(s.id)!;
                  const readiness = r.verdict === "untested" ? 0 : r.score;
                  return (
                    <li key={s.id} style={subjectVars(s.id)}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <span className={cn("flex-none font-semibold tabular-nums", (days as number) <= 7 ? "text-red-600 dark:text-red-400" : "text-muted")}>{days}d</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className={cn("h-full rounded-full", VERDICT_FILL[r.verdict])} style={{ width: `${readiness}%` }} /></div>
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

          {/* Your study sessions — the blocks the learner has added (local to this device). */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight text-ink">Your study sessions</h2>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)} disabled={subjects.length === 0}>
                <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Add
              </Button>
            </div>
            {upcomingBlocks.length === 0 ? (
              <p className="text-sm text-muted">No study sessions yet. Add one to block out time before an exam.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingBlocks.map(({ block, subject }) => (
                  <li key={block.id} className="flex items-center gap-3" style={subjectVars(subject.id)}>
                    <span className="h-2 w-2 flex-none rounded-full bg-[var(--sc-solid)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{subject.name}{block.note ? <span className="font-normal text-muted"> · {block.note}</span> : null}</p>
                      <p className="text-xs text-muted">{formatDate(block.date)}{block.time ? ` · ${block.time}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => removeBlock(block.id)} aria-label="Remove session" className="flex-none rounded-lg p-1.5 text-subtle transition hover:bg-surface-2 hover:text-red-600 dark:hover:text-red-400">
                      <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-5 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden /><h2 className="text-base font-semibold tracking-tight text-ink">Plan with Claude</h2></div>
            <p className="mt-2 text-sm text-ink-2">Soon, Claude will build a study plan across your subjects — weighted by exam dates, your grades, and what&rsquo;s weakest — and drop the sessions straight onto this calendar.</p>
            <p className="mt-2 text-xs font-medium text-muted">Coming soon</p>
          </div>
        </aside>
      </div>

      <AddSessionModal
        open={addOpen}
        subjects={subjects}
        defaultDate={new Date(now).toISOString().slice(0, 10)}
        onClose={() => setAddOpen(false)}
        onAdd={(b) => { addBlock(b); setAddOpen(false); }}
      />
    </section>
  );
}

// Add a local study block. Minimal by design: which subject, which day, optional time + note.
function AddSessionModal({
  open,
  subjects,
  defaultDate,
  onClose,
  onAdd,
}: {
  open: boolean;
  subjects: Subject[];
  defaultDate: string;
  onClose: () => void;
  onAdd: (b: StudyBlock) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId) { setError("Pick a subject."); return; }
    if (!date) { setError("Pick a date."); return; }
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk-${Date.now()}`;
    onAdd({ id, subjectId, date, time, note: note.trim() });
    setSubjectId("");
    setTime("");
    setNote("");
    setError(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a study session" description="Block out study time before an exam. Saved on this device.">
      {subjects.length === 0 ? (
        <EmptyState title="No subjects yet" hint="Create a subject first, then plan study time for it." />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="sess-subject" className={labelClass}>Subject</label>
            <div className="relative mt-1.5">
              <select id="sess-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cn(selectClass, "mt-0")}>
                <option value="" disabled>Select a subject…</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <SelectChevron />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sess-date" className={labelClass}>Date</label>
              <input id="sess-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sess-time" className={labelClass}>Time <span className="font-normal text-muted">(optional)</span></label>
              <input id="sess-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="sess-note" className={labelClass}>Note <span className="font-normal text-muted">(optional)</span></label>
            <input id="sess-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Chapters 4–6" className={inputClass} />
          </div>
          {error ? <ErrorBox message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Add session</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const KIND_COLOR: Record<EventKind, string> = { exam: "#f59e0b", study: "#7c4dff" };
function EventPill({ event }: { event: CalEvent }) {
  const color = KIND_COLOR[event.kind];
  const text = event.kind === "exam" ? event.label : `${event.subject.name}${event.note ? `: ${event.note}` : " study"}`;
  return (
    <div className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium" title={text}>
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate text-ink-2">{text}</span>
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
  return (
    <CalendarPlanner
      subjects={data.subjects}
      exams={data.exams}
      cards={data.cards}
      studySessions={data.studySessions}
      questions={data.questions}
      quizzes={data.quizzes}
      attempts={data.attempts}
    />
  );
}
