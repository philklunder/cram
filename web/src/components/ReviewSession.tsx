"use client";

// The recall phase of a Review — the ONLY thing in the app that advances a card's SM-2 schedule.
//
// Walks the due cards one at a time: show the question, flip to reveal the answer, rate recall
// (Again/Hard/Good/Easy). Each rating runs the local SM-2 scheduler (a faithful port of the iOS
// one) and writes the new card state back (PATCH /v1/cards) plus an append-only review-log
// (POST /v1/review-logs) — so reviewing on web advances the same schedule as iOS. Rating honestly
// here is what teaches Cram how well you actually know the material (see lib/readiness.ts).
//
// Study time and the end-of-run report belong to the whole Review (see ReviewRun.tsx), so this
// phase hands its tally back through `onFinish` rather than ending the session itself. Practising
// on the Flashcards page is a different component and writes none of this.

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronsRight,
  Clock,
  Flame,
  Layers,
  Minus,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";

import { Button, ErrorBox, cn } from "@/components/ui";
import { createReviewLog, updateCard } from "@/lib/api/client";
import type { Card, Subject } from "@/lib/api/types";
import { subjectInitials } from "@/lib/format";
import { buildSessionQueue } from "@/lib/srs/queue";
import { applyReview, REVIEW_RATINGS, type ReviewRating } from "@/lib/srs/scheduler";
import type { ReviewOrder } from "@/lib/reviewSettings";
import { subjectVars } from "@/lib/subjectColor";

export interface ReviewCardContext {
  subject: Subject;
  examDate: string | null;
  strength: number | null;
}

// What the recall phase reports back to the run.
export interface RecallStats {
  reviewed: number;
  recalledWell: number; // rated Good/Easy
  ratings: { cardId: string; topic: string; rating: ReviewRating }[];
}

// Due cards first (due_date <= now); if none are due, fall back to the whole deck so review is
// always possible. Ordering + the session cap come from the user's Review settings.
function buildQueue(cards: Card[], order: ReviewOrder = "due", limit = 0): Card[] {
  const now = Date.now();
  const due = cards.filter((c) => new Date(c.due_date).getTime() <= now);
  const pool = due.length > 0 ? due : cards;
  return buildSessionQueue(pool, order, limit);
}

// Compact interval label from whole days (our scheduler works in days).
function formatInterval(days: number): string {
  if (days <= 0) return "<1 day";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30);
  return `${months} mo`;
}

