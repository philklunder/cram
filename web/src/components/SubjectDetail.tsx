"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarClock, CheckCircle2, ChevronDown, Pencil, Play, Plus } from "lucide-react";

import { ExamFormModal } from "@/components/ExamFormModal";
import { SubjectGradesSummary } from "@/components/GradesPanel";
import { QuizRunner } from "@/components/QuizRunner";
import { SubjectFormModal } from "@/components/SubjectFormModal";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  PageLoader,
  Panel,
  buttonClass,
  cn,
  difficultyTone,
} from "@/components/ui";
import { loadSubjectBundle, type SubjectBundle } from "@/lib/api/client";
import type { Attempt, Card, Exam, GradeEntry, Question, Quiz, Source, Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown, formatDate, subjectInitials } from "@/lib/format";
import { computeProgress } from "@/lib/progress";
import {
  VERDICT_COPY,
  VERDICT_FILL,
  computeReadiness,
  scoreFill,
  type Readiness,
  type TopicStat,
} from "@/lib/readiness";
import { formatGrade, isPassing } from "@/lib/grades";
import { studyHref } from "@/lib/studyLink";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

const GENERAL = "__general__";

// A card is due when its effective due date has passed.
function dueCount(cards: Card[]): number {
  const now = Date.now();
  return cards.filter((c) => new Date(c.due_date).getTime() <= now).length;
}

// Exam-countdown color: urgent red, soon amber, else calm.
function countdownClass(days: number | null): string {
  if (days === null) return "text-muted";
  if (days < 0) return "text-subtle";
  if (days <= 3) return "text-red-600 dark:text-red-400";
  if (days <= 10) return "text-amber-600 dark:text-amber-400";
  return "text-ink-2";
}

// Exams sorted for display: soonest dated first, undated last, then by title.
function byExamOrder(a: Exam, b: Exam): number {
  const da = a.exam_date ? new Date(a.exam_date).getTime() : null;
  const db = b.exam_date ? new Date(b.exam_date).getTime() : null;
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }
  return a.title.localeCompare(b.title);
}

// The subject page is where material lives — it browses and organises, it does not assess. Every
// "Study" affordance here links into the Flashcards hub with this subject (and exam) pre-scoped,
// where you can practise the deck. Progress is only ever measured by a Review. See lib/readiness.ts.
// Self-fetching wrapper for the /subjects/[id] route. The pure view below takes the bundle as a
// prop so the /preview harness can render the whole page without a backend.
export function SubjectDetail({ id }: { id: string }) {
  const { loading, error, data, reload } = useAsync<SubjectBundle>(() => loadSubjectBundle(id), [id]);

  if (loading) return <PageLoader label="Loading subject…" />;
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox message={error} />
      </div>
    );
  }
  if (!data) return null;

  return <SubjectDetailView data={data} onReload={reload} />;
}

