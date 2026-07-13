"use client";

import Link from "next/link";
import { Check, ChevronRight, Play, TrendingDown, TrendingUp, Upload } from "lucide-react";

import { Button, cn } from "@/components/ui";
import type { DashboardData } from "@/lib/api/client";
import type { Subject } from "@/lib/api/types";
import {
  computeDue,
  computeQuizStats,
  computeStreak,
  estimateReviewMinutes,
  focusAreas,
  formatMinutes,
  nearestExam,
  subjectExamDate,
  subjectQuizAverages,
  weeklyActivity,
  type WeeklyActivity,
} from "@/lib/dashboard";
import { daysUntil, formatCountdown, formatDate, subjectInitials } from "@/lib/format";
import { computeProgress } from "@/lib/progress";
import { VERDICT_FILL, computeReadiness, type Readiness } from "@/lib/readiness";
import { subjectVars } from "@/lib/subjectColor";
import { useCountUp } from "@/lib/useCountUp";

// Presentational dashboard. Takes the already-fetched rows and derives every widget through the
// pure helpers in lib/dashboard.ts, so this file stays layout + markup. `now` is injectable for
// deterministic previews/tests.
export function DashboardView({ data, now = Date.now(), name }: { data: DashboardData; now?: number; name?: string | null }) {
  const { subjects, exams, cards, quizzes, questions, attempts, reviewLogs, studySessions } = data;

  const streak = computeStreak(reviewLogs, now);
  const due = computeDue(cards, now);
  const quiz = computeQuizStats(attempts, now);
  const exam = nearestExam(subjects, exams);
  const quizAvgs = subjectQuizAverages(attempts, questions, quizzes);
  const activity = weeklyActivity(studySessions, now);

  const topSubjects = [...subjects]
    .sort(
      (a, b) =>
        (daysUntil(subjectExamDate(a.id, exams)) ?? 1e9) -
        (daysUntil(subjectExamDate(b.id, exams)) ?? 1e9),
    )
    .slice(0, 6);

  // Single stacked column, ordered the way a learner needs it: what to do now → how am I doing →
  // which subject needs me → how was my week. The old right rail (add-material, a duplicate weekly
  // chart, upcoming-reviews) was the main source of clutter; "Add material" now lives in the top
  // bar and the weekly chart takes the full width as the closing note.
  return (
    <div className="space-y-6">
      <HeroBanner due={due.due} subjectsCount={due.subjectsCount} exam={exam} name={name} />

      <FiguresStrip streak={streak} due={due} quiz={quiz} exam={exam} />

      <SubjectsSection subjects={topSubjects} data={data} quizAvgs={quizAvgs} now={now} />

      <WeeklyActivityCard activity={activity} />
    </div>
  );
}

// --- Hero --------------------------------------------------------------------------------

function HeroBanner({
  due,
  subjectsCount,
  exam,
  name,
}: {
  due: number;
  subjectsCount: number;
  exam: ReturnType<typeof nearestExam>;
  name?: string | null;
}) {
  // The hero answers "how much work is waiting?" in one line so the learner doesn't have to read the
  // figures below to decide. Minutes are an estimate, not a promise (~47s/card, shared with Review).
  const minutes = estimateReviewMinutes(due);
  const workload =
    due > 0 ? (
      <>
        <b className="font-semibold text-ink">
          {due} card{due === 1 ? "" : "s"}
        </b>{" "}
        due across{" "}
        <b className="font-semibold text-ink">
          {subjectsCount} subject{subjectsCount === 1 ? "" : "s"}
        </b>{" "}
        — about <b className="font-semibold text-ink">{minutes} min</b>.
      </>
    ) : (
      <>You&rsquo;re all caught up — nothing due right now.</>
    );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/40 p-6 sm:p-8 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
      <div className="relative z-10 max-w-xl">
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">
          {name ? `Good to see you, ${name}` : "Good to see you"} 👋
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Ready for today&rsquo;s review?
        </h1>
        <p className="mt-2 max-w-md text-sm text-ink-2">
          {workload}
          {exam && exam.days <= 7 ? (
            <>
              {" "}
              <span className="font-medium text-ink-2">
                {exam.subject.name} has an exam in {exam.days} day{exam.days === 1 ? "" : "s"}.
              </span>
            </>
          ) : null}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/review">
            <Button>
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Start study session
            </Button>
          </Link>
          <Link href="/quizzes">
            <Button variant="secondary">Take a quiz instead</Button>
          </Link>
        </div>
      </div>
      <HeroIllustration />
    </section>
  );
}

