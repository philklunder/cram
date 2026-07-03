"use client";

// Spaced-repetition review. Walks the due cards one at a time: show the front, reveal the back,
// rate recall (Again/Hard/Good/Easy). Each rating runs the local SM-2 scheduler (a faithful port
// of the iOS one) and writes the new card state back (PATCH /v1/cards) plus an append-only
// review-log (POST /v1/review-logs) — so reviewing on web advances the same schedule as iOS.

import { useEffect, useRef, useState } from "react";

import { Button, ErrorBox, Panel, cn } from "@/components/ui";
import { createReviewLog, updateCard } from "@/lib/api/client";
import type { Card } from "@/lib/api/types";
import { applyReview, REVIEW_RATINGS, type ReviewRating } from "@/lib/srs/scheduler";

// Due cards first (due_date <= now), sorted by due_date; if none are due, fall back to the whole
// deck so review is always possible. Mirrors StudySessionView.buildQueue.
function buildQueue(cards: Card[]): Card[] {
  const now = Date.now();
  const due = cards.filter((c) => new Date(c.due_date).getTime() <= now);
  const pool = due.length > 0 ? due : cards;
  return [...pool].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
}

// Per-rating accent, matching the iOS colour cues (again red / hard amber / good green / easy brand).
const RATING_CLASS: Record<ReviewRating, string> = {
  1: "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/15",
  3: "border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/15",
  4: "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-500/40 dark:text-green-300 dark:hover:bg-green-500/15",
  5: "border-brand-300 text-brand-700 hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-200 dark:hover:bg-brand-500/15",
};

export function ReviewSession({
  cards,
  examDate,
  subjectStrength,
  onClose,
  onReviewed,
}: {
  cards: Card[];
  examDate: string | null;
  subjectStrength: number | null;
  onClose: () => void;
  onReviewed: () => void; // reload the parent's data once the session ends (state has changed)
}) {
  const [queue] = useState(() => buildQueue(cards));
  const [idx, setIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [pendingRating, setPendingRating] = useState<ReviewRating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [finished, setFinished] = useState(false);
  const saving = pendingRating != null;

  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [idx]);

  // When the answer is revealed, move focus to the first rating button — otherwise the just-
  // clicked "Show answer" button unmounts and keyboard focus falls back to <body>.
  const ratingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showBack) ratingsRef.current?.querySelector("button")?.focus();
  }, [showBack]);

  const card = queue[idx];

  if (queue.length === 0) {
    return (
      <Panel className="animate-rise space-y-4 text-center">
        <p className="text-sm font-semibold text-ink">Nothing to review</p>
        <p className="text-sm text-muted">Add material to this subject to generate cards.</p>
        <div className="flex justify-center">
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
        </div>
      </Panel>
    );
  }

  if (finished || !card) {
    return (
      <Panel className="animate-rise space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400">
          <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-ink">Session complete</p>
          <p className="mt-0.5 text-sm text-muted">
            You reviewed {reviewed} {reviewed === 1 ? "card" : "cards"}.
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => {
              onReviewed();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </Panel>
    );
  }

  async function rate(rating: ReviewRating) {
    if (saving) return;
    setPendingRating(rating);
    setError(null);
    try {
      const now = new Date();
      const outcome = applyReview(card, rating, examDate ? new Date(examDate) : null, subjectStrength, now);
      // Write the SM-2 state, then log the review. If the log fails the card is still updated;
      // a review-log is analytics-only, so we don't roll back the (more important) card state.
      await updateCard(card.id, {
        ease_factor: outcome.ease_factor,
        interval_days: outcome.interval_days,
        repetitions: outcome.repetitions,
        lapses: outcome.lapses,
        due_date: outcome.due_date,
      });
      await createReviewLog({ card_id: card.id, rating, reviewed_at: now.toISOString() });

      setReviewed((n) => n + 1);
      if (idx >= queue.length - 1) {
        setFinished(true);
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

  return (
    <Panel className="animate-rise space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium tabular-nums text-muted" aria-live="polite">
          Card <span className="text-ink">{idx + 1}</span> of {queue.length}
        </p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Exit
        </Button>
      </div>

      {/* Progress bar — fills as cards are reviewed. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
          style={{ width: `${(idx / queue.length) * 100}%` }}
        />
      </div>

      {/* Card face — keyed on idx so each new card rises in. */}
      <div key={idx} className="animate-rise">
        <div className="flex min-h-[13rem] flex-col justify-center rounded-2xl border border-line/80 bg-gradient-to-b from-surface to-surface-2/70 px-6 py-10 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500/80 dark:text-brand-300/90">
            {card.topic}
          </p>
          <p
            ref={headingRef}
            tabIndex={-1}
            className="mt-4 text-xl font-medium leading-snug text-ink focus:outline-none"
          >
            {card.front}
          </p>
          {showBack ? (
            <div className="animate-rise mt-6 border-t border-dashed border-line pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
                Answer
              </p>
              <p className="mt-2 text-base leading-relaxed text-ink-2">{card.back}</p>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      {showBack ? (
        <div>
          <p className="mb-2 text-center text-xs text-subtle" id="rate-label">
            How well did you recall it?
          </p>
          <div
            ref={ratingsRef}
            role="group"
            aria-labelledby="rate-label"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {REVIEW_RATINGS.map(({ rating, label }) => (
              <button
                key={rating}
                onClick={() => rate(rating)}
                disabled={saving}
                aria-busy={pendingRating === rating || undefined}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl border bg-surface px-3 py-3 text-sm font-medium shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm",
                  RATING_CLASS[rating],
                )}
              >
                {pendingRating === rating ? (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current"
                  />
                ) : null}
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button className="w-full" onClick={() => setShowBack(true)}>
          Show answer
        </Button>
      )}
    </Panel>
  );
}