export function SubjectDetailView({ data, onReload = () => {} }: { data: SubjectBundle; onReload?: () => void }) {
  const router = useRouter();
  // A grade in the Grades page deep-links here as ?exam=<id> so the finished exam it belongs
  // to opens straight to its material in "Past exams".
  const focusExam = useSearchParams().get("exam");

  const [editSubjectOpen, setEditSubjectOpen] = useState(false);
  const [examModal, setExamModal] = useState<{ open: boolean; exam: Exam | null }>({ open: false, exam: null });

  const { subject, exams, sources, cards, quizzes, questions, gradeEntries, attempts } = data;
  const examById = new Map(exams.map((e) => [e.id, e]));

  // Exam readiness for the whole subject — the honest "how ready am I", from scored reviews only
  // (recall + quiz), never from cramming. computeReadiness filters the passed data by subject id.
  const readiness = computeReadiness({ subjectId: subject.id }, { cards, questions, quizzes, attempts });

  // Bucket cards/quizzes by exam. A card whose exam is missing/deleted falls back to General.
  const bucketOf = (examId: string | null) => (examId && examById.has(examId) ? examId : GENERAL);
  const cardsByBucket = new Map<string, Card[]>();
  for (const c of cards) {
    const k = bucketOf(c.exam_id);
    (cardsByBucket.get(k) ?? cardsByBucket.set(k, []).get(k)!).push(c);
  }
  const quizzesByBucket = new Map<string, Quiz[]>();
  for (const q of quizzes) {
    const k = bucketOf(q.exam_id);
    (quizzesByBucket.get(k) ?? quizzesByBucket.set(k, []).get(k)!).push(q);
  }

  const generalCards = cardsByBucket.get(GENERAL) ?? [];
  const generalQuizzes = quizzesByBucket.get(GENERAL) ?? [];
  const sortedExams = [...exams].sort(byExamOrder);

  // A graded exam is "done": a live grade entry points at it. Done exams drop out of the
  // active list into "Past exams" — their cards/quiz survive, just out of active revision.
  const gradeByExam = new Map<string, GradeEntry>();
  for (const g of gradeEntries) if (g.exam_id) gradeByExam.set(g.exam_id, g);
  const activeExams = sortedExams.filter((e) => !gradeByExam.has(e.id));
  const pastExams = sortedExams.filter((e) => gradeByExam.has(e.id));
  // Cards of a graded exam leave active revision with it; "General" + active-exam cards stay.
  const activeCards = cards.filter((c) => !(c.exam_id && gradeByExam.has(c.exam_id)));
  const totalDue = dueCount(activeCards);

  // Soonest upcoming active exam — drives the header countdown chip.
  const nearest =
    activeExams
      .map((e) => ({ exam: e, days: daysUntil(e.exam_date) }))
      .filter((x): x is { exam: Exam; days: number } => x.days != null && x.days >= 0)
      .sort((a, b) => a.days - b.days)[0] ?? null;

  // Adding material happens in AI Decks, not here — deep-link there with this subject (and exam)
  // pre-selected so the upload flow lands ready to go.
  const goAddMaterial = (examId: string | null) => {
    const params = new URLSearchParams({ subject: subject.name });
    if (examId) params.set("exam", examId);
    router.push(`/upload?${params.toString()}`);
  };
  const openExamModal = (exam: Exam | null) => setExamModal({ open: true, exam });

  return (
    <section style={subjectVars(subject.id)} className="space-y-6">
      <BackLink />

      <SubjectHero
        subject={subject}
        cards={cards}
        readiness={readiness}
        examCountdown={nearest ? { days: nearest.days } : null}
        primary={
          activeCards.length > 0 ? (
            <Link
              href={studyHref({ subjectId: subject.id, dueOnly: totalDue > 0, start: true })}
              className={buttonClass("primary", "md", "flex-none")}
            >
              <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              {totalDue > 0 ? `Study ${totalDue} due` : "Study subject"}
            </Link>
          ) : null
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => openExamModal(null)}>
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              New exam
            </Button>
            <Button variant="secondary" size="sm" onClick={() => goAddMaterial(null)}>
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              Add material
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditSubjectOpen(true)}>
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
              Edit
            </Button>
          </>
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          title="No cards yet"
          hint="Create an exam and add material, or add material straight to “General”. Cram builds the flashcards and a quiz."
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button onClick={() => openExamModal(null)}>
                <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                New exam
              </Button>
              <Button variant="secondary" onClick={() => goAddMaterial(null)}>
                Add material
              </Button>
            </div>
          }
        />
      ) : (
        /* At-a-glance overview: how ready you are, and which topics are weakest. */
        <OverviewCards cards={cards} readiness={readiness} />
      )}

          {/* Exams — the active ones. Each is a collapsible group of its own cards + quiz. */}
          {activeExams.length > 0 || generalCards.length > 0 || generalQuizzes.length > 0 ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">Exams</h2>
                <Button variant="ghost" size="sm" onClick={() => openExamModal(null)}>
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  New exam
                </Button>
              </div>
              <div className="border-b border-line">
                {activeExams.map((exam) => (
                  <ExamSection
                    key={exam.id}
                    exam={exam}
                    cards={cardsByBucket.get(exam.id) ?? []}
                    quizzes={quizzesByBucket.get(exam.id) ?? []}
                    questions={questions}
                    href={studyHref({ subjectId: subject.id, examId: exam.id, start: true })}
                    onAddMaterial={() => goAddMaterial(exam.id)}
                    onEdit={() => openExamModal(exam)}
                  />
                ))}
                {generalCards.length > 0 || generalQuizzes.length > 0 ? (
                  <ExamSection
                    exam={null}
                    cards={generalCards}
                    quizzes={generalQuizzes}
                    questions={questions}
                    href={studyHref({ subjectId: subject.id, general: true, start: true })}
                    onAddMaterial={() => goAddMaterial(null)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Past exams — graded and done. Kept for reference and revision, out of the way. */}
          {pastExams.length > 0 ? (
            <Section
              title="Past exams"
              count={pastExams.length}
              defaultOpen={pastExams.some((e) => e.id === focusExam)}
            >
              <div>
                {pastExams.map((exam) => (
                  <ExamSection
                    key={exam.id}
                    exam={exam}
                    cards={cardsByBucket.get(exam.id) ?? []}
                    quizzes={quizzesByBucket.get(exam.id) ?? []}
                    questions={questions}
                    href={studyHref({ subjectId: subject.id, examId: exam.id, start: true })}
                    onAddMaterial={() => goAddMaterial(exam.id)}
                    onEdit={() => openExamModal(exam)}
                    earned={{ subject, entry: gradeByExam.get(exam.id)! }}
                    defaultOpen={exam.id === focusExam}
                  />
                ))}
              </div>
            </Section>
          ) : null}

          {/* Subject-level material that isn't per-exam. */}
          <div className="border-b border-line">
            <Section title="Sources" count={sources.length}>
              <SourcesTab sources={sources} />
            </Section>
            <Section title="Grades" count={gradeEntries.length}>
              <SubjectGradesSummary subject={subject} entries={gradeEntries} />
            </Section>
          </div>

      {/* Edit / delete this subject. */}
      <SubjectFormModal
        open={editSubjectOpen}
        onClose={() => setEditSubjectOpen(false)}
        subject={subject}
        onSaved={() => onReload()}
        onDeleted={() => router.push("/subjects")}
      />

      {/* Create / edit an exam. */}
      <ExamFormModal
        open={examModal.open}
        onClose={() => setExamModal((m) => ({ ...m, open: false }))}
        subjectId={subject.id}
        exam={examModal.exam}
        onSaved={() => onReload()}
        onDeleted={() => onReload()}
      />
    </section>
  );
}

// --- Hero -------------------------------------------------------------------------------

const VERDICT_TONE: Record<Readiness["verdict"], string> = {
  ready: "text-green-600 dark:text-green-400",
  almost: "text-amber-600 dark:text-amber-400",
  "keep-going": "text-red-600 dark:text-red-400",
  untested: "text-muted",
};

// The subject header: identity tile, name, scale/target/count meta, the nearest-exam countdown
// chip, an exam-readiness read, and a primary study action. `readiness`, `examCountdown` and
// `primary` are optional so the /preview harness can still render the basic identity card.
export function SubjectHero({
  subject,
  cards,
  readiness,
  examCountdown,
  primary,
  actions,
}: {
  subject: Subject;
  cards: Card[];
  readiness?: Readiness;
  examCountdown?: { days: number } | null;
  primary?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const p = computeProgress(cards);
  const tested = readiness != null && readiness.verdict !== "untested";

  return (
    <div className="animate-fade-up rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl text-xl font-bold text-white shadow-sm [background-image:linear-gradient(140deg,var(--sc-from),var(--sc-to))]">
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{subject.name}</h1>
            {examCountdown ? <ExamCountdownChip days={examCountdown.days} /> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span>
              <span className="capitalize">{subject.grading_scale}</span> scale
            </span>
            {subject.target_grade != null ? (
              <>
                <span aria-hidden className="text-subtle">·</span>
                <span>target {subject.target_grade}</span>
              </>
            ) : null}
            <span aria-hidden className="text-subtle">·</span>
            <span className="tabular-nums">
              {p.total} {p.total === 1 ? "card" : "cards"}
            </span>
            {p.dueNow > 0 ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">· {p.dueNow} due</span>
            ) : null}
          </p>
          {p.total > 0 ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm">
              {tested ? (
                <>
                  <span className={cn("font-semibold tabular-nums", VERDICT_TONE[readiness!.verdict])}>
                    {readiness!.score}% ready
                  </span>
                  <span aria-hidden className="text-subtle">·</span>
                  <span className="text-muted">{VERDICT_COPY[readiness!.verdict].label}</span>
                </>
              ) : (
                <>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                  <span className="text-muted">Not tested yet — run a review to see your readiness</span>
                </>
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none flex-col items-stretch gap-2 sm:items-end">
          {primary}
          {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

// Nearest-exam pill: red inside a week, amber within two, calm beyond.
function ExamCountdownChip({ days }: { days: number }) {
  const tone =
    days <= 3
      ? "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/20"
      : days <= 14
        ? "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25"
        : "bg-surface-2 text-muted ring-line";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", tone)}>
      <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      Exam {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}
    </span>
  );
}

// --- At-a-glance overview: readiness + weakest topics --------------------------------------

function OverviewCards({ cards, readiness }: { cards: Card[]; readiness: Readiness }) {
  const p = computeProgress(cards);
  const tested = readiness.verdict !== "untested";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Exam readiness */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink">Exam readiness</h2>
          <span className={cn("text-sm font-semibold tabular-nums", VERDICT_TONE[readiness.verdict])}>
            {tested ? `${readiness.score}%` : "—"}
          </span>
        </div>
        {tested ? (
          <>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
              <div className={cn("h-full rounded-full", VERDICT_FILL[readiness.verdict])} style={{ width: `${readiness.score}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-2">{VERDICT_COPY[readiness.verdict].hint}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Not tested yet. Readiness comes from a Review — the recall ratings plus the questions after — never from
            cramming.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
          <SplitStat value={p.mastered} label="Mastered" tone="green" />
          <SplitStat value={p.learning} label="Learning" tone="amber" />
          <SplitStat value={p.shaky} label="Shaky" tone="red" />
        </dl>
      </div>

      {/* Weakest topics */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink">Topics</h2>
          <span className="text-xs text-muted">Weakest first</span>
        </div>
        {readiness.weakTopics.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {readiness.weakTopics.map((t) => (
              <TopicRow key={t.topic} topic={t} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {tested ? "No weak topics — every tested topic is holding up." : "Run a review to see which topics need work."}
          </p>
        )}
      </div>
    </div>
  );
}

function SplitStat({ value, label, tone }: { value: number; label: string; tone: "green" | "amber" | "red" }) {
  const color =
    tone === "green"
      ? "text-green-600 dark:text-green-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  return (
    <div>
      <dd className={cn("text-lg font-bold tabular-nums", color)}>{value}</dd>
      <dt className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
    </div>
  );
}

function TopicRow({ topic }: { topic: TopicStat }) {
  // A topic's display strength is the weaker of its card mastery and quiz accuracy (both 0..1);
  // an untested topic has no number, only a prompt to review it.
  const pct = topic.tested ? Math.round(Math.min(topic.cardMastery ?? 1, topic.accuracy ?? 1) * 100) : null;
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium text-ink-2" title={topic.topic}>
          {topic.topic}
        </span>
        <span className={cn("flex-none text-xs font-semibold tabular-nums", pct == null ? "text-subtle" : "text-ink")}>
          {pct == null ? "Untested" : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className={cn("h-full rounded-full", pct == null ? "bg-line-strong" : scoreFill(pct))} style={{ width: `${pct ?? 100}%` }} />
      </div>
    </li>
  );
}

// --- Exam group -------------------------------------------------------------------------

// One collapsible exam (or the "General" bucket when `exam` is null): a header with its date,
// card count, mastery and a Study link, expanding to its cards + quiz and per-exam actions.
export function ExamSection({
  exam,
  cards,
  quizzes,
  questions,
  href,
  onAddMaterial,
  onEdit,
  earned,
  defaultOpen = false,
}: {
  exam: Exam | null;
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  href: string; // into the Flashcards hub, scoped to this exam
  onAddMaterial: () => void;
  onEdit?: () => void;
  // Set for a graded ("past") exam: the recorded mark, shown as a badge in the header.
  earned?: { subject: Subject; entry: GradeEntry };
  defaultOpen?: boolean; // preview harness opens one to show the expanded state
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const panelId = useId();
  const p = computeProgress(cards);
  const days = exam?.exam_date ? daysUntil(exam.exam_date) : null;
  const title = exam ? exam.title : "General";
  const passed = earned ? isPassing(earned.subject.grading_scale, earned.entry.score) : false;

  return (
    <section className="border-t border-line">
      <div className="flex items-center justify-between gap-3 py-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded"
        >
          <ChevronDown
            className={cn("h-5 w-5 flex-none text-muted transition-transform duration-300", open && "rotate-180")}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-ink transition-colors group-hover:text-[color:var(--sc-ink)] dark:group-hover:text-[color:var(--sc-ink-dark)]">
                {title}
              </span>
              <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                {cards.length}
              </span>
              {earned ? (
                <Badge tone={passed ? "green" : "red"}>
                  {formatGrade(earned.subject.grading_scale, earned.entry.score)}
                </Badge>
              ) : null}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              {earned ? (
                <span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  Graded {formatDate(earned.entry.date)}
                </span>
              ) : exam?.exam_date ? (
                <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", countdownClass(days))}>
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  {formatCountdown(days)}
                </span>
              ) : exam ? (
                <span>No date</span>
              ) : (
                <span>Cards not tied to an exam</span>
              )}
              {p.total > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{p.masteredPct}% mastered</span>
                  {p.dueNow > 0 ? (
                    <span className="font-medium text-amber-700 dark:text-amber-400">· {p.dueNow} due</span>
                  ) : null}
                </>
              ) : null}
            </span>
          </span>
        </button>
        {cards.length > 0 ? (
          <Link href={href} className={buttonClass("primary", "sm", "flex-none")}>
            <Play className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Study
          </Link>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            id={panelId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pb-6">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={onAddMaterial}>
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Add material
                </Button>
                {onEdit ? (
                  <Button variant="secondary" size="sm" onClick={onEdit}>
                    <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Edit exam
                  </Button>
                ) : null}
              </div>
              {cards.length > 0 ? (
                <CardsTab cards={cards} />
              ) : (
                <EmptyState title="No cards yet" hint="Add material to build this exam's deck." />
              )}
              {quizzes.length > 0 ? <QuizzesTab quizzes={quizzes} questions={questions} /> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// --- Collapsible subject-level section --------------------------------------------------

function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const panelId = useId();

  return (
    <section className="border-t border-line">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full items-center justify-between gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <span className="flex items-baseline gap-2.5">
            <span className="text-base font-semibold text-ink transition-colors group-hover:text-[color:var(--sc-ink)] dark:group-hover:text-[color:var(--sc-ink-dark)]">
              {title}
            </span>
            <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
              {count}
            </span>
          </span>
          <ChevronDown
            className={cn("h-5 w-5 flex-none text-muted transition-transform duration-300 group-hover:text-ink-2", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            id={panelId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-6">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/subjects"
      className="inline-flex items-center gap-1 rounded text-sm font-medium text-muted transition hover:text-[color:var(--sc-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:hover:text-[color:var(--sc-ink-dark)]"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      All subjects
    </Link>
  );
}

function CardsTab({ cards }: { cards: Card[] }) {
  if (cards.length === 0) {
    return <EmptyState title="No cards yet" hint="Use “Add material” to generate a deck." />;
  }
  return (
    <ul className="grid gap-3">
      {cards.map((c, i) => (
        <li key={c.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
          <Panel>
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-ink">{c.front}</span>
              <Badge tone={difficultyTone(c.difficulty)}>D{c.difficulty}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-2">{c.back}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center rounded-full bg-[var(--sc-soft)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--sc-ink)] ring-1 ring-inset ring-[var(--sc-line)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-ink-dark)]/20">
                {c.topic}
              </span>
              <span>reps {c.repetitions}</span>
              <span aria-hidden>·</span>
              <span>lapses {c.lapses}</span>
              <span aria-hidden>·</span>
              <span>due {formatDate(c.due_date)}</span>
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}

function QuizzesTab({ quizzes, questions }: { quizzes: Quiz[]; questions: Question[] }) {
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  if (quizzes.length === 0) {
    return <EmptyState title="No quizzes yet" hint="Generating material also creates a quiz." />;
  }

  const activeQuiz = quizzes.find((q) => q.id === activeQuizId);
  if (activeQuiz) {
    return (
      <QuizRunner
        title={activeQuiz.title}
        subjectId={activeQuiz.subject_id}
        questions={questions.filter((q) => q.quiz_id === activeQuiz.id)}
        mode="practice"
        onClose={() => setActiveQuizId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {quizzes.map((quiz, i) => {
        const qs = questions.filter((q) => q.quiz_id === quiz.id);
        return (
          <Panel key={quiz.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{quiz.title}</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {qs.length} {qs.length === 1 ? "question" : "questions"}
                </p>
              </div>
              <Button size="sm" onClick={() => setActiveQuizId(quiz.id)} disabled={qs.length === 0}>
                Take quiz
              </Button>
            </div>
            <ul className="mt-3 space-y-3">
              {qs.map((q) => (
                <li key={q.id} className="rounded-xl border border-line/80 bg-surface-2/40 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{q.prompt}</span>
                    <Badge tone="brand">
                      {q.kind === "multipleChoice" ? "Multiple choice" : "Short answer"}
                    </Badge>
                  </div>
                  {q.options.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-ink-2">
                      {q.options.map((opt, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-center gap-2",
                            opt === q.answer_key && "font-medium text-green-700 dark:text-green-400",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "h-1.5 w-1.5 flex-none rounded-full",
                              opt === q.answer_key ? "bg-green-500" : "bg-line-strong",
                            )}
                          />
                          {opt}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      Model answer: <span className="text-ink-2">{q.answer_key}</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">{q.topic}</p>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function SourcesTab({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return <EmptyState title="No sources yet" hint="Uploaded material appears here." />;
  }
  return (
    <ul className="grid gap-3">
      {sources.map((s, i) => (
        <li key={s.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-ink">{s.title}</span>
              <Badge tone="neutral">{s.kind}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              Added {formatDate(s.added_at)}
              {s.storage_paths.length > 0
                ? ` · ${s.storage_paths.length} ${s.storage_paths.length === 1 ? "file" : "files"}`
                : ""}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
