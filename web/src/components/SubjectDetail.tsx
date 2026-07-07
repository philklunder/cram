"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarClock, ChevronDown, Pencil, Play, Plus } from "lucide-react";

import { ExamFormModal } from "@/components/ExamFormModal";
import { SubjectGradesSummary } from "@/components/GradesPanel";
import { ProgressPanel } from "@/components/ProgressPanel";
import { QuizRunner } from "@/components/QuizRunner";
import { ReviewSession } from "@/components/ReviewSession";
import { SubjectFormModal } from "@/components/SubjectFormModal";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  PageLoader,
  Panel,
  cn,
  difficultyTone,
} from "@/components/ui";
import { loadSubjectBundle, type SubjectBundle } from "@/lib/api/client";
import type { Card, Exam, Question, Quiz, Source, Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown, formatDate, subjectInitials } from "@/lib/format";
import { computeProgress } from "@/lib/progress";
import { subjectVars } from "@/lib/subjectColor";
import { subjectStrength as computeSubjectStrength } from "@/lib/srs/grade-strength";
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

export function SubjectDetail({ id }: { id: string }) {
  const router = useRouter();
  const { loading, error, data, reload } = useAsync<SubjectBundle>(() => loadSubjectBundle(id), [id]);

  // What we're studying right now (a bucket of cards), or null when browsing.
  const [studyCards, setStudyCards] = useState<Card[] | null>(null);
  const [editSubjectOpen, setEditSubjectOpen] = useState(false);
  const [examModal, setExamModal] = useState<{ open: boolean; exam: Exam | null }>({ open: false, exam: null });

  const examById = useMemo(() => new Map((data?.exams ?? []).map((e) => [e.id, e])), [data?.exams]);

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

  const { subject, exams, sources, cards, quizzes, questions, gradeEntries } = data;

  // Subject grade strength feeds SM-2 exam compression — derived exactly as iOS does.
  const strength = computeSubjectStrength(subject.grading_scale, subject.current_grade, gradeEntries);

  // Each card is scheduled against ITS exam's date (or none) — so whole-subject and per-exam
  // study both compress correctly, per card.
  const contextFor = (card: Card) => ({
    subject,
    examDate: (card.exam_id ? examById.get(card.exam_id)?.exam_date : null) ?? null,
    strength,
  });

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
  const totalDue = dueCount(cards);

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

      {studyCards ? (
        <ReviewSession
          cards={studyCards}
          contextFor={contextFor}
          onClose={() => setStudyCards(null)}
          onReviewed={reload}
        />
      ) : (
        <>
          {/* Study the whole subject — pulls every card across all exams. */}
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
            <div className="flex flex-col gap-4 rounded-xl border border-[var(--sc-line)] bg-[var(--sc-soft)] p-5 sm:flex-row sm:items-center sm:justify-between dark:border-[color:var(--sc-solid)]/25 dark:bg-[color:var(--sc-soft-dark)]">
              <div>
                <p className="text-base font-semibold text-[color:var(--sc-ink)] dark:text-[color:var(--sc-ink-dark)]">
                  {totalDue > 0
                    ? `${totalDue} ${totalDue === 1 ? "card" : "cards"} due across all exams`
                    : "You're all caught up"}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {totalDue > 0
                    ? "Study the whole subject, or pick a single exam below."
                    : "Nothing's due — you can still review any exam below."}
                </p>
              </div>
              <Button onClick={() => setStudyCards(cards)} className="flex-none">
                <Play className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                {totalDue > 0 ? "Study whole subject" : "Review everything"}
              </Button>
            </div>
          )}

          {/* Overall progress breakdown (status row hidden — the band above states what's due). */}
          {cards.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-ink">Progress</h2>
              <ProgressPanel cards={cards} hideStatus />
            </div>
          ) : null}

          {/* Exams — the primary content. Each is a collapsible group of its own cards + quiz. */}
          {exams.length > 0 || generalCards.length > 0 || generalQuizzes.length > 0 ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">Exams</h2>
                <Button variant="ghost" size="sm" onClick={() => openExamModal(null)}>
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  New exam
                </Button>
              </div>
              <div className="border-b border-line">
                {sortedExams.map((exam) => (
                  <ExamSection
                    key={exam.id}
                    exam={exam}
                    cards={cardsByBucket.get(exam.id) ?? []}
                    quizzes={quizzesByBucket.get(exam.id) ?? []}
                    questions={questions}
                    onStudy={(c) => setStudyCards(c)}
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
                    onStudy={(c) => setStudyCards(c)}
                    onAddMaterial={() => goAddMaterial(null)}
                  />
                ) : null}
              </div>
            </div>
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
        </>
      )}

      {/* Edit / delete this subject. */}
      <SubjectFormModal
        open={editSubjectOpen}
        onClose={() => setEditSubjectOpen(false)}
        subject={subject}
        onSaved={() => reload()}
        onDeleted={() => router.push("/subjects")}
      />

      {/* Create / edit an exam. */}
      <ExamFormModal
        open={examModal.open}
        onClose={() => setExamModal((m) => ({ ...m, open: false }))}
        subjectId={subject.id}
        exam={examModal.exam}
        onSaved={() => reload()}
        onDeleted={() => reload()}
      />
    </section>
  );
}

// --- Hero -------------------------------------------------------------------------------

// The subject header: identity tile, name, scale/target meta, and a one-line mastery read.
// Actions (New exam / Add material / Edit) are passed in. Exported for the /preview harness.
export function SubjectHero({
  subject,
  cards,
  actions,
}: {
  subject: Subject;
  cards: Card[];
  actions?: React.ReactNode;
}) {
  const p = computeProgress(cards);

  return (
    <div className="animate-fade-up rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl text-xl font-bold text-white shadow-sm [background-image:linear-gradient(140deg,var(--sc-from),var(--sc-to))]">
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{subject.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span className="capitalize">{subject.grading_scale} scale</span>
            {subject.target_grade != null ? (
              <>
                <span aria-hidden className="text-subtle">·</span>
                <span>target {subject.target_grade}</span>
              </>
            ) : null}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-sm">
            {p.total === 0 ? (
              <span className="text-muted">No cards yet</span>
            ) : (
              <>
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", p.dueNow > 0 ? "bg-amber-500" : "bg-green-500")} />
                <span className="font-medium tabular-nums text-ink-2">{p.masteredPct}% mastered</span>
                <span aria-hidden className="text-subtle">·</span>
                <span className="tabular-nums text-muted">
                  {p.total} {p.total === 1 ? "card" : "cards"}
                </span>
              </>
            )}
          </p>
        </div>
        {actions ? <div className="flex flex-none flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

// --- Exam group -------------------------------------------------------------------------

// One collapsible exam (or the "General" bucket when `exam` is null): a header with its date,
// card count, mastery and a Study action, expanding to its cards + quiz and per-exam actions.
export function ExamSection({
  exam,
  cards,
  quizzes,
  questions,
  onStudy,
  onAddMaterial,
  onEdit,
  defaultOpen = false,
}: {
  exam: Exam | null;
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  onStudy: (cards: Card[]) => void;
  onAddMaterial: () => void;
  onEdit?: () => void;
  defaultOpen?: boolean; // preview harness opens one to show the expanded state
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const panelId = useId();
  const p = computeProgress(cards);
  const days = exam?.exam_date ? daysUntil(exam.exam_date) : null;
  const title = exam ? exam.title : "General";

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
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              {exam?.exam_date ? (
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
          <Button size="sm" onClick={() => onStudy(cards)} className="flex-none">
            <Play className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Study
          </Button>
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

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
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
