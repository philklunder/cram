// Dashboard aggregations — pure functions over the rows the client already syncs (subjects, cards,
// attempts, review-logs, study-sessions). No network here; loadDashboard() in api/client.ts fetches,
// these compute. Kept pure + deterministic (an injectable `now`) so they're unit-testable and match
// the rest of the app's client-compute pattern (SRS scheduler, progress heuristics).

import type {
  Attempt,
  Card,
  Question,
  Quiz,
  ReviewLog,
  StudySession,
  Subject,
} from "@/lib/api/types";
import { daysUntil } from "@/lib/format";
import { computeProgress } from "@/lib/progress";

const DAY_MS = 86_400_000;

// Local-calendar-day key (YYYY-MM-DD in the viewer's timezone). Streaks and activity are read the
// way a human reads a calendar, so bucketing is local, not UTC.
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Monday-anchored start of the local week containing `ts`.
function startOfLocalWeek(ts: number): number {
  const start = startOfLocalDay(ts);
  const dow = new Date(start).getDay(); // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7; // Mon=0
  return start - backToMonday * DAY_MS;
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

// --- Streak ------------------------------------------------------------------------------

export interface StreakDay {
  key: string;
  label: string; // single-letter weekday
  active: boolean;
  isToday: boolean;
}

export interface StreakStats {
  current: number; // consecutive days studied, counting today or (if today is idle) up to yesterday
  week: StreakDay[]; // current Mon–Sun week, for the dot row
  studiedToday: boolean;
}

export function computeStreak(reviewLogs: ReviewLog[], now: number = Date.now()): StreakStats {
  const active = new Set(reviewLogs.map((l) => dayKey(new Date(l.reviewed_at).getTime())));

  const todayStart = startOfLocalDay(now);
  const studiedToday = active.has(dayKey(todayStart));

  // Count consecutive active days. If today is still idle, a streak that ran through yesterday is
  // not broken yet, so start the walk at yesterday.
  let current = 0;
  let cursor = studiedToday ? todayStart : todayStart - DAY_MS;
  while (active.has(dayKey(cursor))) {
    current++;
    cursor -= DAY_MS;
  }

  const weekStart = startOfLocalWeek(now);
  const week: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = weekStart + i * DAY_MS;
    return {
      key: dayKey(dayStart),
      label: WEEKDAY_LABELS[i],
      active: active.has(dayKey(dayStart)),
      isToday: dayStart === todayStart,
    };
  });

  return { current, week, studiedToday };
}

// --- Cards due ---------------------------------------------------------------------------

export interface DueStats {
  due: number; // cards whose due date has passed (ready to review now)
  subjectsCount: number; // distinct subjects with at least one due card
}

export function computeDue(cards: Card[], now: number = Date.now()): DueStats {
  const subjects = new Set<string>();
  let due = 0;
  for (const c of cards) {
    if (new Date(c.due_date).getTime() <= now) {
      due++;
      subjects.add(c.subject_id);
    }
  }
  return { due, subjectsCount: subjects.size };
}

// --- Quiz average ------------------------------------------------------------------------

export interface QuizStats {
  count: number;
  avgPct: number | null; // 0..100, null when there are no attempts
  deltaPct: number | null; // this-week avg minus last-week avg, in points; null unless both weeks have data
}

