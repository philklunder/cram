"use client";

import { useEffect, useState } from "react";

import { Badge, cn } from "@/components/ui";
import type { Card, Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown } from "@/lib/format";
import { computeProgress, type TrackStatus } from "@/lib/progress";
import { useCountUp } from "@/lib/useCountUp";

const statusLabel: Record<TrackStatus, string> = {
  "on-track": "On track",
  "catch-up": "Catch up",
  "no-cards": "No cards yet",
};

const statusTone: Record<TrackStatus, "green" | "amber" | "neutral"> = {
  "on-track": "green",
  "catch-up": "amber",
  "no-cards": "neutral",
};

// Progress overview for one subject: mastery breakdown, due-now count, exam countdown, and a
// simple on-track readout (see lib/progress.ts for the exact rules).
export function ProgressPanel({ subject, cards }: { subject: Subject; cards: Card[] }) {
  const p = computeProgress(cards);
  const days = daysUntil(subject.exam_date);
  const pct = (n: number) => (p.total === 0 ? 0 : (n / p.total) * 100);
  const masteredPct = useCountUp(p.masteredPct);

  // Bars start collapsed, then grow to their share on the next frame — a one-shot fill on entry.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex flex-wrap items-center gap-3">
        <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
        <span className="text-sm text-gray-500">{formatCountdown(days)}</span>
        {p.dueNow > 0 ? (
          <span className="text-sm font-medium text-amber-700">
            {p.dueNow} {p.dueNow === 1 ? "card" : "cards"} due now
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric value={p.total} label="Total cards" dotClass="bg-gray-300" delay={0} />
        <Metric value={p.mastered} label="Mastered" valueClass="text-green-700" dotClass="bg-green-500" delay={60} />
        <Metric value={p.learning} label="Learning" valueClass="text-amber-700" dotClass="bg-amber-400" delay={120} />
        <Metric value={p.shaky} label="Shaky" valueClass="text-red-700" dotClass="bg-red-500" delay={180} />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-gray-700">Mastery</span>
          <span className="text-gray-500 tabular-nums">{Math.round(masteredPct)}%</span>
        </div>
        {/* Segmented bar: mastered / learning / shaky, so the composition reads at a glance. */}
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
          role="img"
          aria-label={`${p.mastered} mastered, ${p.learning} learning, ${p.shaky} shaky of ${p.total} cards`}
        >
          <Segment widthPct={grown ? pct(p.mastered) : 0} className="bg-green-500" />
          <Segment widthPct={grown ? pct(p.learning) : 0} className="bg-amber-400" />
          <Segment widthPct={grown ? pct(p.shaky) : 0} className="bg-red-500" />
        </div>
      </div>
    </div>
  );
}

function Segment({ widthPct, className }: { widthPct: number; className: string }) {
  return (
    <div
      className={cn("h-full transition-[width] duration-700 ease-out", className)}
      style={{ width: `${widthPct}%` }}
    />
  );
}

function Metric({
  value,
  label,
  valueClass = "text-gray-900",
  dotClass,
  delay,
}: {
  value: number;
  label: string;
  valueClass?: string;
  dotClass: string;
  delay: number;
}) {
  const shown = useCountUp(value);
  return (
    <div
      className="animate-fade-up rounded-xl border border-gray-200/80 bg-white p-4 shadow-card transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-card-hover"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("text-2xl font-semibold tabular-nums", valueClass)}>{Math.round(shown)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
        {label}
      </div>
    </div>
  );
}