// Soft 3D-style study scene — clipboard checklist, a stack of books, and a potted plant on a
// lavender blob. Hand-built inline SVG (self-contained, no external asset), in the brand violet so
// it reads on both the light and dark hero. Purely decorative (aria-hidden), gated to wide
// viewports so it never crowds the copy.
function HeroIllustration() {
  const rows = [
    { y: 96, w: 48 },
    { y: 122, w: 42 },
    { y: 148, w: 46 },
    { y: 174, w: 34 },
  ];
  const leaves = [
    { a: -40, sx: 0.9, sy: 1.0, fill: "#b7a6ff" },
    { a: -16, sx: 1.0, sy: 1.15, fill: "#977bff" },
    { a: 6, sx: 0.95, sy: 1.3, fill: "#b7a6ff" },
    { a: 28, sx: 0.9, sy: 1.05, fill: "#977bff" },
    { a: 50, sx: 0.8, sy: 0.9, fill: "#b7a6ff" },
  ];
  const leaf = "M0,0 C-5,-12 -5,-26 0,-34 C5,-26 5,-12 0,0 Z";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 xl:block"
    >
      <svg viewBox="0 0 300 250" className="h-[190px] w-auto lg:h-[214px]" fill="none">
        <defs>
          <linearGradient id="hi-board" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#977bff" />
            <stop offset="1" stopColor="#6a2ff0" />
          </linearGradient>
          <linearGradient id="hi-check" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c4dff" />
            <stop offset="1" stopColor="#6a2ff0" />
          </linearGradient>
          <linearGradient id="hi-book-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6a2ff0" />
            <stop offset="1" stopColor="#591fd0" />
          </linearGradient>
          <linearGradient id="hi-book-t" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b7a6ff" />
            <stop offset="1" stopColor="#977bff" />
          </linearGradient>
          <linearGradient id="hi-pot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7c4dff" />
            <stop offset="1" stopColor="#591fd0" />
          </linearGradient>
        </defs>

        {/* Background blob + ground shadow */}
        <path
          d="M60,120 C50,66 104,38 164,44 C232,51 272,92 260,142 C250,188 198,206 148,200 C98,194 70,172 60,120 Z"
          fill="#7c4dff"
          fillOpacity="0.10"
        />
        <ellipse cx="156" cy="221" rx="126" ry="13" fill="#0f172a" fillOpacity="0.05" />

        {/* Plant (behind the board's right edge) */}
        <g>
          <rect x="256" y="171" width="40" height="8" rx="3" fill="#8b6bff" />
          <path d="M259,178 L293,178 L288,205 Q287,208 284,208 L268,208 Q265,208 264,205 Z" fill="url(#hi-pot)" />
          <g transform="translate(276,173)">
            {leaves.map((l) => (
              <g key={l.a} transform={`rotate(${l.a}) scale(${l.sx},${l.sy})`}>
                <path d={leaf} fill={l.fill} />
                <path d="M0,-3 L0,-30" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1" strokeLinecap="round" />
              </g>
            ))}
          </g>
        </g>

        {/* Clipboard */}
        <g>
          <rect x="140" y="68" width="110" height="140" rx="14" fill="url(#hi-board)" />
          <rect x="177" y="58" width="36" height="16" rx="7" fill="#5324bf" />
          <circle cx="195" cy="62.5" r="2.4" fill="#ffffff" fillOpacity="0.55" />
          <rect x="150" y="80" width="90" height="120" rx="6" fill="#ffffff" />
          {rows.map((r) => (
            <g key={r.y}>
              <rect x="160" y={r.y} width="14" height="14" rx="4" fill="url(#hi-check)" />
              <path
                d={`M163.4 ${r.y + 7} l2.2 2.4 l4.7 -5.3`}
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="182" y={r.y + 4.5} width={r.w} height="4.5" rx="2.25" fill="#e7e3f6" />
            </g>
          ))}
        </g>

        {/* Book stack (front, lower-left) */}
        <g transform="rotate(-3 92 195)">
          <rect x="30" y="182" width="120" height="26" rx="7" fill="url(#hi-book-b)" />
          <rect x="39" y="186" width="104" height="18" rx="4" fill="#fbfaff" />
          <rect x="46" y="190" width="90" height="1.6" rx="0.8" fill="#d7cdf5" />
          <rect x="46" y="195" width="90" height="1.6" rx="0.8" fill="#d7cdf5" />
          <rect x="46" y="200" width="90" height="1.6" rx="0.8" fill="#d7cdf5" />
        </g>
        <g transform="rotate(-6 94 170)">
          <rect x="48" y="158" width="94" height="22" rx="6" fill="url(#hi-book-t)" />
          <rect x="55" y="162" width="80" height="14" rx="3" fill="#fbfaff" />
          <rect x="61" y="166" width="68" height="1.5" rx="0.75" fill="#cdbffb" />
          <rect x="61" y="170.5" width="68" height="1.5" rx="0.75" fill="#cdbffb" />
        </g>
      </svg>
    </div>
  );
}

