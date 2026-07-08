"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, CalendarClock, ChevronRight, Clock, Layers, ListOrdered, Play, RefreshCw, Shuffle, SlidersHorizontal, Sparkles, Target, TrendingUp } from "lucide-react";

import { Modal } from "@/components/Modal";
import { ReviewSession, type ReviewCardContext } from "@/components/ReviewSession";
import { Button, EmptyState, ErrorBox, Skeleton, cn } from "@/components/ui";
import { loadDashboard, type DashboardData } from "@/lib/api/client";
import type { Card, Exam, ReviewLog, Subject } from "@/lib/api/types";
import { computeStreak, subjectExamDate } from "@/lib/dashboard";
import { daysUntil, subjectInitials } from "@/lib/format";
import { DEFAULT_REVIEW_SETTINGS, SESSION_SIZES, setReviewSettings, useReviewSettings, type ReviewOrder, type ReviewSettings } from "@/lib/reviewSettings";
import { subjectStrength } from "@/lib/srs/grade-strength";
import { subjectVars } from "@/lib/subjectColor";
import { useAsync } from "@/lib/useAsync";

interface Row {
  subject: Subject;
  due: number;
  total: number;
  days: number | null;
}

function rows(subjects: Subject[], cards: Card[], exams: Exam[], now: number): Row[] {
  return subjects
    .map((subject) => {
      const own = cards.filter((c) => c.subject_id === subject.id);
      const due = own.filter((c) => new Date(c.due_date).getTime() <= now).length;
      return { subject, due, total: own.length, days: daysUntil(subjectExamDate(subject.id, exams)) };
    })
    .filter((r) => r.due > 0)
    .sort((a, b) => b.due - a.due || (a.days ?? 1e9) - (b.days ?? 1e9) || a.subject.name.localeCompare(b.subject.name));
}

// Rough per-card review time (~47s), rounded to whole minutes.
function estimateMinutes(cardCount: number): number {
  return Math.max(1, Math.round((cardCount * 47) / 60));
}

// Recall accuracy over the last 7 days: a review rated ≥3 (hard/good/easy) counts as recalled;
// rating 1 (again) is a miss. null when there's nothing recent to score.
function recentAccuracy(logs: ReviewLog[], now: number): number | null {
  const cutoff = now - 7 * 86_400_000;
  const recent = logs.filter((l) => new Date(l.reviewed_at).getTime() >= cutoff);
  if (recent.length === 0) return null;
  const recalled = recent.filter((l) => l.rating >= 3).length;
  return Math.round((recalled / recent.length) * 100);
}

function scaleLabel(subject: Subject): string {
  const base = subject.grading_scale === "german" ? "German scale" : "Swiss scale";
  return subject.target_grade != null ? `${base} · Target ${subject.target_grade}` : base;
}

