"use client";

// A Review — the only thing in Cram that measures what you know.
//
// Two phases in one run:
//   1. Recall — rate your due flashcards Again/Hard/Good/Easy. Writes SM-2 (ReviewSession.tsx).
//   2. Test   — answer quiz questions on the same scope. Writes attempts (QuizRunner, mode="test").
//
// Then a report: how the session went, which topics are still weak, and whether there's enough
// material left to test you properly. Practising on the Flashcards or Quizzes page records study
// time but writes neither signal, so it never inflates any of this. See lib/readiness.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Brain, Check, ListChecks, Sparkles, Target, TriangleAlert } from "lucide-react";

import { QuizRunner, type Graded } from "@/components/QuizRunner";
import { ReviewSession, type RecallStats, type ReviewCardContext } from "@/components/ReviewSession";
import { Button, buttonClass, cn } from "@/components/ui";
import { createStudySession } from "@/lib/api/client";
import type { Card, Question } from "@/lib/api/types";
import type { ReviewOrder } from "@/lib/reviewSettings";

type Phase = "recall" | "test" | "report";

// Which questions this run serves. Topics you just fumbled in the recall phase come first — the
// point of the test phase is to probe what recall suggested you don't know. Ties are broken by a
// shuffle, computed once when the phase starts (never during render).
function pickQuestions(questions: Question[], limit: number, recall: RecallStats | null): Question[] {
  if (limit <= 0 || questions.length === 0) return [];

  const weakness = new Map<string, number>();
  for (const r of recall?.ratings ?? []) {
    // rating 1 (again) is the strongest signal, 5 (easy) the weakest.
    const w = r.rating <= 1 ? 3 : r.rating <= 3 ? 2 : r.rating <= 4 ? 1 : 0;
    weakness.set(r.topic, Math.max(weakness.get(r.topic) ?? 0, w));
  }

  const scored = questions.map((q) => ({ q, w: weakness.get(q.topic) ?? 0, r: Math.random() }));
  scored.sort((a, b) => b.w - a.w || a.r - b.r);
  return scored.slice(0, limit).map((s) => s.q);
}

export function ReviewRun({
  title,
  subtitle,
  cards,
  questions,
  contextFor,
  subjectId = null,
  generateHref,
  streak,
  order = "due",
  limit = 0,
  questionLimit = 5,
  onExit,
  onReviewed,
}: {
  title: string;
  subtitle?: string;
  cards: Card[];
  questions: Question[];
  contextFor: (card: Card) => ReviewCardContext;
  subjectId?: string | null;
  generateHref: string; // AI Decks, scoped — for "there isn't enough material to test you"
  streak?: number;
  order?: ReviewOrder;
  limit?: number;
  questionLimit?: number;
  onExit: () => void;
  onReviewed: () => void;
}) {
  const [recall, setRecall] = useState<RecallStats | null>(null);
  const [quiz, setQuiz] = useState<Graded[] | null>(null);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);

  const hasCards = cards.length > 0;
  const [phase, setPhase] = useState<Phase>(() => {
    if (hasCards) return "recall";
    return questionLimit > 0 && questions.length > 0 ? "test" : "report";
  });

  // If the run opens straight into the test phase there was no recall to prioritise from.
  const [seeded, setSeeded] = useState(false);
  if (phase === "test" && !seeded) {
    setSeeded(true);
    setTestQuestions(pickQuestions(questions, questionLimit, recall));
  }

  // One study-session row for the whole run, recorded once — on the report, on exit, or on unmount
  // (navigating away mid-run still happened).
  const startedAtRef = useRef(Date.now());
  const answeredRef = useRef(0);
  const recordedRef = useRef(false);
  const endRun = useCallback(() => {
    if (recordedRef.current || answeredRef.current === 0) return;
    recordedRef.current = true;
    const duration = Math.min(86_400, Math.round((Date.now() - startedAtRef.current) / 1000));
    if (duration <= 0) return;
    createStudySession({
      subject_id: subjectId,
      duration_seconds: duration,
      kind: "review",
      started_at: new Date(startedAtRef.current).toISOString(),
    }).catch(() => {});
  }, [subjectId]);
  useEffect(() => () => endRun(), [endRun]);

  const finishRecall = useCallback(
    (stats: RecallStats) => {
      answeredRef.current += stats.reviewed;
      setRecall(stats);
      const picked = pickQuestions(questions, questionLimit, stats);
      setTestQuestions(picked);
      setSeeded(true);
      if (picked.length > 0) {
        setPhase("test");
      } else {
        endRun();
        setPhase("report");
      }
    },
    [questions, questionLimit, endRun],
  );

  const finishTest = useCallback(
    (results: Graded[]) => {
      answeredRef.current += results.length;
      setQuiz(results);
      endRun();
      setPhase("report");
    },
    [endRun],
  );

  const exit = useCallback(() => {
    endRun();
    onReviewed();
    onExit();
  }, [endRun, onReviewed, onExit]);

  if (phase === "recall") {
    return (
      <ReviewSession
        cards={cards}
        contextFor={contextFor}
        streak={streak}
        order={order}
        limit={limit}
        onExit={exit}
        onFinish={finishRecall}
      />
    );
  }

  if (phase === "test") {
    return (
      <QuizRunner
        title={title}
        subtitle={`Test · ${testQuestions.length} question${testQuestions.length === 1 ? "" : "s"}`}
        questions={testQuestions}
        subjectId={subjectId}
        mode="test"
        onClose={exit}
        onComplete={finishTest}
      />
    );
  }

  return (
    <ReviewReport
      title={title}
      subtitle={subtitle}
      recall={recall}
      quiz={quiz}
      hadQuestions={questions.length > 0}
      questionLimit={questionLimit}
      generateHref={generateHref}
      onDone={exit}
    />
  );
}

