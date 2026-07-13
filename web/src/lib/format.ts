// Small presentation helpers for dates and the exam countdown.

// Every string in the app is hard-coded English, so dates must be too. Passing `undefined` to
// toLocaleDateString picks up the *browser's* locale, which rendered "13. Juli 2026" next to
// English copy on a German-locale machine. Pin it until the app is actually translated.
export const DATE_LOCALE = "en-GB";

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
  return d.toLocaleDateString(DATE_LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

// A first name to greet the user with. Prefers an OAuth display name (`full_name`/`name` from the
// provider), else derives a plausible name from the email local-part (before the first separator),
// capitalized — but only when it reads like a name (all letters, ≥2 chars) so we never greet
// "Good to see you, Pk123". Returns null when nothing usable is found (caller drops the name).
export function greetingName(
  metadata: Record<string, unknown> | undefined | null,
  email: string | null | undefined,
): string | null {
  const raw = metadata?.full_name ?? metadata?.name;
  const full = typeof raw === "string" ? raw.trim() : "";
  if (full) return full.split(/\s+/)[0];

  const local = (email ?? "").split("@")[0]?.split(/[.+_\-0-9]/)[0] ?? "";
  if (/^[a-zA-Z]{2,}$/.test(local)) return local[0].toUpperCase() + local.slice(1).toLowerCase();
  return null;
}

// Two-letter monogram for a subject: first + last word initial, or the first two letters of a
// single word. Used for the subject avatar on cards and the detail hero.
export function subjectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
