"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button, ErrorBox, cn, inputClass, labelClass, selectClass } from "@/components/ui";
import { createSubject, deleteSubject, updateSubject } from "@/lib/api/client";
import type { GradingScale, Subject } from "@/lib/api/types";

const SCALES: { value: GradingScale; label: string }[] = [
  { value: "swiss", label: "Swiss (1–6)" },
  { value: "german", label: "German (1–6)" },
  { value: "percentage", label: "Percentage (0–100)" },
  { value: "letter", label: "Letter (A–F)" },
  { value: "gpa", label: "GPA (0–4)" },
];

// Create or edit a subject. Exam dates are intentionally absent — a subject spans a whole course
// (many exams), so an exam is scheduled later as its own thing, not baked onto the subject.
// In edit mode a destructive "Delete" action lives behind an inline confirm.
export function SubjectFormModal({
  open,
  onClose,
  subject,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  subject?: Subject | null; // present → edit mode; absent → create mode
  onSaved: (subject: Subject) => void;
  onDeleted?: (id: string) => void;
}) {
  const editing = Boolean(subject);

  const [name, setName] = useState("");
  const [scale, setScale] = useState<GradingScale>("swiss");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the fields from the subject each time the dialog opens (keeps the mounted-for-exit-anim
  // Modal in sync without a remount).
  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? "");
    setScale(subject?.grading_scale ?? "swiss");
    setTarget(subject?.target_grade != null ? String(subject.target_grade) : "");
    setError(null);
    setConfirmDelete(false);
  }, [open, subject]);

  const targetValue = target.trim() === "" ? null : Number(target);
  const targetInvalid = target.trim() !== "" && Number.isNaN(targetValue);
  const canSubmit = name.trim().length > 0 && !targetInvalid && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        grading_scale: scale,
        target_grade: targetValue,
      };
      const saved = subject
        ? await updateSubject(subject.id, payload)
        : await createSubject(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the subject.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!subject) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSubject(subject.id);
      onDeleted?.(subject.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the subject.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit subject" : "New subject"}
      description={
        editing
          ? "Update this subject's name, grading scale, or target grade."
          : "Add a course. You can generate flashcards and quizzes for it afterwards."
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="subject-name" className={labelClass}>
            Name
          </label>
          <input
            id="subject-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Organic Chemistry"
            autoComplete="off"
            className={inputClass}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="subject-scale" className={labelClass}>
              Grading scale
            </label>
            <div className="relative mt-1.5">
              <select
                id="subject-scale"
                value={scale}
                onChange={(e) => setScale(e.target.value as GradingScale)}
                className={cn(selectClass, "!mt-0")}
              >
                {SCALES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                strokeWidth={2}
                aria-hidden
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject-target" className={labelClass}>
              Target grade <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="subject-target"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 5.5"
              className={cn(inputClass, targetInvalid && "border-red-400 focus:border-red-400 focus:ring-red-500/15")}
              aria-invalid={targetInvalid || undefined}
            />
          </div>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        {/* Primary actions. In edit mode a Delete affordance sits opposite, behind a confirm. */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {editing && !confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-medium text-red-600 transition hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:text-red-400 dark:hover:text-red-300"
            >
              Delete
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!canSubmit}>
              {editing ? "Save changes" : "Create subject"}
            </Button>
          </div>
        </div>

        {/* Inline delete confirmation — destructive, so it's a deliberate second step. */}
        {editing && confirmDelete ? (
          <div className="mt-1 rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Delete “{subject?.name}”?
            </p>
            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
              This removes the subject and its cards, quizzes, sources and grades. This can’t be undone here.
            </p>
            <div className="mt-3 flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Keep it
              </Button>
              <Button
                type="button"
                onClick={onDelete}
                loading={busy}
                className="bg-gradient-to-b from-red-500 to-red-600 shadow-none hover:from-red-600 hover:to-red-700 focus-visible:ring-red-500"
              >
                Delete subject
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
