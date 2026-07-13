"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, ChevronRight, GraduationCap, LayoutGrid, TrendingUp } from "lucide-react";

import { GradesPanel } from "@/components/GradesPanel";
import { PageHeader } from "@/components/pages/shared";
import {
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
  listExams,
  listGradeEntries,
  listSubjects,
} from "@/lib/api/client";
import type { Exam, GradeEntry, GradeKind, GradingScale, Subject } from "@/lib/api/types";
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
  exams,
  entries,
  onChanged = () => {},
}: {
  subjects: Subject[];
  exams: Exam[];
  entries: GradeEntry[];
  onChanged?: () => void;
}) {
  const displayScale = useDisplayScale();
  const rows = useMemo(() => buildRows(subjects, entries), [subjects, entries]);
  const graded = rows.filter((r) => r.currentPct != null);
  // The one true average: every grade counts by its own weight, so a 40% final outweighs a 10%
  // quiz. (It used to be an unweighted mean, shown beside a second "average by subject" tile with
  // no explanation of why the two disagreed.) Entries carry `weight` as a fraction; a missing or
  // zero weight falls back to 1 so an unweighted entry still counts once.
  const overallPct = useMemo(() => {
    const scaleOf = new Map(subjects.map((s) => [s.id, s.grading_scale] as const));
    let weighted = 0;
    let total = 0;
    for (const e of entries) {
      const scale = scaleOf.get(e.subject_id);
      if (!scale) continue;
      const w = e.weight > 0 ? e.weight : 1;
      weighted += gradePercent(scale, e.score) * w;
      total += w;
    }
    return total === 0 ? null : Math.round(weighted / total);
  }, [subjects, entries]);

  const belowTarget = graded.filter((r) => r.status === "below" || r.status === "slightly-below");

  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));

  return (
    <section>
      <PageHeader title="Grades" subtitle="Manage subjects, marks, and averages." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard icon={TrendingUp} label="Overall average" value={overallPct == null ? "—" : formatPercentInScale(displayScale, overallPct)} sub="Weighted across every grade" />
            <StatCard
              icon={BarChart3}
              label="Below target"
              value={String(belowTarget.length)}
              sub={
                belowTarget.length === 0
                  ? "Every subject on track"
                  : belowTarget.slice(0, 2).map((r) => r.subject.name).join(", ") +
                    (belowTarget.length > 2 ? ` +${belowTarget.length - 2} more` : "")
              }
              tone={belowTarget.length ? "red" : "green"}
            />
            <StatCard icon={LayoutGrid} label="Total subjects" value={String(subjects.length)} sub="Active subjects" />
            <StatCard icon={CheckCircle2} label="Grades logged" value={String(entries.length)} sub={`Across ${graded.length} subject${graded.length === 1 ? "" : "s"}`} />
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
                <EmptyState
                  title="No subjects yet"
                  hint="Create a subject in the Subjects section to start tracking grades."
                  action={
                    <Link href="/subjects">
                      <Button variant="secondary" size="sm">Go to Subjects</Button>
                    </Link>
                  }
                />
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
                      <SubjectRow key={r.subject.id} row={r} displayScale={displayScale} onChanged={onChanged} />
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
                      {e.exam_id ? (
                        <Link
                          href={`/subjects/${e.subject_id}?exam=${e.exam_id}`}
                          className="min-w-0 flex-1 truncate font-medium text-ink underline-offset-2 hover:text-brand-600 hover:underline dark:hover:text-brand-300"
                        >
                          {e.title}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{e.title}</span>
                      )}
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

        {/* Right rail: log a grade (subjects are created in the Subjects section, not here) */}
        <aside className="min-w-0 space-y-6">
          <AddGradeForm subjects={subjects} exams={exams} entries={entries} onAdded={onChanged} />
          <div className="rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
              <p className="text-sm font-semibold text-ink">How grades work</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Grade an exam once it&apos;s over and it moves to that subject&apos;s{" "}
              <span className="font-medium text-ink-2">Past exams</span> — its flashcards and quiz stay,
              but it drops out of your active revision. New subjects are created in{" "}
              <Link href="/subjects" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
                Subjects
              </Link>
              .
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

function SubjectRow({ row, displayScale, onChanged }: { row: Row; displayScale: GradingScale; onChanged: () => void }) {
  const { subject, current, currentPct, latest, count, status, trend } = row;
  const scale = subject.grading_scale;
  const [open, setOpen] = useState(false);
  return (
    <>
    <tr style={subjectVars(subject.id)} className={cn("border-b border-line transition-colors hover:bg-surface-2/50", open && "bg-surface-2/40")}>
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
      {/* Current, Target and Latest all read in the subject's OWN scale. Converting the first two
          to a percent while Latest stayed a raw mark put "74% · target 86% · 2.0" in one row —
          three numbers on two scales. `currentPct` survives for sorting, status and the trend. */}
      <td className="px-3 py-3">
        {current == null || currentPct == null ? (
          <span className="text-muted">—</span>
        ) : (
          <div>
            <span className="font-semibold tabular-nums text-ink">{formatGrade(scale, current)}</span>
            <span className={cn("block text-xs", STATUS[status].className)}>{STATUS[status].label}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-3 font-medium tabular-nums text-ink-2">
        {subject.target_grade == null ? "—" : formatGrade(scale, subject.target_grade)}
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Hide ${subject.name} grades` : `Edit ${subject.name} grades`}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-90")} strokeWidth={2} aria-hidden />
        </button>
      </td>
    </tr>
    {open ? (
      <tr style={subjectVars(subject.id)} className="border-b border-line">
        <td colSpan={7} className="bg-surface-2/30 px-5 py-5">
          <GradesPanel subject={subject} entries={row.entries} onChanged={onChanged} />
        </td>
      </tr>
    ) : null}
    </>
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
  tone?: "brand" | "green" | "red";
}) {
  const chip =
    tone === "green"
      ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
      : tone === "red"
        ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
        : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300";
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", chip)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

// --- Log a grade (Subject → Exam → grade) ------------------------------------------------
// The single place grades are recorded. Grading an exam is what "finishes" it: the grade
// carries the exam's id, and the subject page then files that exam under "Past exams". A
// "standalone" grade (homework, participation) carries no exam and stays free-form. Subjects
// are created in the Subjects section — never here — so there is one home for that action.

const STANDALONE = "__standalone__";

// Exams still worth grading for a subject: this subject's exams that don't already have a
// (live) grade pointing at them. Once graded, an exam drops out of the picker (and the
// subject's active list) — you only grade an exam once.
function ungradedExamsFor(subjectId: string, exams: Exam[], entries: GradeEntry[]): Exam[] {
  const graded = new Set(entries.map((e) => e.exam_id).filter(Boolean));
  return exams
    .filter((e) => e.subject_id === subjectId && !graded.has(e.id))
    .sort((a, b) => {
      // Most-recently-dated first (that's the one you just sat); undated last.
      const da = a.exam_date ? new Date(a.exam_date).getTime() : -Infinity;
      const db = b.exam_date ? new Date(b.exam_date).getTime() : -Infinity;
      return db - da;
    });
}

function AddGradeForm({
  subjects,
  exams,
  entries,
  onAdded,
}: {
  subjects: Subject[];
  exams: Exam[];
  entries: GradeEntry[];
  onAdded: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [examChoice, setExamChoice] = useState(""); // "" none yet · STANDALONE · an exam id
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<GradeKind>("exam");
  const [score, setScore] = useState("");
  const [weight, setWeight] = useState("100");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const range = subject ? scaleRange(subject.grading_scale) : null;
  const ungraded = subject ? ungradedExamsFor(subject.id, exams, entries) : [];
  const isStandalone = examChoice === STANDALONE;
  const selectedExam = examChoice && !isStandalone ? ungraded.find((e) => e.id === examChoice) ?? null : null;
  const detailsReady = examChoice !== "";

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function pickSubject(id: string) {
    setSubjectId(id);
    setExamChoice("");
    setTitle("");
    setKind("exam");
    setScore("");
    setDate(today());
    setError(null);
  }

  // Choosing an exam prefills its name + date so grading is a two-tap job; choosing standalone
  // clears back to a free-form entry.
  function pickExam(choice: string) {
    setExamChoice(choice);
    setError(null);
    if (choice === STANDALONE || choice === "") {
      setTitle("");
      setKind("exam");
      setDate(today());
      return;
    }
    const exam = ungraded.find((e) => e.id === choice);
    setTitle(exam?.title ?? "");
    setKind("exam");
    setDate(exam?.exam_date ? exam.exam_date.slice(0, 10) : today());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject) {
      setError("Choose a subject.");
      return;
    }
    if (!detailsReady) {
      setError("Choose the exam this grade is for.");
      return;
    }
    if (title.trim() === "") {
      setError("Give the grade a title.");
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
        exam_id: isStandalone ? null : examChoice,
        title: title.trim(),
        kind,
        score: scoreVal,
        weight: weightVal / 100,
        date: new Date(date).toISOString(),
      });
      // Keep the subject in context; reset the rest so a second grade is quick to log.
      setExamChoice("");
      setTitle("");
      setScore("");
      setKind("exam");
      setDate(today());
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the grade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="space-y-5">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">Log a grade</h2>
        <p className="mt-0.5 text-sm text-muted">Pick a subject, then the exam it&apos;s for.</p>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          hint="Create a subject first, then come back to record its grades."
          action={
            <Link href="/subjects">
              <Button variant="secondary" size="sm">Go to Subjects</Button>
            </Link>
          }
        />
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {/* Step 1 — subject */}
          <div>
            <label htmlFor="ag-subject" className={labelClass}>Subject</label>
            <select id="ag-subject" value={subjectId} onChange={(e) => pickSubject(e.target.value)} className={inputClass}>
              <option value="">Select subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Step 2 — exam (reveals once a subject is chosen) */}
          {subject ? (
            <div className="animate-fade-up">
              <label htmlFor="ag-exam" className={labelClass}>Exam</label>
              <select id="ag-exam" value={examChoice} onChange={(e) => pickExam(e.target.value)} className={inputClass}>
                <option value="">Select exam…</option>
                {ungraded.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                    {ex.exam_date ? ` · ${formatDate(ex.exam_date)}` : ""}
                  </option>
                ))}
                <option value={STANDALONE}>No specific exam (standalone grade)</option>
              </select>
              <p className="mt-1.5 text-xs text-muted">
                {ungraded.length === 0
                  ? "No ungraded exams here — record a standalone grade for homework or participation."
                  : "Grading an exam moves it to Past exams and out of your active revision."}
              </p>
            </div>
          ) : null}

          {/* Step 3 — the mark (reveals once an exam or standalone is chosen) */}
          {subject && detailsReady ? (
            <div className="animate-fade-up space-y-4 border-t border-line pt-4">
              <div>
                <label htmlFor="ag-title" className={labelClass}>
                  {isStandalone ? "Title" : "Exam"}
                </label>
                <input
                  id="ag-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isStandalone ? "e.g. Homework 3" : "e.g. Midterm"}
                  readOnly={!isStandalone && selectedExam != null}
                  className={cn(inputClass, !isStandalone && selectedExam != null && "text-muted")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isStandalone ? (
                  <div>
                    <label htmlFor="ag-kind" className={labelClass}>Kind</label>
                    <select id="ag-kind" value={kind} onChange={(e) => setKind(e.target.value as GradeKind)} className={inputClass}>
                      {gradeKinds.map((k) => (
                        <option key={k} value={k}>{gradeKindLabel[k]}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className={isStandalone ? "" : "col-span-2"}>
                  <label htmlFor="ag-grade" className={labelClass}>Grade{range ? ` (${range[0]}–${range[1]})` : ""}</label>
                  <input id="ag-grade" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 5.5" className={inputClass} autoFocus />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ag-weight" className={labelClass}>Weight (%)</label>
                  <input id="ag-weight" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="100" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ag-date" className={labelClass}>Date</label>
                  <input id="ag-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          ) : null}

          {error ? <ErrorBox message={error} /> : null}
          <Button type="submit" className="w-full" loading={busy} disabled={!subject || !detailsReady}>
            Save grade
          </Button>
        </form>
      )}
    </Panel>
  );
}

// --- Fetching wrapper --------------------------------------------------------------------

export function GradesPage() {
  const { loading, error, data, reload } = useAsync(
    () => Promise.all([listSubjects(), listExams(), listGradeEntries()]),
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
  const [subjects, exams, entries] = data;
  return <GradesView subjects={subjects} exams={exams} entries={entries} onChanged={reload} />;
}
