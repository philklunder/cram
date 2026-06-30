"use client";

// Spaced-repetition review. Walks the due cards one at a time: show the front, reveal the back,
// rate recall (Again/Hard/Good/Easy). Each rating runs the local SM-2 scheduler (a faithful port
// of the iOS one) and writes the new card state back (PATCH /v1/cards) plus an append-only
// review-log (POST /v1/review-logs) — so reviewing on web advances the same schedule as iOS.

import { useEffect, useRef, useState } from "react";

import { Badge, Button, ErrorBox, Panel, cn } from "@/components/ui";
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
  1: "border-red-300 text-red-700 hover:bg-red-50",
  3: "border-amber-300 text-amber-800 hover:bg-amber-50",
  4: "border-green-300 text-green-700 hover:bg-green-50",
  5: "border-brand-300 text-brand-700 hover:bg-brand-50",
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
        <p className="text-sm font-semibold text-gray-800">Nothing to review</p>
        <p className="text-sm text-gray-500">Add material to this subject to generate cards.</p>
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
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
          <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">Session complete</p>
          <p className="mt-0.5 text-sm text-gray-500">
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
    <Panel className="animate-rise space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500" aria-live="polite">
          Card {idx + 1} of {queue.length}
        </p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Exit
        </Button>
      </div>

      {/* Progress bar — fills as cards are reviewed. */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-500 ease-out"
          style={{ width: `${(idx / queue.length) * 100}%` }}
        />
      </div>

      {/* Card face — keyed on idx so each new card rises in. */}
      <div key={idx} className="animate-rise">
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-5 py-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.topic}</p>
          <p
            ref={headingRef}
            tabIndex={-1}
            className="mt-3 text-lg font-medium text-gray-900 focus:outline-none"
          >
            {card.front}
          </p>
          {showBack ? (
            <div className="animate-rise mt-5 border-t border-gray-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Answer</p>
              <p className="mt-2 text-base text-gray-700">{card.back}</p>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      {showBack ? (
        <div>
          <p className="mb-2 text-center text-xs text-gray-400" id="rate-label">
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
                  "inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
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
