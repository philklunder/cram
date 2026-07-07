"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Button, ErrorBox, cn, inputClass, labelClass } from "@/components/ui";
import { createExam, deleteExam, updateExam } from "@/lib/api/client";
import type { Exam } from "@/lib/api/types";

// Create or edit an exam within a subject. An exam is a named group of cards with an optional
// date (which drives its countdown + exam-mode scheduling). In edit mode a Delete action sits
// behind an inline confirm — deleting an exam keeps its cards (they move to "General").
export function ExamFormModal({
  open,
  onClose,
  subjectId,
  exam,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  exam?: Exam | null; // present → edit mode; absent → create mode
  onSaved: (exam: Exam) => void;
  onDeleted?: (id: string) => void;
}) {
  const editing = Boolean(exam);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(""); // yyyy-mm-dd from <input type="date">
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(exam?.title ?? "");
    setDate(exam?.exam_date ? exam.exam_date.slice(0, 10) : "");
    setError(null);
    setConfirmDelete(false);
  }, [open, exam]);

  const canSubmit = title.trim().length > 0 && !busy;
  // A date-only input has no time; anchor it at local midnight so the countdown reads the day.
  const examDateIso = date ? new Date(`${date}T00:00:00`).toISOString() : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const saved = exam
        ? await updateExam(exam.id, { title: title.trim(), exam_date: examDateIso })
        : await createExam({ subject_id: subjectId, title: title.trim(), exam_date: examDateIso });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the exam.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!exam) return;
    setBusy(true);
    setError(null);
    try {
      await deleteExam(exam.id);
      onDeleted?.(exam.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the exam.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit exam" : "New exam"}
      description={
        editing
          ? "Update this exam's name or date."
          : "Group the cards for one exam. Add material to it afterwards."
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="exam-title" className={labelClass}>
            Name
          </label>
          <input
            id="exam-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Midterm — Chapters 1–4"
            autoComplete="off"
            className={inputClass}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="exam-date" className={labelClass}>
            Date <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="exam-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={cn(inputClass, "[color-scheme:light] dark:[color-scheme:dark]")}
          />
          <p className="mt-1.5 text-xs text-muted">
            Drives the countdown and pulls reviews forward as the exam nears.
          </p>
        </div>

        {error ? <ErrorBox message={error} /> : null}

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
              {editing ? "Save changes" : "Create exam"}
            </Button>
          </div>
        </div>

        {editing && confirmDelete ? (
          <div className="mt-1 rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Delete “{exam?.title}”?</p>
            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
              The exam is removed. Its cards aren’t deleted — they move to this subject’s “General”.
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
                Delete exam
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