// The hub: today's due load across subjects, a prominent cross-subject session CTA, and tips.
export function ReviewHubView({
  subjects,
  cards,
  exams,
  reviewLogs = [],
  streak = 0,
  now = Date.now(),
  onStart,
  initialSettingsOpen = false,
}: {
  subjects: Subject[];
  cards: Card[];
  exams: Exam[];
  reviewLogs?: ReviewLog[];
  streak?: number;
  now?: number;
  onStart?: () => void;
  initialSettingsOpen?: boolean; // dev/preview only — render with the settings dialog open
}) {
  const list = rows(subjects, cards, exams, now);
  const totalDue = list.reduce((n, r) => n + r.due, 0);
  const subjectsDue = list.length;
  const accuracy = recentAccuracy(reviewLogs, now);
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);

  return (
    <section>
      {/* Header with illustration */}
      <header className="animate-rise relative mb-8">
        <div className="max-w-prose">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            <RefreshCw className="h-6 w-6 text-brand-500 sm:h-7 sm:w-7" strokeWidth={2.25} aria-hidden />
            Review
          </h1>
          <p className="mt-1.5 text-sm text-ink-2">Smart repetition that helps you remember what matters.</p>
        </div>
        <ReviewArt className="pointer-events-none absolute -top-3 right-0 hidden md:block" />
      </header>

      {list.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          hint="No cards are due right now. Upload material to a subject to generate a deck, or come back when cards are ready."
        />
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Layers} tone="violet" label="Cards due today" value={String(totalDue)} sub={`Across ${subjectsDue} subject${subjectsDue === 1 ? "" : "s"}`} />
            <StatCard icon={CalendarClock} tone="amber" label="Estimated time" value={`${estimateMinutes(totalDue)} min`} sub="For today's review" />
            <StatCard icon={TrendingUp} tone="green" label="Review streak" value={`${streak} day${streak === 1 ? "" : "s"}`} sub={streak > 0 ? "Keep it going!" : "Start today"} />
            <StatCard icon={Target} tone="sky" label="Accuracy" value={accuracy == null ? "—" : `${accuracy}%`} sub="Last 7 days" />
          </div>

          {/* Today's review by subject + ready-to-review CTA */}
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <h2 className="mb-4 text-base font-semibold tracking-tight text-ink">Today&rsquo;s review by subject</h2>
              <ul className="divide-y divide-line">
                {list.map(({ subject, due, total }) => {
                  const pct = total > 0 ? Math.round((due / total) * 100) : 0;
                  return (
                    <li key={subject.id}>
                      <Link
                        href={`/subjects/${subject.id}`}
                        style={subjectVars(subject.id)}
                        className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3.5 transition duration-200 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        <span
                          aria-hidden
                          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-sm font-bold ring-1 ring-inset ring-[var(--sc-line)] bg-[var(--sc-soft)] text-[color:var(--sc-ink)] dark:bg-[color:var(--sc-soft-dark)] dark:text-[color:var(--sc-ink-dark)] dark:ring-[color:var(--sc-solid)]/25"
                        >
                          {subjectInitials(subject.name)}
                        </span>
                        <div className="hidden min-w-0 sm:block sm:w-40 sm:flex-none">
                          <p className="truncate font-semibold text-ink">{subject.name}</p>
                          <p className="truncate text-sm text-muted">{scaleLabel(subject)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="mb-1.5 text-sm font-semibold text-[color:var(--sc-ink)] dark:text-[color:var(--sc-ink-dark)]">
                            <span className="sm:hidden">{subject.name} · </span>{due} card{due === 1 ? "" : "s"} due
                          </p>
                          <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                            <div className="h-full rounded-full bg-[var(--sc-solid)] transition-all duration-500" style={{ width: `${Math.max(6, pct)}%` }} />
                          </div>
                        </div>
                        <span className="hidden flex-none text-sm font-medium tabular-nums text-muted sm:inline">{estimateMinutes(due)} min</span>
                        <ChevronRight className="h-4 w-4 flex-none text-subtle transition-transform group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={onStart}
                disabled={!onStart}
                className="mt-2 flex w-full items-center gap-4 rounded-xl border border-dashed border-line-strong/70 px-4 py-3.5 text-left transition duration-200 hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
              >
                <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25">
                  <Layers className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">Review all cards</p>
                  <p className="text-sm text-muted">Mix all {totalDue} due card{totalDue === 1 ? "" : "s"} from every subject</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-none text-subtle" strokeWidth={2} aria-hidden />
              </button>
            </div>

            {/* Ready to review */}
            <div className="flex flex-col rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-6 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/[0.04]">
              <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-brand-600 shadow-sm ring-1 ring-inset ring-brand-100 dark:bg-white/10 dark:text-brand-300 dark:ring-brand-500/25">
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </span>
              <h2 className="mt-5 text-xl font-bold tracking-tight text-ink">Ready to review?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">Let&rsquo;s strengthen your memory with smart repetition.</p>
              <div className="mt-auto pt-6">
                <Button className="w-full py-3 text-[15px]" onClick={onStart} disabled={!onStart}>
                  <Play className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden />
                  Start review
                </Button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:text-brand-300 dark:hover:text-brand-200"
                >
                  <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Review settings
                </button>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 className="mb-5 text-base font-semibold tracking-tight text-ink">Tips for better retention</h2>
            <div className="grid gap-6 sm:grid-cols-3">
              <Tip icon={Brain} title="Consistency is key" body="Review a little every day to build long-term memory." />
              <Tip icon={Clock} title="Trust the process" body="We show you cards right before you forget them." />
              <Tip icon={Target} title="Focus & quality" body="Stay focused during reviews for the best results." />
            </div>
          </div>
        </div>
      )}

      <ReviewSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </section>
  );
}

// The Review settings dialog — device-local preferences that shape the session (not its contents).
// Both options are wired straight into the queue the session builds (see lib/reviewSettings.ts).
function ReviewSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useReviewSettings();
  const [draft, setDraft] = useState<ReviewSettings>(saved);

  // Re-seed the draft from the saved value each time the dialog opens, so cancelling discards edits.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(saved);
  }

  function save() {
    setReviewSettings(draft);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Review settings" description="How your spaced-repetition sessions run. Saved on this device.">
      <div className="space-y-6">
        <SettingRow icon={Layers} label="Cards per session" hint="Cap how many due cards a single session serves.">
          <Segmented
            options={SESSION_SIZES.map((n) => ({ value: n, label: n === 0 ? "All" : String(n) }))}
            value={draft.sessionSize}
            onChange={(sessionSize) => setDraft((d) => ({ ...d, sessionSize }))}
          />
        </SettingRow>

        <SettingRow icon={ListOrdered} label="Card order" hint="Walk the most-due cards first, or mix them up.">
          <Segmented
            options={[
              { value: "due" as ReviewOrder, label: "Due first", icon: ListOrdered },
              { value: "shuffle" as ReviewOrder, label: "Shuffle", icon: Shuffle },
            ]}
            value={draft.order}
            onChange={(order) => setDraft((d) => ({ ...d, order }))}
          />
        </SettingRow>
      </div>

      <div className="mt-7 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_REVIEW_SETTINGS)}
          className="text-sm font-medium text-muted transition hover:text-ink-2"
        >
          Reset to defaults
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function SettingRow({ icon: Icon, label, hint, children }: { icon: typeof Layers; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-500 dark:text-brand-300" strokeWidth={2} aria-hidden />
        <p className="text-sm font-semibold text-ink">{label}</p>
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// A small segmented control. Generic over the option value so it serves both the numeric session
// size and the string card order.
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; icon?: typeof Layers }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1.5 rounded-xl border border-line bg-surface-2/50 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        const OptIcon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              active
                ? "bg-surface text-brand-700 shadow-sm ring-1 ring-inset ring-line dark:bg-brand-500/20 dark:text-brand-100 dark:ring-brand-500/30"
                : "text-muted hover:text-ink-2",
            )}
          >
            {OptIcon ? <OptIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

type StatTone = "violet" | "amber" | "green" | "sky";
const statTones: Record<StatTone, string> = {
  violet: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  green: "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
};

function StatCard({ icon: Icon, tone, label, value, sub }: { icon: typeof Layers; tone: StatTone; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span aria-hidden className={cn("flex h-11 w-11 flex-none items-center justify-center rounded-full", statTones[tone])}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="text-xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
        <p className="truncate text-xs text-subtle">{sub}</p>
      </div>
    </div>
  );
}

function Tip({ icon: Icon, title, body }: { icon: typeof Brain; title: string; body: string }) {
  return (
    <div className="flex gap-3.5">
      <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

// The stacked-cards + sync glyph illustration in the header's top-right. Self-contained SVG so it
// stays crisp at any DPI and needs no asset request; the purple gradient reads on light and dark.
function ReviewArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={cn("h-[104px] w-[168px]", className)} fill="none" aria-hidden>
      <defs>
        <linearGradient id="rv-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b7bff" />
          <stop offset="1" stopColor="#6d4dff" />
        </linearGradient>
        <linearGradient id="rv-mid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      {/* ground glow */}
      <ellipse cx="126" cy="132" rx="82" ry="12" fill="#7c4dff" opacity="0.10" />
      {/* back cards, fanned */}
      <rect x="150" y="30" width="80" height="66" rx="15" fill="url(#rv-mid)" opacity="0.5" transform="rotate(10 190 63)" />
      <rect x="120" y="24" width="82" height="68" rx="15" fill="url(#rv-mid)" opacity="0.75" transform="rotate(-7 161 58)" />
      {/* front card */}
      <rect x="80" y="34" width="92" height="76" rx="18" fill="url(#rv-front)" />
      <rect x="80" y="34" width="92" height="76" rx="18" fill="white" opacity="0.08" style={{ mixBlendMode: "overlay" }} />
      {/* sync glyph, centered on the front card (~126,72) */}
      <g transform="translate(126 72) scale(1.5)" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-9 0a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L9 -4" />
        <path d="M9 -9v5H4" />
        <path d="M9 0a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L-9 4" />
        <path d="M-9 9v-5h5" />
      </g>
      {/* sparkles */}
      <g fill="#a78bfa">
        <circle cx="70" cy="26" r="2.5" opacity="0.8" />
        <circle cx="196" cy="104" r="2" opacity="0.7" />
        <path d="M210 44l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" opacity="0.6" />
      </g>
    </svg>
  );
}

// The /review route: hub → cross-subject session and back.
export function ReviewHubPage() {
  const { loading, error, data, reload } = useAsync(() => loadDashboard(), []);
  const [active, setActive] = useState(false);
  const settings = useReviewSettings();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const now = Date.now();
  const dueCards = data.cards.filter((c) => new Date(c.due_date).getTime() <= now);
  const streak = computeStreak(data.reviewLogs, now).current;

  if (active && dueCards.length > 0) {
    return (
      <ReviewSession
        cards={dueCards}
        streak={streak}
        order={settings.order}
        limit={settings.sessionSize}
        contextFor={(card) => contextFor(data, card)}
        onClose={() => setActive(false)}
        onReviewed={reload}
      />
    );
  }

  return (
    <ReviewHubView
      subjects={data.subjects}
      cards={data.cards}
      exams={data.exams}
      reviewLogs={data.reviewLogs}
      streak={streak}
      now={now}
      onStart={dueCards.length > 0 ? () => setActive(true) : undefined}
    />
  );
}

function contextFor(data: DashboardData, card: Card): ReviewCardContext {
  const subject = data.subjects.find((s) => s.id === card.subject_id)!;
  const entries = data.gradeEntries.filter((e) => e.subject_id === subject.id);
  // Compress this card's schedule toward its own exam's date (a card outlives its exam and may be
  // unassigned → "General" → no exam date → no compression).
  const exam = card.exam_id ? data.exams.find((e) => e.id === card.exam_id) : undefined;
  return {
    subject,
    examDate: exam?.exam_date ?? null,
    strength: subjectStrength(subject.grading_scale, subject.current_grade, entries),
  };
}
