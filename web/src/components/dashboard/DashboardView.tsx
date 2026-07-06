"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Flame,
  HelpCircle,
  Layers,
  Play,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";

import { Button, cn } from "@/components/ui";
import { StreakDots } from "@/components/dashboard/StreakCard";
import type { DashboardData } from "@/lib/api/client";
import type { Subject } from "@/lib/api/types";
import {
  computeDue,
  computeQuizStats,
  computeStreak,
  focusAreas,
  formatDueIn,
  formatMinutes,
  nearestExam,
  subjectQuizAverages,
  upcomingReviews,
  weeklyActivity,
  type WeeklyActivity,
} from "@/lib/dashboard";
import { daysUntil, formatCountdown, formatDate, subjectInitials } from "@/lib/format";
import { computeProgress } from "@/lib/progress";
import { subjectVars } from "@/lib/subjectColor";
import { useCountUp } from "@/lib/useCountUp";

// Presentational dashboard. Takes the already-fetched rows and derives every widget through the
// pure helpers in lib/dashboard.ts, so this file stays layout + markup. `now` is injectable for
// deterministic previews/tests.
export function DashboardView({ data, now = Date.now() }: { data: DashboardData; now?: number }) {
  const { subjects, cards, quizzes, questions, attempts, reviewLogs, studySessions } = data;

  const streak = computeStreak(reviewLogs, now);
  const due = computeDue(cards, now);
  const quiz = computeQuizStats(attempts, now);
  const exam = nearestExam(subjects);
  const quizAvgs = subjectQuizAverages(attempts, questions, quizzes);
  const areas = focusAreas(cards, subjects);
  const upcoming = upcomingReviews(cards, subjects, { now });
  const activity = weeklyActivity(studySessions, now);

  const topSubjects = [...subjects]
    .sort((a, b) => (daysUntil(a.exam_date) ?? 1e9) - (daysUntil(b.exam_date) ?? 1e9))
    .slice(0, 4);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main column */}
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <HeroBanner due={due.due} />

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatTile
            icon={Flame}
            tone="amber"
            label="Review streak"
            value={streak.current}
            unit={streak.current === 1 ? "day" : "days"}
            sub={streak.studiedToday ? "Studied today" : streak.current > 0 ? "Study today to keep it" : "Start today"}
          />
          <StatTile
            icon={Layers}
            tone="brand"
            label="Cards due today"
            value={due.due}
            sub={due.subjectsCount > 0 ? `Across ${due.subjectsCount} subject${due.subjectsCount === 1 ? "" : "s"}` : "All caught up"}
          />
          <QuizStatTile quiz={quiz} />
          <ExamStatTile exam={exam} />
        </div>

        <SubjectsSection subjects={topSubjects} data={data} quizAvgs={quizAvgs} now={now} />

        {areas.length > 0 ? <FocusAreasSection areas={areas} /> : null}
      </div>

      {/* Right rail */}
      <aside className="min-w-0 space-y-6">
        <AddMaterialCard />
        <WeeklyActivityCard activity={activity} />
        <UpcomingReviewsCard upcoming={upcoming} now={now} />
      </aside>
    </div>
  );
}

// --- Hero --------------------------------------------------------------------------------

function HeroBanner({ due }: { due: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/40 p-6 sm:p-8 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
      <div className="relative z-10 max-w-lg">
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">Good to see you 👋</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Ready for today&rsquo;s review?
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          Consistent practice. Smarter repetition. Better results.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/review">
            <Button>
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Start study session
            </Button>
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {due > 0 ? `Review ${due} card${due === 1 ? "" : "s"}` : "No cards due — nice work"}
          </span>
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

// --- Stat tiles --------------------------------------------------------------------------

type Tone = "brand" | "amber" | "green" | "red";
const toneChip: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  green: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
};

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  sub,
  subNode,
}: {
  icon: typeof Flame;
  tone: Tone;
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  subNode?: React.ReactNode;
}) {
  const numeric = typeof value === "number";
  const shown = useCountUp(numeric ? (value as number) : 0);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", toneChip[tone])}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-ink">
          {numeric ? Math.round(shown) : value}
        </span>
        {unit ? <span className="text-sm font-medium text-muted">{unit}</span> : null}
      </div>
      <div className="mt-0.5 min-h-[16px] text-xs text-muted">{subNode ?? sub}</div>
    </div>
  );
}

