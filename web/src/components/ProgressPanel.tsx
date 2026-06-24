"use client";

import { Badge, cn } from "@/components/ui";
import type { Card, Subject } from "@/lib/api/types";
import { daysUntil, formatCountdown } from "@/lib/format";
import { computeProgress, type TrackStatus } from "@/lib/progress";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
        <span className="text-sm text-gray-500">{formatCountdown(days)}</span>
        {p.dueNow > 0 ? (
          <span className="text-sm font-medium text-amber-700">
            {p.dueNow} {p.dueNow === 1 ? "card" : "cards"} due now
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric value={p.total} label="Total cards" dotClass="bg-gray-300" />
        <Metric value={p.mastered} label="Mastered" valueClass="text-green-700" dotClass="bg-green-500" />
        <Metric value={p.learning} label="Learning" valueClass="text-amber-700" dotClass="bg-amber-400" />
        <Metric value={p.shaky} label="Shaky" valueClass="text-red-700" dotClass="bg-red-500" />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-gray-700">Mastery</span>
          <span className="text-gray-500">{p.masteredPct}%</span>
        </div>
        {/* Segmented bar: mastered / learning / shaky, so the composition reads at a glance. */}
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
          role="img"
          aria-label={`${p.mastered} mastered, ${p.learning} learning, ${p.shaky} shaky of ${p.total} cards`}
        >
          <Segment widthPct={pct(p.mastered)} className="bg-green-500" />
          <Segment widthPct={pct(p.learning)} className="bg-amber-400" />
          <Segment widthPct={pct(p.shaky)} className="bg-red-500" />
        </div>
      </div>
    </div>
  );
}

function Segment({ widthPct, className }: { widthPct: number; className: string }) {
  if (widthPct <= 0) return null;
  return <div className={cn("h-full transition-all", className)} style={{ width: `${widthPct}%` }} />;
}

function Metric({
  value,
  label,
  valueClass = "text-gray-900",
  dotClass,
}: {
  value: number;
  label: string;
  valueClass?: string;
  dotClass: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-card">
      <div className={cn("text-2xl font-semibold tabular-nums", valueClass)}>{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
        {label}
      </div>
    </div>
  );
}