const RATING_META: Record<ReviewRating, { icon: typeof Check; ring: string; text: string; bg: string }> = {
  1: { icon: RotateCcw, ring: "border-red-200 hover:border-red-400 dark:border-red-500/30 dark:hover:border-red-500/60", text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10" },
  3: { icon: Minus, ring: "border-amber-200 hover:border-amber-400 dark:border-amber-500/30 dark:hover:border-amber-500/60", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" },
  4: { icon: Check, ring: "border-green-200 hover:border-green-400 dark:border-green-500/30 dark:hover:border-green-500/60", text: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/10" },
  5: { icon: Sparkles, ring: "border-brand-200 hover:border-brand-400 dark:border-brand-500/30 dark:hover:border-brand-500/60", text: "text-brand-600 dark:text-brand-300", bg: "bg-brand-50 dark:bg-brand-500/10" },
};

const DIFFICULTY_LABEL = ["", "Very easy", "Easy", "Medium", "Hard", "Very hard"];

export function ReviewSession({
  cards,
  contextFor,
  streak,
  order = "due",
  limit = 0,
  initialFlipped = false,
  onExit,
  onFinish,
}: {
  cards: Card[];
  contextFor: (card: Card) => ReviewCardContext;
  streak?: number;
  order?: ReviewOrder; // from the user's Review settings
  limit?: number; // max cards this session serves (0 = all); from Review settings
  initialFlipped?: boolean; // dev/preview only — start with the answer + ratings shown
  onExit: () => void; // abandon the run
  onFinish: (stats: RecallStats) => void; // hand off to the run's next phase
}) {
  const [queue] = useState(() => buildQueue(cards, order, limit));
  const [idx, setIdx] = useState(0);
  const [showBack, setShowBack] = useState(initialFlipped);
  const [pendingRating, setPendingRating] = useState<ReviewRating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0); // rated Good/Easy — feeds the accuracy readout
  const saving = pendingRating != null;

  const ratingsLog = useRef<RecallStats["ratings"]>([]);

  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [idx]);
  const ratingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showBack) ratingsRef.current?.querySelector("button")?.focus();
  }, [showBack]);

  const card = queue[idx];

  if (queue.length === 0 || !card) return null; // the run skips an empty recall phase

  const ctx = contextFor(card);
  const examDate = ctx.examDate ? new Date(ctx.examDate) : null;
  const previews = REVIEW_RATINGS.map((r) => ({
    ...r,
    interval: applyReview(card, r.rating, examDate, ctx.strength, new Date()).interval_days,
  }));

  async function rate(rating: ReviewRating) {
    if (saving || !card) return;
    setPendingRating(rating);
    setError(null);
    try {
      const now = new Date();
      const outcome = applyReview(card, rating, examDate, ctx.strength, now);
      await updateCard(card.id, {
        ease_factor: outcome.ease_factor,
        interval_days: outcome.interval_days,
        repetitions: outcome.repetitions,
        lapses: outcome.lapses,
        due_date: outcome.due_date,
      });
      await createReviewLog({ card_id: card.id, rating, reviewed_at: now.toISOString() });
      ratingsLog.current.push({ cardId: card.id, topic: card.topic, rating });
      const reviewedNow = reviewed + 1;
      const correctNow = correct + (rating >= 4 ? 1 : 0);
      setReviewed(reviewedNow);
      setCorrect(correctNow);
      if (idx >= queue.length - 1) {
        onFinish({ reviewed: reviewedNow, recalledWell: correctNow, ratings: ratingsLog.current });
      } else {
        setIdx((i) => i + 1);
        setShowBack(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that review.");
    } finally {
      setPendingRating(null);
    }
  }

  const remaining = queue.length - reviewed;
  const accuracy = reviewed === 0 ? null : Math.round((correct / reviewed) * 100);
  const estMinutes = Math.max(1, Math.round((remaining * 25) / 60));

  return (
    <section>
      {/* Session header bar */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <Layers className="h-4 w-4 text-brand-500" strokeWidth={2} aria-hidden />
            Recall <span className="tabular-nums">{idx + 1}</span> of {queue.length}
          </span>
          {streak != null && streak > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Flame className="h-4 w-4 text-amber-500" strokeWidth={2} aria-hidden />
              <span className="tabular-nums">{streak}</span> day streak
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Clock className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />~{estMinutes} min left
          </span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={onExit}>
            End session
          </Button>
        </div>
        <div className="h-1 w-full bg-line" aria-hidden>
          <div className="h-full bg-brand-500 transition-all duration-500 ease-out" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card + ratings */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <div key={idx} className="animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {/* Card header */}
            <div style={subjectVars(ctx.subject.id)} className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25">
                {subjectInitials(ctx.subject.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{ctx.subject.name}</p>
                <p className="truncate text-xs capitalize text-muted">{ctx.subject.grading_scale} scale</p>
              </div>
              <span className="hidden flex-none rounded-full bg-[var(--sc-soft)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--sc-ink)] sm:inline dark:bg-[var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)]">
                {card.topic}
              </span>
              <span className="flex-none rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
                {DIFFICULTY_LABEL[card.difficulty] ?? "Medium"}
              </span>
            </div>

            {/* Card body */}
            <div className="px-6 py-10 text-center sm:px-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500/90 dark:text-brand-300">Question</p>
              <p ref={headingRef} tabIndex={-1} className="mx-auto mt-4 max-w-xl text-xl font-semibold leading-snug text-ink focus:outline-none sm:text-2xl">
                {card.front}
              </p>

              {showBack ? (
                <div className="animate-rise mt-8 border-t border-dashed border-line pt-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Answer</p>
                  <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-ink-2">{card.back}</p>
                </div>
              ) : (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowBack(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-brand-700 shadow-sm transition duration-200 hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] dark:text-brand-200 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
                  >
                    <ChevronsRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Flip card
                  </button>
                </div>
              )}
            </div>
          </div>

          {error ? <ErrorBox message={error} /> : null}

          {showBack ? (
            <div>
              <p className="mb-2 text-center text-xs text-subtle" id="rate-label">How well did you recall it?</p>
              <div ref={ratingsRef} role="group" aria-labelledby="rate-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {previews.map(({ rating, label, interval }) => {
                  const m = RATING_META[rating];
                  const Icon = m.icon;
                  return (
                    <button
                      key={rating}
                      onClick={() => rate(rating)}
                      disabled={saving}
                      aria-busy={pendingRating === rating || undefined}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border bg-surface px-3 py-3.5 text-center shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
                        m.ring,
                      )}
                    >
                      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", m.bg, m.text)}>
                        {pendingRating === rating ? (
                          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current" />
                        ) : (
                          <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                        )}
                      </span>
                      <span className={cn("text-sm font-semibold", m.text)}>{label}</span>
                      <span className="text-[11px] tabular-nums text-muted">{formatInterval(interval)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Session overview rail */}
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold tracking-tight text-ink">Session overview</h2>
            <div className="space-y-3">
              <OverviewRow icon={Layers} tone="brand" label="Cards in session" value={String(queue.length)} />
              <OverviewRow icon={RotateCcw} tone="brand" label="Remaining" value={String(remaining)} />
              <OverviewRow icon={Target} tone="green" label="Accuracy" value={accuracy == null ? "—" : `${accuracy}%`} />
              <OverviewRow icon={Clock} tone="amber" label="Est. finish" value={`~${estMinutes} min`} />
            </div>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-5 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
              <p className="text-sm font-semibold text-ink">Spaced repetition</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              You&rsquo;ll see cards just before you&rsquo;re likely to forget them. Rate honestly so Cram can schedule
              the perfect review for long-term retention.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function OverviewRow({ icon: Icon, tone, label, value }: { icon: typeof Layers; tone: "brand" | "green" | "amber"; label: string; value: string }) {
  const chip = tone === "green" ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400" : tone === "amber" ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
      <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", chip)}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="flex-1 text-sm text-ink-2">{label}</span>
      <span className="text-lg font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}
