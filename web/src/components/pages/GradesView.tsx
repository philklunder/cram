"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, ChevronRight, GraduationCap, LayoutGrid, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  Panel,
  Skeleton,
  cn,
  inputClass,
  labelClass,
} from "@/components/ui";
import {
  createGradeEntry,
  createSubject,
  listGradeEntries,
  listSubjects,
} from "@/lib/api/client";
import type { GradeEntry, GradeKind, GradingScale, Subject } from "@/lib/api/types";
import { formatDate, subjectInitials } from "@/lib/format";
import {
  currentGrade,
  formatGrade,
  formatPercentInScale,
  gradeKindLabel,
  gradeKinds,
  gradePercent,
  gradingScaleLabel,
  isPassing,
  scaleRange,
} from "@/lib/grades";
import { useAsync } from "@/lib/useAsync";
import { useDisplayScale } from "@/lib/useDisplayScale";
import { subjectVars } from "@/lib/subjectColor";

type Status = "on-track" | "slightly-below" | "below" | "none";

interface Row {
  subject: Subject;
  entries: GradeEntry[];
  current: number | null;
  currentPct: number | null;
  targetPct: number | null;
  latest: GradeEntry | null;
  count: number;
  status: Status;
  trend: number[]; // normalized performance % per entry, oldest → newest
}

