// Faithful TypeScript port of ios/Cram/Study/Scheduler.swift — standard SM-2 (ADR 0002) with
// the exam-date compression layer on top (ADR 0004).
//
// This MUST stay behaviourally identical to the Swift scheduler: the same card reviewed on web
// or iOS has to land on the same SM-2 state, or a last-writer-wins sync (ios-sync-client) would
// flip-flop the schedule between devices. `scheduler.test.ts` pins the pure logic to vectors
// derived from the Swift source so any drift fails a test rather than corrupting a schedule.
//
// SM-2 is the source of truth for a card's interval/ease; compression only bends the *effective*
// due date toward the exam. SM-2 state is never overwritten by compression, so a card degrades
// cleanly to plain SM-2 if the exam date is removed.

// SM-2 quality for a recall rating (iOS ReviewRating: 1 again / 3 hard / 4 good / 5 easy).
export type ReviewRating = 1 | 3 | 4 | 5;

export const REVIEW_RATINGS: { rating: ReviewRating; label: string }[] = [
  { rating: 1, label: "Again" },
  { rating: 3, label: "Hard" },
  { rating: 4, label: "Good" },
  { rating: 5, label: "Easy" },
];

// The canonical SM-2 state carried on a card (a structural subset of the Card wire type).
export interface SM2State {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
}

export interface ReviewOutcome extends SM2State {
  // Effective (possibly exam-compressed) next-review date, ISO-8601.
  due_date: string;
}

// Tunable compression constants (ADR 0004) — identical to Scheduler.swift.
const STRONG_SPACING_FRACTION = 0.5; // fraction of time-to-exam a strong card may wait
const WEAK_SPACING_FRACTION = 0.15; // smaller for a weak card, so it's reviewed earlier/denser

const MIN_EASE = 1.3; // SM-2 floor
const DEFAULT_EASE = 2.5; // SM-2 default (for mastery's ease span)

// --- SM-2 -------------------------------------------------------------------------------------

// Standard SM-2 update of interval/repetitions/ease for a 0–5 quality. Pure — returns new state.
export function updateSM2(state: SM2State, quality: number): SM2State {
  let { interval_days, repetitions, lapses } = state;

  if (quality < 3) {
    // Lapse: reset the repetition count and review again tomorrow.
    repetitions = 0;
    interval_days = 1;
    lapses += 1;
  } else {
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else interval_days = Math.round(interval_days * state.ease_factor);
    repetitions += 1;
  }

  // Ease factor update (clamped to the SM-2 minimum of 1.3). Math.round matches Swift's
  // .rounded() (round-half-away-from-zero) for the non-negative products used here.
  const q = quality;
  const newEase = state.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const ease_factor = Math.max(MIN_EASE, newEase);

  return { ease_factor, interval_days, repetitions, lapses };
}

// 0…1 mastery estimate from SM-2 state (1 = well known). Mirrors Card.mastery.
export function mastery(state: SM2State): number {
  // Ease ranges ~1.3…2.5+; combine with repetition count for a rough strength signal.
  const easeComponent = clamp01((state.ease_factor - MIN_EASE) / (DEFAULT_EASE - MIN_EASE));
  const repComponent = Math.min(state.repetitions / 5, 1);
  return 0.5 * easeComponent + 0.5 * repComponent;
}

// --- Exam-date compression (ADR 0004) ---------------------------------------------------------

// The effective interval (in days) before the next review. With no future exam (daysToExam is
// null), this is just the plain SM-2 interval. Pure.
export function effectiveIntervalDays(
  intervalDays: number,
  cardMastery: number,
  subjectStrength: number | null,
  daysToExam: number | null,
): number {
  if (daysToExam == null) return intervalDays; // no exam → plain SM-2, no compression

  // Combine per-card mastery with the subject's grade strength (neutral 0.5 default in iOS is
  // expressed by passing null → fall back to card mastery alone).
  const strength = combinedStrength(cardMastery, subjectStrength);
  const fraction = WEAK_SPACING_FRACTION + (STRONG_SPACING_FRACTION - WEAK_SPACING_FRACTION) * strength;

  const days = Math.max(1, daysToExam);
  const cappedInterval = Math.max(1, Math.round(days * fraction));
  return Math.min(intervalDays, cappedInterval);
}

function combinedStrength(cardMastery: number, subjectStrength: number | null): number {
  if (subjectStrength == null) return cardMastery;
  return 0.5 * cardMastery + 0.5 * subjectStrength;
}

// --- Public composer --------------------------------------------------------------------------

// Apply a review to a card: SM-2 update, then the effective (exam-compressed) due date. `now` is
// injectable for testing. Mirrors Scheduler.apply + effectiveDueDate. Pure (no I/O).
export function applyReview(
  state: SM2State,
  rating: ReviewRating,
  examDate: Date | null,
  subjectStrength: number | null,
  now: Date = new Date(),
): ReviewOutcome {
  const next = updateSM2(state, rating);

  let due: Date;
  if (examDate != null && examDate.getTime() > now.getTime()) {
    const daysToExam = wholeDaysBetween(now, examDate);
    const eff = effectiveIntervalDays(next.interval_days, mastery(next), subjectStrength, daysToExam);
    const compressed = addDays(now, eff);
    // Never schedule a review after the exam — late reviews are worthless.
    due = compressed.getTime() < examDate.getTime() ? compressed : examDate;
  } else {
    due = addDays(now, next.interval_days); // plain SM-2 (no exam / exam already passed)
  }

  return { ...next, due_date: due.toISOString() };
}

// --- Date helpers (calendar-day semantics, mirroring iOS Calendar.current) ---------------------

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

// Add whole calendar days, preserving wall-clock time (DST-aware, like date(byAdding:.day)).
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

// Whole days from `from` to `to` (mirrors Calendar.dateComponents([.day]) — the count of complete
// days in the interval). DST can shift this by the leap hour a couple of days a year; that is the
// same fuzziness the iOS side carries, and the value is clamped to >= 1 by the caller.
export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