function mean(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeQuizStats(attempts: Attempt[], now: number = Date.now()): QuizStats {
  if (attempts.length === 0) return { count: 0, avgPct: null, deltaPct: null };

  const avg = mean(attempts.map((a) => a.score)) ?? 0;

  const weekStart = startOfLocalWeek(now);
  const lastWeekStart = weekStart - 7 * DAY_MS;
  const thisWeek: number[] = [];
  const lastWeek: number[] = [];
  for (const a of attempts) {
    const t = new Date(a.created_at).getTime();
    if (t >= weekStart) thisWeek.push(a.score);
    else if (t >= lastWeekStart) lastWeek.push(a.score);
  }
  const tw = mean(thisWeek);
  const lw = mean(lastWeek);
  const deltaPct = tw !== null && lw !== null ? Math.round((tw - lw) * 100) : null;

  return { count: attempts.length, avgPct: Math.round(avg * 100), deltaPct };
}

// Per-subject quiz average (0..100), attributing each attempt to a subject via question → quiz →
// subject. Only subjects with at least one attempt appear in the map.
export function subjectQuizAverages(
  attempts: Attempt[],
  questions: Question[],
  quizzes: Quiz[],
): Map<string, number> {
  const quizSubject = new Map(quizzes.map((q) => [q.id, q.subject_id] as const));
  const questionSubject = new Map<string, string>();
  for (const q of questions) {
    const subjectId = quizSubject.get(q.quiz_id);
    if (subjectId) questionSubject.set(q.id, subjectId);
  }

  const scores = new Map<string, number[]>();
  for (const a of attempts) {
    const subjectId = questionSubject.get(a.question_id);
    if (!subjectId) continue;
    const list = scores.get(subjectId);
    if (list) list.push(a.score);
    else scores.set(subjectId, [a.score]);
  }

  const out = new Map<string, number>();
  for (const [subjectId, list] of scores) {
    const avg = mean(list);
    if (avg !== null) out.set(subjectId, Math.round(avg * 100));
  }
  return out;
}

// --- Nearest exam ------------------------------------------------------------------------

export interface NearestExam {
  subject: Subject;
  days: number;
}

export function nearestExam(subjects: Subject[]): NearestExam | null {
  let best: NearestExam | null = null;
  for (const s of subjects) {
    const days = daysUntil(s.exam_date);
    if (days === null || days < 0) continue;
    if (!best || days < best.days) best = { subject: s, days };
  }
  return best;
}

// --- Focus areas (weak topics) -----------------------------------------------------------

export interface FocusArea {
  topic: string;
  subjectId: string; // most common owning subject — drives the accent
  subjectName: string;
  masteredPct: number; // 0..100; lower = weaker
  total: number;
}

// Group cards by topic, score each by its mastery (reusing computeProgress), and return the
// weakest topics. Topics with too few cards are ignored as noise; fully-mastered topics are not
// "focus areas". Each topic is attributed to the subject that owns most of its cards.
export function focusAreas(
  cards: Card[],
  subjects: Subject[],
  { limit = 3, minCards = 3 }: { limit?: number; minCards?: number } = {},
): FocusArea[] {
  const subjectName = new Map(subjects.map((s) => [s.id, s.name] as const));
  const byTopic = new Map<string, Card[]>();
  for (const c of cards) {
    const topic = c.topic?.trim();
    if (!topic) continue;
    const list = byTopic.get(topic);
    if (list) list.push(c);
    else byTopic.set(topic, [c]);
  }

  const areas: FocusArea[] = [];
  for (const [topic, group] of byTopic) {
    if (group.length < minCards) continue;
    const { masteredPct } = computeProgress(group);
    if (masteredPct >= 100) continue;

    // Attribute the topic to whichever subject owns the most of its cards.
    const counts = new Map<string, number>();
    for (const c of group) counts.set(c.subject_id, (counts.get(c.subject_id) ?? 0) + 1);
    let subjectId = group[0].subject_id;
    let top = 0;
    for (const [id, n] of counts) {
      if (n > top) {
        top = n;
        subjectId = id;
      }
    }

    areas.push({
      topic,
      subjectId,
      subjectName: subjectName.get(subjectId) ?? "",
      masteredPct,
      total: group.length,
    });
  }

  areas.sort((a, b) => a.masteredPct - b.masteredPct || b.total - a.total);
  return areas.slice(0, limit);
}

// --- Upcoming reviews --------------------------------------------------------------------

export interface UpcomingReview {
  subject: Subject;
  count: number; // cards due within the window (overdue included)
  soonestDue: number; // epoch ms of the earliest due card
}

// Per-subject roll-up of cards due within `withinHours` (overdue counts as due), soonest first.
export function upcomingReviews(
  cards: Card[],
  subjects: Subject[],
  { withinHours = 48, limit = 5, now = Date.now() }: { withinHours?: number; limit?: number; now?: number } = {},
): UpcomingReview[] {
  const cutoff = now + withinHours * 3_600_000;
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));
  const agg = new Map<string, { count: number; soonestDue: number }>();

  for (const c of cards) {
    const due = new Date(c.due_date).getTime();
    if (due > cutoff) continue;
    const cur = agg.get(c.subject_id);
    if (cur) {
      cur.count++;
      cur.soonestDue = Math.min(cur.soonestDue, due);
    } else {
      agg.set(c.subject_id, { count: 1, soonestDue: due });
    }
  }

  const out: UpcomingReview[] = [];
  for (const [id, v] of agg) {
    const subject = subjectById.get(id);
    if (subject) out.push({ subject, count: v.count, soonestDue: v.soonestDue });
  }
  out.sort((a, b) => a.soonestDue - b.soonestDue);
  return out.slice(0, limit);
}

// --- Mastery buckets (4-way, for the topic-mastery donut) --------------------------------

