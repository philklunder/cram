"use client";

import { useState } from "react";

import { Badge, Button, EmptyState, ErrorBox, Panel, cn, inputClass, labelClass } from "@/components/ui";
import { createGradeEntry, deleteGradeEntry, updateSubject } from "@/lib/api/client";
import type { GradeEntry, GradeKind, Subject } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  currentGrade,
  formatGrade,
  gradeKindLabel,
  gradeKinds,
  gradingScaleLabel,
  isPassing,
  scaleRange,
} from "@/lib/grades";

// The Grades tab: record real-world marks per subject and see the current vs. target picture.
// Cram uses these grades to focus study time on weaker subjects and to pace toward the target
// (the subject's grade strength feeds SM-2 exam compression — see lib/srs/grade-strength.ts).
export function GradesPanel({
  subject,
  entries,
  onChanged,
}: {
  subject: Subject;
  entries: GradeEntry[];
  onChanged: () => void;
}) {
  const scale = subject.grading_scale;
  const current = currentGrade(subject.current_grade, entries);
  const target = subject.target_grade;
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <Summary subject={subject} current={current} target={target} onChanged={onChanged} />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Entries</h3>
          <span className="text-sm text-muted">
            {entries.length} {entries.length === 1 ? "grade" : "grades"}
          </span>
        </div>

        <AddGradeForm subjectId={subject.id} scale={scale} onAdded={onChanged} />

        {sorted.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No grades recorded yet"
              hint="Add a real mark above — exams, tests, or assignments — and Cram factors it into your study plan."
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {sorted.map((e, i) => (
              <GradeRow
                key={e.id}
                entry={e}
                index={i}
                scaleLabel={subject.grading_scale}
                onDeleted={onChanged}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Summary (current / target / gap, with an inline targets editor) ---------------------

function Summary({
  subject,
  current,
  target,
  onChanged,
}: {
  subject: Subject;
  current: number | null;
  target: number | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const scale = subject.grading_scale;

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Stat label="Current">
          {current == null ? (
            <span className="text-2xl font-semibold text-subtle">—</span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {formatGrade(scale, current)}
              </span>
              <Badge tone={isPassing(scale, current) ? "green" : "red"}>
                {isPassing(scale, current) ? "Pass" : "Fail"}
              </Badge>
            </span>
          )}
        </Stat>
        <Stat label="Target">
          {target == null ? (
            <span className="text-2xl font-semibold text-subtle">—</span>
          ) : (
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {formatGrade(scale, target)}
            </span>
          )}
        </Stat>
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit targets"}
          </Button>
        </div>
      </div>

      {current != null && target != null ? (
        <p className="text-sm text-ink-2">
          You’re at <span className="font-medium text-ink">{formatGrade(scale, current)}</span>, aiming
          for <span className="font-medium text-ink">{formatGrade(scale, target)}</span>.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Cram uses your grades to focus study time on weaker subjects and to pace toward your target.
        </p>
      )}

      {editing ? (
        <TargetsEditor subject={subject} onSaved={() => { setEditing(false); onChanged(); }} />
      ) : null}
    </Panel>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TargetsEditor({ subject, onSaved }: { subject: Subject; onSaved: () => void }) {
  const scale = subject.grading_scale;
  const [range] = useState(() => scaleRange(scale));
  const [target, setTarget] = useState(subject.target_grade != null ? String(subject.target_grade) : "");
  const [manual, setManual] = useState(subject.current_grade != null ? String(subject.current_grade) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const targetVal = parseScore(target);
    const manualVal = parseScore(manual);
    if (target.trim() !== "" && (targetVal == null || !inRange(targetVal, range))) {
      setError(`Target must be a number between ${range[0]} and ${range[1]}.`);
      return;
    }
    if (manual.trim() !== "" && (manualVal == null || !inRange(manualVal, range))) {
      setError(`Current grade must be a number between ${range[0]} and ${range[1]}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Blank clears the value (null); otherwise set the parsed number.
      await updateSubject(subject.id, {
        target_grade: target.trim() === "" ? null : targetVal,
        current_grade: manual.trim() === "" ? null : manualVal,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="animate-fade-up space-y-4 rounded-xl border border-line/80 bg-surface-2/50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="target-grade" className={labelClass}>
            Target grade <span className="font-normal text-muted">({gradingScaleLabel[scale]})</span>
          </label>
          <input
            id="target-grade"
            type="text"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. 1.7"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="manual-grade" className={labelClass}>
            Current grade <span className="font-normal text-muted">(optional override)</span>
          </label>
          <input
            id="manual-grade"
            type="text"
            inputMode="decimal"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="defaults to the entry average"
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-xs text-muted">
        Leave a field blank to clear it. The current grade defaults to the weighted average of your
        entries; set it here only to override.
      </p>
      {error ? <ErrorBox message={error} /> : null}
      <Button type="submit" size="sm" loading={busy}>
        Save
      </Button>
    </form>
  );
}

// --- Add a grade entry -------------------------------------------------------------------

function AddGradeForm({
  subjectId,
  scale,
  onAdded,
}: {
  subjectId: string;
  scale: Subject["grading_scale"];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<GradeKind>("exam");
  const [score, setScore] = useState("");
  const [weight, setWeight] = useState(100);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = scaleRange(scale);

  function reset() {
    setTitle("");
    setKind("exam");
    setScore("");
    setWeight(100);
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const scoreVal = parseScore(score);
    if (title.trim() === "") {
      setError("Give the grade a title.");
      return;
    }
    if (scoreVal == null || !inRange(scoreVal, range)) {
      setError(`Score must be a number between ${range[0]} and ${range[1]}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createGradeEntry({
        subject_id: subjectId,
        title: title.trim(),
        kind,
        score: scoreVal,
        weight: weight / 100,
        date: new Date(date).toISOString(),
      });
      reset();
      setOpen(false);
      onAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add the grade.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <span aria-hidden>+</span> Add grade
      </Button>
    );
  }

  return (
    <Panel className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="grade-title" className={labelClass}>
            Title
          </label>
          <input
            id="grade-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Midterm"
            className={inputClass}
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="grade-kind" className={labelClass}>
              Kind
            </label>
            <select
              id="grade-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as GradeKind)}
              className={inputClass}
            >
              {gradeKinds.map((k) => (
                <option key={k} value={k}>
                  {gradeKindLabel[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="grade-score" className={labelClass}>
              Score <span className="font-normal text-muted">({gradingScaleLabel[scale]})</span>
            </label>
            <input
              id="grade-score"
              type="text"
              inputMode="decimal"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder={`${range[0]}–${range[1]}`}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="grade-weight" className={labelClass}>
              Weight <span className="font-normal text-muted">({weight}% of the subject grade)</span>
            </label>
            <input
              id="grade-weight"
              type="range"
              min={0}
              max={100}
              step={5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="mt-3 w-full accent-brand-600"
            />
          </div>
          <div>
            <label htmlFor="grade-date" className={labelClass}>
              Date
            </label>
            <input
              id="grade-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={busy}>
            Save grade
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// --- One entry row -----------------------------------------------------------------------

function GradeRow({
  entry,
  index,
  scaleLabel,
  onDeleted,
}: {
  entry: GradeEntry;
  index: number;
  scaleLabel: Subject["grading_scale"];
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteGradeEntry(entry.id);
      onDeleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
    }
    // On success the parent reloads and this row unmounts — no need to clear `busy`.
  }

  return (
    <li className="animate-fade-up" style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}>
      <Panel className={cn(busy && "opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <span className="font-medium text-ink">{entry.title}</span>
          <span className="flex items-center gap-2">
            <Badge tone={isPassing(scaleLabel, entry.score) ? "green" : "red"}>
              {isPassing(scaleLabel, entry.score) ? "Pass" : "Fail"}
            </Badge>
            <span className="font-semibold tabular-nums text-ink">
              {formatGrade(scaleLabel, entry.score)}
            </span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <Badge tone="neutral">{gradeKindLabel[entry.kind]}</Badge>
          <span>{Math.round(entry.weight * 100)}%</span>
          <span aria-hidden>·</span>
          <span>{formatDate(entry.date)}</span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="ml-auto rounded text-xs font-medium text-subtle transition hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-red-400"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </Panel>
    </li>
  );
}

// --- helpers -----------------------------------------------------------------------------

// Parse a grade score, tolerating a comma decimal separator (like the iOS form). Returns null
// for anything non-numeric.
function parseScore(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function inRange(n: number, [lo, hi]: readonly [number, number]): boolean {
  return n >= lo && n <= hi;
}