function QuizStatTile({ quiz }: { quiz: ReturnType<typeof computeQuizStats> }) {
  if (quiz.avgPct === null) {
    return <StatTile icon={TrendingUp} tone="brand" label="Avg quiz score" value="—" sub="No quizzes yet" />;
  }
  const up = (quiz.deltaPct ?? 0) >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;
  const subNode =
    quiz.deltaPct === null ? (
      "This week"
    ) : (
      <span className={cn("inline-flex items-center gap-1 font-medium", up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
        <TrendIcon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        {Math.abs(quiz.deltaPct)}% this week
      </span>
    );
  return <StatTile icon={TrendingUp} tone="brand" label="Avg quiz score" value={`${quiz.avgPct}%`} subNode={subNode} />;
}

function ExamStatTile({ exam }: { exam: ReturnType<typeof nearestExam> }) {
  if (!exam) {
    return <StatTile icon={CalendarDays} tone="brand" label="Nearest exam" value="—" sub="No exam scheduled" />;
  }
  const tone: Tone = exam.days <= 3 ? "red" : exam.days <= 10 ? "amber" : "brand";
  return (
    <StatTile
      icon={CalendarDays}
      tone={tone}
      label="Nearest exam"
      value={exam.days}
      unit={exam.days === 1 ? "day" : "days"}
      subNode={
        <span className="flex items-baseline gap-1">
          <span className="max-w-[10ch] truncate font-medium text-ink-2">{exam.subject.name}</span>
          <span>· {formatDate(exam.subject.exam_date)}</span>
        </span>
      }
    />
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
      <SectionHeader title="Your subjects" href="/subjects" cta="View all" />
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {subjects.map((s) => (
            <SubjectMiniCard
              key={s.id}
              subject={s}
              cards={data.cards.filter((c) => c.subject_id === s.id)}
              quizAvg={quizAvgs.get(s.id) ?? null}
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SubjectMiniCard({
  subject,
  cards,
  quizAvg,
  now,
}: {
  subject: Subject;
  cards: DashboardData["cards"];
  quizAvg: number | null;
  now: number;
}) {
  const p = computeProgress(cards);
  const days = daysUntil(subject.exam_date);
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

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-medium text-ink-2">Exam readiness</span>
          <span className="font-semibold tabular-nums text-ink">{p.masteredPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-[var(--sc-solid)] transition-[width] duration-700 ease-out"
            style={{ width: `${p.masteredPct}%` }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <MiniStat value={p.total} label="Cards" />
        <MiniStat value={p.dueNow} label="Due now" tone={p.dueNow > 0 ? "amber" : undefined} />
        <MiniStat value={quizAvg === null ? "—" : `${quizAvg}%`} label="Quiz avg" />
      </dl>
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

// --- Focus areas -------------------------------------------------------------------------

function FocusAreasSection({ areas }: { areas: ReturnType<typeof focusAreas> }) {
  return (
    <section>
      <SectionHeader title="Focus areas" href="/progress" cta="View all weak topics" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {areas.map((a) => (
          <div key={a.topic} style={subjectVars(a.subjectId)} className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-[var(--sc-solid)]" />
              <p className="truncate text-sm font-semibold text-ink" title={a.topic}>
                {a.topic}
              </p>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">{a.subjectName}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-[var(--sc-solid)]" style={{ width: `${a.masteredPct}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums text-ink-2">{a.masteredPct}%</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Right rail --------------------------------------------------------------------------

function RailCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-line bg-surface p-5 shadow-card", className)}>{children}</section>;
}

function AddMaterialCard() {
  return (
    <RailCard>
      <h2 className="text-base font-semibold tracking-tight text-ink">Add study material</h2>
      <p className="mt-1 text-sm text-muted">Upload your notes, PDFs or slides.</p>
      <Link
        href="/upload"
        className="mt-4 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-4 py-6 text-center transition duration-200 hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Upload className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-brand-700 dark:text-brand-200">Upload files</span>
        <span className="text-xs text-muted">PDF, DOCX, PPTX or TXT</span>
      </Link>

      <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-2/60 p-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-brand-sm">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Claude generates</p>
          <p className="truncate text-xs text-muted">Flashcards, quizzes &amp; summaries</p>
        </div>
        <div className="ml-auto flex items-center gap-1 text-muted" aria-hidden>
          <Layers className="h-4 w-4" strokeWidth={2} />
          <HelpCircle className="h-4 w-4" strokeWidth={2} />
          <FileText className="h-4 w-4" strokeWidth={2} />
        </div>
      </div>
    </RailCard>
  );
}

function WeeklyActivityCard({ activity }: { activity: WeeklyActivity }) {
  return (
    <RailCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-ink">Your weekly activity</h2>
        <Link
          href="/progress"
          className="inline-flex items-center gap-1 rounded-lg px-1 text-xs font-medium text-brand-600 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
        >
          View full progress
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>

      {activity.hasData ? (
        <>
          <ActivityChart activity={activity} />
          <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
            <div>
              <p className="text-xs text-muted">Study time this week</p>
              <p className="text-xl font-bold tabular-nums text-ink">{formatMinutes(activity.totalMinutes)}</p>
            </div>
            {activity.deltaPct !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  activity.deltaPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
                )}
              >
                {activity.deltaPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} /> : <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
                {Math.abs(activity.deltaPct)}% vs last week
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl bg-surface-2/50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink">No study time yet</p>
          <p className="mt-1 max-w-[24ch] text-xs text-muted">
            Start a review or quiz and your weekly study time will show up here.
          </p>
        </div>
      )}
    </RailCard>
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

function UpcomingReviewsCard({ upcoming, now }: { upcoming: ReturnType<typeof upcomingReviews>; now: number }) {
  return (
    <RailCard>
      <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Upcoming reviews</h2>
      {upcoming.length === 0 ? (
        <p className="rounded-xl bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">Nothing due soon.</p>
      ) : (
        <ul className="space-y-1">
          {upcoming.map(({ subject, count, soonestDue }) => {
            const overdue = soonestDue <= now;
            return (
              <li key={subject.id}>
                <Link
                  href={`/subjects/${subject.id}`}
                  style={subjectVars(subject.id)}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
                  >
                    {subjectInitials(subject.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{subject.name}</p>
                    <p className="text-xs text-muted">{count} card{count === 1 ? "" : "s"}</p>
                  </div>
                  <span className={cn("flex-none text-xs font-medium tabular-nums", overdue ? "text-red-600 dark:text-red-400" : "text-muted")}>
                    {formatDueIn(soonestDue, now)}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-subtle transition-transform group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}