export interface MasteryBuckets {
  mastered: number; // reviewed ≥2×, matured (interval ≥ 21d), never lapsed
  strong: number; // reviewed ≥2×, interval ≥ 7d
  practice: number; // actively learning
  weak: number; // lapsed before, or never successfully reviewed
  total: number;
  masteredPct: number; // 0..100
}

export function masteryBuckets(cards: Card[]): MasteryBuckets {
  let mastered = 0;
  let strong = 0;
  let weak = 0;
  let practice = 0;
  for (const c of cards) {
    if (c.lapses > 0 || c.repetitions === 0) weak++;
    else if (c.repetitions >= 2 && c.interval_days >= 21) mastered++;
    else if (c.repetitions >= 2 && c.interval_days >= 7) strong++;
    else practice++;
  }
  const total = cards.length;
  return { mastered, strong, practice, weak, total, masteredPct: total ? Math.round((mastered / total) * 100) : 0 };
}

// --- Activity heatmap (study minutes per day over N weeks) --------------------------------

export interface HeatDay {
  key: string;
  minutes: number;
  isToday: boolean;
  inFuture: boolean;
}

// `weeks` Monday-anchored columns × 7 day rows, ending with the current week. Powers the
// GitHub-style study-activity heatmap.
export function activityHeatmap(
  sessions: StudySession[],
  weeks: number,
  now: number = Date.now(),
): { grid: HeatDay[][]; max: number } {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const k = dayKey(startOfLocalDay(new Date(s.started_at).getTime()));
    byDay.set(k, (byDay.get(k) ?? 0) + s.duration_seconds / 60);
  }
  const weekStart = startOfLocalWeek(now);
  const start = weekStart - (weeks - 1) * 7 * DAY_MS;
  const todayStart = startOfLocalDay(now);
  const grid: HeatDay[][] = [];
  let max = 0;
  for (let w = 0; w < weeks; w++) {
    const col: HeatDay[] = [];
    for (let d = 0; d < 7; d++) {
      const dayStart = start + (w * 7 + d) * DAY_MS;
      const minutes = Math.round(byDay.get(dayKey(dayStart)) ?? 0);
      max = Math.max(max, minutes);
      col.push({ key: dayKey(dayStart), minutes, isToday: dayStart === todayStart, inFuture: dayStart > todayStart });
    }
    grid.push(col);
  }
  return { grid, max };
}

// --- Weekly activity ---------------------------------------------------------------------

export interface ActivityDay {
  key: string;
  label: string; // single-letter weekday
  minutes: number;
  isToday: boolean;
}

export interface WeeklyActivity {
  days: ActivityDay[]; // current Mon–Sun week
  totalMinutes: number; // this week
  deltaPct: number | null; // vs last week, in percent; null when last week had no activity
  hasData: boolean; // any recorded study time at all
}

export function weeklyActivity(sessions: StudySession[], now: number = Date.now()): WeeklyActivity {
  const weekStart = startOfLocalWeek(now);
  const lastWeekStart = weekStart - 7 * DAY_MS;
  const todayStart = startOfLocalDay(now);

  const minutesByDay = new Map<string, number>();
  let thisWeekTotal = 0;
  let lastWeekTotal = 0;

  for (const s of sessions) {
    const t = new Date(s.started_at).getTime();
    const minutes = s.duration_seconds / 60;
    if (t >= weekStart) {
      thisWeekTotal += minutes;
      const k = dayKey(startOfLocalDay(t));
      minutesByDay.set(k, (minutesByDay.get(k) ?? 0) + minutes);
    } else if (t >= lastWeekStart) {
      lastWeekTotal += minutes;
    }
  }

  const days: ActivityDay[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = weekStart + i * DAY_MS;
    const k = dayKey(dayStart);
    return {
      key: k,
      label: WEEKDAY_LABELS[i],
      minutes: Math.round(minutesByDay.get(k) ?? 0),
      isToday: dayStart === todayStart,
    };
  });

  const deltaPct =
    lastWeekTotal > 0 ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100) : null;

  return {
    days,
    totalMinutes: Math.round(thisWeekTotal),
    deltaPct,
    hasData: sessions.length > 0,
  };
}

// --- Format helpers ----------------------------------------------------------------------

// "4h 32m" / "45m" / "0m" — compact study-time duration from whole minutes.
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return `${h}h ${rem.toString().padStart(2, "0")}m`;
}

// Relative due label for the upcoming list: "Due now" / "Due in 3 hours" / "Due in 2 days".
export function formatDueIn(dueMs: number, now: number = Date.now()): string {
  const diff = dueMs - now;
  if (diff <= 0) return "Due now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `Due in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Due in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}
