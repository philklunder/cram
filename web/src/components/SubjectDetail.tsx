"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { GenerateMaterialForm } from "@/components/GenerateMaterialForm";
import { GradesPanel } from "@/components/GradesPanel";
import { ProgressPanel } from "@/components/ProgressPanel";
import { QuizRunner } from "@/components/QuizRunner";
import { ReviewSession } from "@/components/ReviewSession";
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
import type { Card, Question, Quiz, Source, Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown, formatDate, subjectInitials } from "@/lib/format";
import { subjectVars } from "@/lib/subjectColor";
import { subjectStrength as computeSubjectStrength } from "@/lib/srs/grade-strength";
import { useAsync } from "@/lib/useAsync";

type Tab = "progress" | "review" | "cards" | "quizzes" | "grades" | "sources" | "add";

// A card is due when its effective due date has passed.
function dueCount(cards: Card[]): number {
  const now = Date.now();
  return cards.filter((c) => new Date(c.due_date).getTime() <= now).length;
}

export function SubjectDetail({ id }: { id: string }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("progress");
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

  const { subject, sources, cards, quizzes, questions, gradeEntries } = data;

  // Subject grade strength feeds SM-2 exam compression — derived exactly as iOS does.
  const strength = computeSubjectStrength(subject.grading_scale, subject.current_grade, gradeEntries);
  const due = dueCount(cards);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "progress", label: "Progress" },
    { id: "review", label: "Review", count: due },
    { id: "cards", label: "Cards", count: cards.length },
    { id: "quizzes", label: "Quizzes", count: quizzes.length },
    { id: "grades", label: "Grades", count: gradeEntries.length },
    { id: "sources", label: "Sources", count: sources.length },
    { id: "add", label: "Add material" },
  ];

  return (
    <section style={subjectVars(subject.id)} className="space-y-6">
      <BackLink />
      <Hero subject={subject} cards={cards} quizzes={quizzes} sources={sources} due={due} />

      {/* Tab bar — horizontally scrollable on narrow screens; the active underline slides between
          tabs via a shared layoutId. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label="Subject sections" className="flex min-w-max gap-1 border-b border-line">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                  active
                    ? "text-[color:var(--sc-ink)] dark:text-[color:var(--sc-ink-dark)]"
                    : "text-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.count != null ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums transition-colors duration-200",
                      active
                        ? "bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]"
                        : "bg-line text-muted",
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
                {active ? (
                  <motion.span
                    layoutId="subject-tab-underline"
                    className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[var(--sc-solid)]"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panels crossfade on switch; content is always rendered (never gated on a reveal class). */}
      <AnimatePresence mode="wait">
        <motion.div
          role="tabpanel"
          key={tab}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {tab === "progress" ? <ProgressPanel subject={subject} cards={cards} /> : null}
          {tab === "review" ? (
            <ReviewTab subject={subject} cards={cards} subjectStrength={strength} onReviewed={reload} />
          ) : null}
          {tab === "cards" ? <CardsTab cards={cards} /> : null}
          {tab === "quizzes" ? <QuizzesTab quizzes={quizzes} questions={questions} /> : null}
          {tab === "grades" ? (
            <GradesPanel subject={subject} entries={gradeEntries} onChanged={reload} />
          ) : null}
          {tab === "sources" ? <SourcesTab sources={sources} /> : null}
          {tab === "add" ? (
            <Panel>
              <GenerateMaterialForm subjectName={subject.name} onGenerated={reload} />
            </Panel>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

// --- Hero -------------------------------------------------------------------------------

// Exam-countdown color, mirroring the subjects grid: urgent red, soon amber, else neutral. Kept
// local and small; the subject's own hue lives in the tile, so the meta line stays calm.
function heroCountdownClass(days: number | null): string {
  if (days === null) return "text-muted";
  if (days < 0) return "text-subtle";
  if (days <= 3) return "text-red-600 dark:text-red-400";
  if (days <= 10) return "text-amber-600 dark:text-amber-400";
  return "text-ink-2";
}

export function Hero({
  subject,
  cards,
  quizzes,
  sources,
  due,
}: {
  subject: Subject;
  cards: Card[];
  quizzes: Quiz[];
  sources: Source[];
  due: number;
}) {
  const days = daysUntil(subject.exam_date);

  return (
    // Neutral surface, consistent with the subject cards. The subject color is concentrated in the
    // one gradient tile — a controlled identity moment, not a full color band. CSS entrance, so the
    // resting state is visible without JS.
    <div className="animate-fade-up rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl text-xl font-bold text-white shadow-sm [background-image:linear-gradient(140deg,var(--sc-from),var(--sc-to))]">
          {subjectInitials(subject.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{subject.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span className="capitalize">{subject.grading_scale} scale</span>
            <span aria-hidden className="text-subtle">·</span>
            <span className={cn("font-medium tabular-nums", heroCountdownClass(days))}>
              {formatCountdown(days)}
            </span>
          </p>
        </div>
      </div>

      {/* Quick stats as quiet pills — earned familiarity, not a hero-metric template. */}
      <div className="mt-5 flex flex-wrap gap-2">
        <HeroStat value={cards.length} label={cards.length === 1 ? "card" : "cards"} />
        <HeroStat value={quizzes.length} label={quizzes.length === 1 ? "quiz" : "quizzes"} />
        <HeroStat value={sources.length} label={sources.length === 1 ? "source" : "sources"} />
        {due > 0 ? <HeroStat value={due} label="due now" emphatic /> : null}
      </div>
    </div>
  );
}

function HeroStat({ value, label, emphatic = false }: { value: number; label: string; emphatic?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
        emphatic
          ? "border-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:border-[color:var(--sc-solid)]/30 dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]"
          : "border-line bg-surface-2 text-muted",
      )}
    >
      <span className={cn("font-semibold tabular-nums", emphatic ? "" : "text-ink")}>{value}</span>
      <span>{label}</span>
    </span>
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

function ReviewTab({
  subject,
  cards,
  subjectStrength,
  onReviewed,
}: {
  subject: Subject;
  cards: Card[];
  subjectStrength: number | null;
  onReviewed: () => void;
}) {
  const [started, setStarted] = useState(false);
  const due = dueCount(cards);

  if (cards.length === 0) {
    return <EmptyState title="No cards to review" hint="Use “Add material” to generate a deck." />;
  }

  if (started) {
    return (
      <ReviewSession
        cards={cards}
        examDate={subject.exam_date}
        subjectStrength={subjectStrength}
        onClose={() => setStarted(false)}
        onReviewed={onReviewed}
      />
    );
  }

  return (
    <Panel className="space-y-4 text-center">
      <div>
        <p className="text-4xl font-semibold tracking-tight text-[color:var(--sc-ink)] tabular-nums dark:text-[color:var(--sc-ink-dark)]">{due}</p>
        <p className="mt-1 text-sm text-muted">{due === 1 ? "card due" : "cards due"} for review</p>
      </div>
      <div className="flex justify-center">
        <Button onClick={() => setStarted(true)}>{due > 0 ? "Start review" : "Review all cards"}</Button>
      </div>
      {due === 0 ? (
        <p className="text-xs text-subtle">Nothing’s due — you can still review the whole deck.</p>
      ) : null}
    </Panel>
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
              {/* Topic wears the subject accent — the one place per card the identity shows through. */}
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