// --- Report -----------------------------------------------------------------------------------

// Topics worth another pass: anything you rated Hard-or-worse, or answered below half marks.
function weakTopics(recall: RecallStats | null, quiz: Graded[] | null): string[] {
  const weak = new Set<string>();
  for (const r of recall?.ratings ?? []) if (r.rating <= 3) weak.add(r.topic);
  for (const g of quiz ?? []) if (g.score < 0.5) weak.add(g.topic);
  return [...weak];
}

export function ReviewReport({
  title,
  subtitle,
  recall,
  quiz,
  hadQuestions,
  questionLimit,
  generateHref,
  onDone,
}: {
  title: string;
  subtitle?: string;
  recall: RecallStats | null;
  quiz: Graded[] | null;
  hadQuestions: boolean;
  questionLimit: number;
  generateHref: string;
  onDone: () => void;
}) {
  const recallPct = recall && recall.reviewed > 0 ? Math.round((recall.recalledWell / recall.reviewed) * 100) : null;
  const quizPct = quiz && quiz.length > 0 ? Math.round((quiz.reduce((s, g) => s + g.score, 0) / quiz.length) * 100) : null;

  const scores = [recallPct, quizPct].filter((n): n is number => n != null);
  const overall = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const weak = weakTopics(recall, quiz);

  // Why the test phase didn't run — the honest answer decides what we tell them to do next.
  const noMaterial = hadQuestions === false && questionLimit > 0;
  const testedNothing = recall == null && quiz == null;

  const tone =
    overall == null
      ? "text-muted"
      : overall >= 80
        ? "text-green-600 dark:text-green-400"
        : overall >= 50
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  if (testedNothing) {
    return (
      <section className="mx-auto max-w-md">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <p className="text-lg font-semibold text-ink">Nothing to review</p>
          <p className="mt-1.5 text-sm text-muted">
            No cards are due and there are no questions in this scope. Add material and Cram will build both.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={generateHref} className={buttonClass("primary", "md")}>
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
              Add material
            </Link>
            <Button variant="ghost" onClick={onDone}>
              Back
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400">
          <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </div>
        <p className="mt-4 text-sm font-medium text-muted">{title}</p>
        {subtitle ? <p className="text-xs text-subtle">{subtitle}</p> : null}
        {overall != null ? <p className={cn("mt-3 text-5xl font-bold tabular-nums", tone)}>{overall}%</p> : null}
        <p className="mt-2 text-sm text-muted">Review complete — your progress is updated.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <PhaseStat
            icon={Brain}
            label="Recall"
            value={recall ? `${recall.recalledWell}/${recall.reviewed}` : "—"}
            sub={recallPct == null ? "No cards were due" : `${recallPct}% recalled well`}
          />
          <PhaseStat
            icon={ListChecks}
            label="Test"
            value={quiz ? `${quiz.filter((g) => g.is_correct).length}/${quiz.length}` : "—"}
            sub={quizPct == null ? (noMaterial ? "No questions yet" : "Skipped") : `${quizPct}% correct`}
          />
        </div>
      </div>

      {weak.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-ink">Still shaky</h2>
          </div>
          {/* Only a card you RATED gets rescheduled. A topic can land here purely from a wrong quiz
              answer, so don't promise a schedule change we didn't make. */}
          <p className="mt-1.5 text-sm text-ink-2">
            {weak.length === 1 ? "This topic" : `These ${weak.length} topics`} came back weak. Any card you rated
            Hard or worse is already scheduled to return sooner.
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {weak.map((t) => (
              <li
                key={t}
                className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-inset ring-amber-200 dark:ring-amber-500/30"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {noMaterial ? (
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-ink">Cram couldn&rsquo;t test you</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            This scope has no quiz questions, so only your recall was measured. Add material to generate some — a
            readiness score is far more trustworthy when it&rsquo;s backed by real questions.
          </p>
          <Link href={generateHref} className={cn(buttonClass("secondary", "sm"), "mt-4")}>
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            Generate questions
          </Link>
        </div>
      ) : null}

      <div className="flex justify-center gap-2">
        {weak.length > 0 && !noMaterial ? (
          <Link href={generateHref} className={buttonClass("secondary", "md")}>
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            More on weak topics
          </Link>
        ) : null}
        <Button onClick={onDone}>Done</Button>
      </div>
    </section>
  );
}

function PhaseStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Brain;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-4 text-left">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {label}
      </span>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