function buildRows(subjects: Subject[], entries: GradeEntry[]): Row[] {
  return subjects
    .map((subject) => {
      const own = entries
        .filter((e) => e.subject_id === subject.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const current = currentGrade(subject.current_grade, own);
      const currentPct = current == null ? null : gradePercent(subject.grading_scale, current);
      const targetPct =
        subject.target_grade == null ? null : gradePercent(subject.grading_scale, subject.target_grade);
      let status: Status = "none";
      if (currentPct != null && targetPct != null) {
        status = currentPct >= targetPct ? "on-track" : currentPct >= targetPct - 8 ? "slightly-below" : "below";
      }
      return {
        subject,
        entries: own,
        current,
        currentPct,
        targetPct,
        latest: own.length ? own[own.length - 1] : null,
        count: own.length,
        status,
        trend: own.map((e) => gradePercent(subject.grading_scale, e.score)),
      };
    })
    .sort((a, b) => (a.currentPct ?? 999) - (b.currentPct ?? 999));
}

export function GradesView({
  subjects,
  entries,
  onChanged = () => {},
}: {
  subjects: Subject[];
  entries: GradeEntry[];
  onChanged?: () => void;
}) {
  const displayScale = useDisplayScale();
  const rows = useMemo(() => buildRows(subjects, entries), [subjects, entries]);
  const graded = rows.filter((r) => r.currentPct != null);
  const overallPct =
    entries.length === 0
      ? null
      : Math.round(
          entries.reduce((s, e) => {
            const scale = subjects.find((sub) => sub.id === e.subject_id)?.grading_scale;
            return s + (scale ? gradePercent(scale, e.score) : 0);
          }, 0) / entries.length,
        );
  const avgBySubject =
    graded.length === 0 ? null : Math.round(graded.reduce((s, r) => s + (r.currentPct ?? 0), 0) / graded.length);
  const passing = graded.filter((r) => isPassing(r.subject.grading_scale, r.current as number)).length;

  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));

  return (
    <section>
      <PageHeader title="Grades" subtitle="Manage subjects, marks, and averages." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard icon={TrendingUp} label="Overall average" value={overallPct == null ? "—" : formatPercentInScale(displayScale, overallPct)} sub={displayScale === "percentage" ? "Normalized across scales" : `${gradingScaleLabel[displayScale].split(" ")[0]} scale`} />
            <StatCard icon={BarChart3} label="Average by subject" value={avgBySubject == null ? "—" : formatPercentInScale(displayScale, avgBySubject)} sub={`Across ${graded.length} subject${graded.length === 1 ? "" : "s"}`} />
            <StatCard icon={LayoutGrid} label="Total subjects" value={String(subjects.length)} sub="Active subjects" />
            <StatCard icon={CheckCircle2} label="Passing subjects" value={String(passing)} sub={graded.length ? `${Math.round((passing / graded.length) * 100)}% passing` : "—"} tone="green" />
          </div>

          <Panel className="p-0">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-base font-semibold tracking-tight text-ink">Subject overview</h2>
              <Link href="/subjects" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
                View all subjects
              </Link>
            </div>
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No subjects yet" hint="Create a subject on the right to start tracking grades." />
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-y border-line text-left text-xs font-medium uppercase tracking-wide text-muted">
                      <th className="px-5 py-2.5 font-medium">Subject</th>
                      <th className="px-3 py-2.5 font-medium">Current</th>
                      <th className="px-3 py-2.5 font-medium">Target</th>
                      <th className="px-3 py-2.5 font-medium">Latest</th>
                      <th className="px-3 py-2.5 text-center font-medium">Entries</th>
                      <th className="px-3 py-2.5 font-medium">Trend</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <SubjectRow key={r.subject.id} row={r} displayScale={displayScale} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel className="p-0">
            <h2 className="px-5 pt-5 text-base font-semibold tracking-tight text-ink">Recent grades</h2>
            {recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No grades recorded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {recent.map((e) => {
                  const s = subjectById.get(e.subject_id);
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{e.title}</span>
                      {s ? (
                        <span style={subjectVars(s.id)} className="hidden flex-none rounded-full bg-[var(--sc-soft)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--sc-ink)] sm:inline dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
                          {s.name}
                        </span>
                      ) : null}
                      <span className={cn("w-16 flex-none text-right font-semibold tabular-nums", s && isPassing(s.grading_scale, e.score) ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                        {s ? formatGrade(s.grading_scale, e.score) : e.score}
                      </span>
                      <span className="w-12 flex-none text-right text-xs tabular-nums text-muted">{Math.round(e.weight * 100)}%</span>
                      <span className="hidden w-24 flex-none text-right text-xs tabular-nums text-muted md:block">{formatDate(e.date)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Right rail: create subject + add grade */}
        <aside className="min-w-0 space-y-6">
          <NewSubjectForm onCreated={onChanged} />
          <AddGradeForm subjects={subjects} onAdded={onChanged} />
          <div className="rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
              <p className="text-sm font-semibold text-ink">Connected to your subjects</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Grades sync with subject pages and feed into your Progress and study pacing.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

const STATUS: Record<Status, { label: string; className: string }> = {
  "on-track": { label: "On track", className: "text-green-600 dark:text-green-400" },
  "slightly-below": { label: "Slightly below", className: "text-amber-600 dark:text-amber-400" },
  below: { label: "Below target", className: "text-red-600 dark:text-red-400" },
  none: { label: "No target", className: "text-muted" },
};

function SubjectRow({ row, displayScale }: { row: Row; displayScale: GradingScale }) {
  const { subject, current, currentPct, latest, count, status, trend } = row;
  const scale = subject.grading_scale;
  return (
    <tr style={subjectVars(subject.id)} className="border-b border-line last:border-0 transition-colors hover:bg-surface-2/50">
      <td className="px-5 py-3">
        <Link href={`/subjects/${subject.id}`} className="flex items-center gap-3 focus-visible:outline-none">
          <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25">
            {subjectInitials(subject.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{subject.name}</span>
            <span className="block text-xs capitalize text-muted">{scale} scale</span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3">
        {current == null || currentPct == null ? (
          <span className="text-muted">—</span>
        ) : (
          <div>
            <span className="font-semibold tabular-nums text-ink">{formatPercentInScale(displayScale, currentPct)}</span>
            <span className={cn("block text-xs", STATUS[status].className)}>{STATUS[status].label}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-3 font-medium tabular-nums text-ink-2">
        {subject.target_grade == null || row.targetPct == null ? "—" : formatPercentInScale(displayScale, row.targetPct)}
      </td>
      <td className="px-3 py-3">
        {latest ? (
          <div>
            <span className="font-semibold tabular-nums text-ink">{formatGrade(scale, latest.score)}</span>
            <span className="block text-xs text-muted">{gradeKindLabel[latest.kind]}</span>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-center tabular-nums text-ink-2">{count}</td>
      <td className="px-3 py-3">
        <Sparkline values={trend} />
      </td>
      <td className="px-3 py-3 text-right">
        <ChevronRight className="ml-auto h-4 w-4 text-subtle" strokeWidth={2} aria-hidden />
      </td>
    </tr>
  );
}

// A tiny trend line coloured by direction (improving green / declining red / flat amber).
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-subtle">—</span>;
  const w = 68;
  const h = 24;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const dir = values[values.length - 1] - values[0];
  const stroke = dir > 3 ? "#16a34a" : dir < -3 ? "#dc2626" : "#d97706";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline points={pts} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "brand",
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  tone?: "brand" | "green";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", tone === "green" ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300")}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

// --- New subject form --------------------------------------------------------------------

const SCALES: GradingScale[] = ["swiss", "german", "percentage", "letter", "gpa"];

function NewSubjectForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [scale, setScale] = useState<GradingScale>("swiss");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === "") {
      setError("Give the subject a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createSubject({ name: name.trim(), grading_scale: scale });
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the subject.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">New subject</h2>
        <p className="mt-0.5 text-sm text-muted">Create a subject to start tracking.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-subject-name" className={labelClass}>Subject name</label>
          <input id="new-subject-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biology 101" className={inputClass} />
        </div>
        <div>
          <label htmlFor="new-subject-scale" className={labelClass}>Grading scale</label>
          <select id="new-subject-scale" value={scale} onChange={(e) => setScale(e.target.value as GradingScale)} className={inputClass}>
            {SCALES.map((s) => (
              <option key={s} value={s}>{gradingScaleLabel[s]}</option>
            ))}
          </select>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        <Button type="submit" className="w-full" loading={busy}>Create subject</Button>
      </form>
    </Panel>
  );
}

// --- Add grade form (cross-subject) ------------------------------------------------------

function AddGradeForm({ subjects, onAdded }: { subjects: Subject[]; onAdded: () => void }) {
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<GradeKind>("exam");
  const [score, setScore] = useState("");
  const [weight, setWeight] = useState("25");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const range = subject ? scaleRange(subject.grading_scale) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject) {
      setError("Choose a subject.");
      return;
    }
    if (title.trim() === "") {
      setError("Give the grade an assessment title.");
      return;
    }
    const scoreVal = Number(score.replace(",", "."));
    if (!Number.isFinite(scoreVal) || (range && (scoreVal < range[0] || scoreVal > range[1]))) {
      setError(range ? `Grade must be between ${range[0]} and ${range[1]}.` : "Enter a valid grade.");
      return;
    }
    const weightVal = Math.min(100, Math.max(0, Number(weight) || 0));
    setBusy(true);
    setError(null);
    try {
      await createGradeEntry({
        subject_id: subject.id,
        title: title.trim(),
        kind,
        score: scoreVal,
        weight: weightVal / 100,
        date: new Date(date).toISOString(),
      });
      setTitle("");
      setScore("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the grade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">Add grade</h2>
        <p className="mt-0.5 text-sm text-muted">Record a new grade for a subject.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="ag-subject" className={labelClass}>Subject</label>
          <select id="ag-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ag-title" className={labelClass}>Assessment title</label>
          <input id="ag-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Midterm Exam" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ag-kind" className={labelClass}>Kind</label>
            <select id="ag-kind" value={kind} onChange={(e) => setKind(e.target.value as GradeKind)} className={inputClass}>
              {gradeKinds.map((k) => (
                <option key={k} value={k}>{gradeKindLabel[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ag-grade" className={labelClass}>Grade{range ? ` (${range[0]}–${range[1]})` : ""}</label>
            <input id="ag-grade" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 5.5" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ag-weight" className={labelClass}>Weight (%)</label>
            <input id="ag-weight" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="25" className={inputClass} />
          </div>
          <div>
            <label htmlFor="ag-date" className={labelClass}>Date</label>
            <input id="ag-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        <Button type="submit" className="w-full" loading={busy}>Save grade</Button>
      </form>
    </Panel>
  );
}

// --- Fetching wrapper --------------------------------------------------------------------

export function GradesPage() {
  const { loading, error, data, reload } = useAsync(
    () => Promise.all([listSubjects(), listGradeEntries()]),
    [],
  );
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const [subjects, entries] = data;
  return <GradesView subjects={subjects} entries={entries} onChanged={reload} />;
}