// --- Figures strip -----------------------------------------------------------------------

// The four headline figures as one bordered strip divided by hairlines, rather than four
// separately-bordered cards each carrying a coloured icon chip. The icons and chips were pure
// decoration — the numbers are the information. The only surviving colour is on Nearest exam when
// it's genuinely urgent (≤3 days), where red means something.
//
// Internal dividers come from a per-cell `border-l border-t` with the grid pulled out by `-m-px`,
// so the outermost borders tuck under the container's own border and every seam is a single line
// at any column count (2-up on mobile, 4-up from sm).
function FiguresStrip({
  streak,
  due,
  quiz,
  exam,
}: {
  streak: ReturnType<typeof computeStreak>;
  due: ReturnType<typeof computeDue>;
  quiz: ReturnType<typeof computeQuizStats>;
  exam: ReturnType<typeof nearestExam>;
}) {
  const quizUp = (quiz.deltaPct ?? 0) >= 0;
  const examUrgent = exam ? exam.days <= 3 : false;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="-m-px grid grid-cols-2 sm:grid-cols-4">
        <Figure
          value={streak.current}
          unit={streak.current === 1 ? "day" : "days"}
          label="Review streak"
          foot={
            streak.studiedToday ? (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Studied today
              </span>
            ) : streak.current > 0 ? (
              "Study today to keep it"
            ) : (
              "Start today"
            )
          }
        />
        <Figure
          value={due.due}
          label="Cards due today"
          foot={
            due.subjectsCount > 0
              ? `Across ${due.subjectsCount} subject${due.subjectsCount === 1 ? "" : "s"}`
              : "All caught up"
          }
        />
        <Figure
          value={quiz.avgPct === null ? "—" : `${quiz.avgPct}%`}
          label="Avg quiz score"
          foot={
            quiz.avgPct === null ? (
              "No quizzes yet"
            ) : quiz.deltaPct === null ? (
              "This week"
            ) : (
              <span className={cn("inline-flex items-center gap-1", quizUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                {quizUp ? <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
                {Math.abs(quiz.deltaPct)}% this week
              </span>
            )
          }
        />
        <Figure
          value={exam ? exam.days : "—"}
          unit={exam ? (exam.days === 1 ? "day" : "days") : undefined}
          label="Nearest exam"
          urgent={examUrgent}
          foot={
            exam ? (
              <span className="flex items-baseline gap-1">
                <span className="max-w-[10ch] truncate font-medium text-ink-2">{exam.subject.name}</span>
                <span>· {formatDate(exam.examDate)}</span>
              </span>
            ) : (
              "No exam scheduled"
            )
          }
        />
      </div>
    </div>
  );
}

function Figure({
  value,
  unit,
  label,
  foot,
  urgent = false,
}: {
  value: number | string;
  unit?: string;
  label: string;
  foot: React.ReactNode;
  urgent?: boolean;
}) {
  const numeric = typeof value === "number";
  const shown = useCountUp(numeric ? (value as number) : 0);
  return (
    <div className="border-l border-t border-line p-4">
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tabular-nums", urgent ? "text-red-600 dark:text-red-400" : "text-ink")}>
          {numeric ? Math.round(shown) : value}
        </span>
        {unit ? <span className={cn("text-sm font-medium", urgent ? "text-red-600/80 dark:text-red-400/80" : "text-muted")}>{unit}</span> : null}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
      <div className="mt-1.5 min-h-[16px] text-[11px] font-medium text-muted">{foot}</div>
    </div>
  );
}

// --- Your subjects -----------------------------------------------------------------------

function SectionHeader({ title, href, cta }: { title: string; href: string; cta: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-lg px-1 text-sm font-medium text-brand-600 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:text-brand-300 dark:hover:text-brand-200"
      >
        {cta}
        <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}

function SubjectsSection({
  subjects,
  data,
  quizAvgs,
  now,
}: {
  subjects: Subject[];
  data: DashboardData;
  quizAvgs: Map<string, number>;
  now: number;
}) {
  return (
    <section>
      <SectionHeader title="Your subjects" href="/subjects" cta={`View all ${data.subjects.length}`} />
      {subjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink">No subjects yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Upload material to generate your first deck and start studying.
          </p>
          <Link href="/upload" className="mt-4 inline-block">
            <Button size="sm">
              <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
              Add material
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s) => {
            const subjectCards = data.cards.filter((c) => c.subject_id === s.id);
            // The subject's single weakest topic, folded onto its own card (this replaced the
            // standalone "Focus areas" row, which forced you to map a topic back to its subject by
            // colour). `minCards: 2` keeps a lone card from being flagged as a weak "topic".
            const weakest = focusAreas(subjectCards, [s], { limit: 1, minCards: 2 })[0] ?? null;
            return (
              <SubjectMiniCard
                key={s.id}
                subject={s}
                examDate={subjectExamDate(s.id, data.exams)}
                cards={subjectCards}
                readiness={computeReadiness({ subjectId: s.id }, data)}
                quizAvg={quizAvgs.get(s.id) ?? null}
                weakestTopic={weakest?.topic ?? null}
                now={now}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function SubjectMiniCard({
  subject,
  examDate,
  cards,
  readiness,
  quizAvg,
  weakestTopic,
  now,
}: {
  subject: Subject;
  examDate: string | null;
  cards: DashboardData["cards"];
  readiness: Readiness;
  quizAvg: number | null;
  weakestTopic: string | null;
  now: number;
}) {
  const p = computeProgress(cards);
  const days = daysUntil(examDate);
  const examTone =
    days === null ? "muted" : days < 0 ? "muted" : days <= 3 ? "red" : days <= 10 ? "amber" : "brand";
  const examChip: Record<string, string> = {
    red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
    brand: "bg-brand-50 text-brand-700 ring-brand-600/15 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/20",
    muted: "bg-surface-2 text-muted ring-line",
  };

  return (
    <Link
      href={`/subjects/${subject.id}`}
      style={subjectVars(subject.id)}
      className="group block rounded-xl border border-line bg-surface p-4 shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--sc-line)] hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:border-[color:var(--sc-solid)]/45"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
        >
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{subject.name}</h3>
          <p className="truncate text-xs capitalize text-muted">{subject.grading_scale} scale</p>
        </div>
        <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", examChip[examTone])}>
          {days !== null && days >= 0 ? (days === 0 ? "Today" : `${days}d`) : formatCountdown(days)}
        </span>
      </div>

      {/* Readiness comes from Reviews only (lib/readiness.ts) — never from cramming. A subject you
          have never been tested on reads "Not tested yet", not 0%, which would be a lie. */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-medium text-ink-2">Exam readiness</span>
          <span className="font-semibold tabular-nums text-ink">
            {readiness.verdict === "untested" ? "—" : `${readiness.score}%`}
          </span>
        </div>
        {readiness.verdict === "untested" ? (
          <p className="text-[11px] text-subtle">Not tested yet — run a review</p>
        ) : (
          <div className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                VERDICT_FILL[readiness.verdict],
              )}
              style={{ width: `${readiness.score}%` }}
            />
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <MiniStat value={p.total} label="Cards" />
        <MiniStat value={p.dueNow} label="Due now" tone={p.dueNow > 0 ? "amber" : undefined} />
        <MiniStat value={quizAvg === null ? "—" : `${quizAvg}%`} label="Quiz avg" />
      </dl>

      {weakestTopic ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
          <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
          <span className="truncate">
            Weakest: <span className="font-medium text-ink-2">{weakestTopic}</span>
          </span>
        </p>
      ) : null}
    </Link>
  );
}

function MiniStat({ value, label, tone }: { value: number | string; label: string; tone?: "amber" }) {
  return (
    <div>
      <dd className={cn("text-sm font-bold tabular-nums", tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-ink")}>
        {value}
      </dd>
      <dt className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
    </div>
  );
}

// The closing region: the weekly-activity chart, now full width instead of squeezed into the rail.
// On wide screens the chart and the total sit side by side (chart | stat); they stack under xl.
function WeeklyActivityCard({ activity }: { activity: WeeklyActivity }) {
  return (
    <section>
      <SectionHeader title="This week" href="/progress" cta="Full progress" />
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        {activity.hasData ? (
          <div className="grid grid-cols-1 items-end gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
            <ActivityChart activity={activity} />
            <div className="border-t border-line pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
              <p className="text-xs text-muted">Study time this week</p>
              <p className="text-2xl font-bold tabular-nums text-ink">{formatMinutes(activity.totalMinutes)}</p>
              {activity.deltaPct !== null ? (
                <span
                  className={cn(
                    "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                    activity.deltaPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
                  )}
                >
                  {activity.deltaPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} /> : <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {Math.abs(activity.deltaPct)}% vs last week
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl bg-surface-2/50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-ink">No study time yet</p>
            <p className="mt-1 max-w-[32ch] text-xs text-muted">
              Start a review or quiz and your weekly study time will show up here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const CHART_PX = 96; // max bar height; definite px so heights render regardless of flex context

function ActivityChart({ activity }: { activity: WeeklyActivity }) {
  const max = Math.max(1, ...activity.days.map((d) => d.minutes));
  return (
    <div
      className="flex items-end justify-between gap-2"
      role="img"
      aria-label={`Study minutes per day this week, ${formatMinutes(activity.totalMinutes)} total`}
    >
      {activity.days.map((d) => {
        const h = d.minutes > 0 ? Math.max(6, Math.round((d.minutes / max) * CHART_PX)) : 2;
        return (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "w-full rounded-t-md transition-[height] duration-700 ease-out",
                d.minutes === 0
                  ? "bg-line"
                  : d.isToday
                    ? "bg-brand-500"
                    : "bg-brand-400/45 dark:bg-brand-400/35",
              )}
              style={{ height: `${h}px` }}
              title={`${d.minutes} min`}
            />
            <span className={cn("text-[10px] font-medium", d.isToday ? "text-brand-600 dark:text-brand-300" : "text-subtle")}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
