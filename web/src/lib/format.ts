// Small presentation helpers for dates and the exam countdown.

// Whole days from today (local) until the given date. Negative ⇒ in the past. Null input or
// unparseable date ⇒ null.
export function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const exam = new Date(dateIso);
  if (Number.isNaN(exam.getTime())) return null;
  const examDay = Date.UTC(exam.getFullYear(), exam.getMonth(), exam.getDate());
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((examDay - today) / 86_400_000);
}

export function formatCountdown(days: number | null): string {
  if (days === null) return "No exam date";
  if (days === 0) return "Exam today";
  if (days < 0) {
    const n = Math.abs(days);
    return `Exam ${n} day${n === 1 ? "" : "s"} ago`;
  }
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Two-letter monogram for a subject: first + last word initial, or the first two letters of a
// single word. Used for the subject avatar on cards and the detail hero.
export function subjectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
