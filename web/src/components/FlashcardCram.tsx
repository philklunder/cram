"use client";

// Free "cram" flip-through — a lightweight self-check over any cards you pick. Flip front→back,
// mark yourself Got it / Missed, and see a quick tally at the end. Deliberately does NOT touch the
// SM-2 schedule (that's what Review and the subject-page "Study" do) — this is for last-minute
// cramming across cards whether or not they're due.

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, RotateCcw, X } from "lucide-react";

import { Button, cn } from "@/components/ui";
import type { Card } from "@/lib/api/types";

export function FlashcardCram({
  cards,
  title,
  subtitle,
  onClose,
}: {
  cards: Card[];
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [deck, setDeck] = useState<Card[]>(cards);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [got, setGot] = useState<string[]>([]);
  const [missed, setMissed] = useState<Card[]>([]);
  const [done, setDone] = useState(false);

  const card = deck[idx];

  const advance = useCallback(
    (hit: boolean) => {
      if (!card) return;
      if (hit) setGot((g) => [...g, card.id]);
      else setMissed((m) => [...m, card]);
      if (idx + 1 >= deck.length) {
        setDone(true);
      } else {
        setIdx((i) => i + 1);
        setFlipped(false);
      }
    },
    [card, idx, deck.length],
  );

  const restart = useCallback((next: Card[]) => {
    setDeck(next);
    setIdx(0);
    setFlipped(false);
    setGot([]);
    setMissed([]);
    setDone(false);
  }, []);

  // Keyboard: Space/Enter flips; once flipped, 1/←/J = missed, 2/→/K/Enter = got.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (done) return;
      if (!flipped) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped(true); }
        return;
      }
      if (e.key === "1" || e.key === "ArrowLeft" || e.key.toLowerCase() === "j") { e.preventDefault(); advance(false); }
      else if (e.key === "2" || e.key === "ArrowRight" || e.key.toLowerCase() === "k" || e.key === "Enter") { e.preventDefault(); advance(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, done, advance]);

  if (done) {
    const total = got.length + missed.length;
    const pct = total ? Math.round((got.length / total) * 100) : 0;
    return (
      <section className="mx-auto max-w-md">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">{title}</p>
          <p className={cn("mt-3 text-5xl font-bold tabular-nums", pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")}>
            {pct}%
          </p>
          <p className="mt-2 text-sm text-muted">{got.length} of {total} recalled</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {missed.length > 0 ? (
              <Button onClick={() => restart(missed)}>
                <RotateCcw className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Cram {missed.length} missed
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => restart(cards)}>
              <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
              Restart
            </Button>
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
        </div>
      </section>
    );
  }

  if (!card) return null;
  const progress = ((idx + (flipped ? 0.5 : 0)) / deck.length) * 100;

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink">
            {title}
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">Cram</span>
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>Exit</Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-brand-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <span className="flex-none text-sm tabular-nums text-muted">{idx + 1} / {deck.length}</span>
      </div>

      {/* The card — click / Space to flip. */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show front" : "Show answer"}
        className="group block w-full text-left [perspective:1600px] focus-visible:outline-none"
      >
        <div
          className={cn(
            "relative min-h-[15rem] w-full rounded-2xl transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && !reduce && "[transform:rotateY(180deg)]",
          )}
          style={reduce ? undefined : { transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
        >
          {/* Front */}
          <Face hidden={reduce ? flipped : false} absolute={!reduce} faceClass="[backface-visibility:hidden]">
            <span className="mb-2 inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
              {card.topic}
            </span>
            <p className="text-xl font-semibold leading-snug text-ink sm:text-2xl">{card.front}</p>
            <p className="mt-4 text-xs font-medium text-subtle">Click or press Space to flip</p>
          </Face>
          {/* Back */}
          <Face hidden={reduce ? !flipped : false} faceClass="[backface-visibility:hidden] [transform:rotateY(180deg)]" absolute={!reduce}>
            <span className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Answer</span>
            <p className="text-lg leading-relaxed text-ink sm:text-xl">{card.back}</p>
          </Face>
        </div>
      </button>

      {/* Grade yourself — only after flipping. */}
      <div className="mt-5 min-h-[3rem]">
        <AnimatePresence mode="wait">
          {flipped ? (
            <motion.div
              key="grade"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex gap-3"
            >
              <Button variant="secondary" className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10" onClick={() => advance(false)}>
                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Missed
              </Button>
              <Button className="flex-1" onClick={() => advance(true)}>
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Got it
              </Button>
            </motion.div>
          ) : (
            <p key="hint" className="text-center text-sm text-muted">Flip the card, then mark how you did.</p>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-4 hidden justify-center gap-4 text-xs text-subtle sm:flex">
        <Kbd>Space</Kbd> flip
        <span><Kbd>1</Kbd> missed</span>
        <span><Kbd>2</Kbd> got it</span>
      </p>
    </section>
  );
}

function Face({ children, faceClass, absolute = true, hidden }: { children: React.ReactNode; faceClass: string; absolute?: boolean; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div
      className={cn(
        "flex min-h-[15rem] flex-col items-start justify-center rounded-2xl border border-line bg-surface p-8 shadow-card",
        absolute && "absolute inset-0",
        faceClass,
      )}
    >
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">{children}</kbd>;
}
