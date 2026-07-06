"use client";

// Take-a-quiz session. Steps through a quiz's questions one at a time:
//   • multiple choice → graded in the browser against answer_key, persisted via POST /v1/attempts
//   • short answer    → graded by POST /v1/grade (the server-side Claude call, behind the spend
//                       cap), which also persists the attempt when question_id is sent
// Shows a live session-overview rail (score, correct/incorrect/remaining, confidence, topic
// breakdown) and, after grading, why the answer matters — then a final score summary.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, HelpCircle, Lightbulb, Target, X } from "lucide-react";

import { Button, ErrorBox, cn, inputClass, labelClass } from "@/components/ui";
import { createAttempt, createStudySession, gradeShortAnswer } from "@/lib/api/client";
import type { Question } from "@/lib/api/types";
import { useCountUp } from "@/lib/useCountUp";

interface Graded {
  topic: string;
  score: number; // 0..1
  is_correct: boolean;
  feedback: string;
  answerKey: string; // for the "why this matters" explanation
  isMC: boolean;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function QuizRunner({
  title,
  subtitle,
  questions,
  subjectId = null,
  onClose,
  initialIdx = 0,
  initialResponse = "",
  initialResults = [],
}: {
  title: string;
  subtitle?: string;
  questions: Question[];
  subjectId?: string | null;
  onClose: () => void;
  initialIdx?: number; // dev/preview only
  initialResponse?: string; // dev/preview only
  initialResults?: Graded[]; // dev/preview only — seed a mid-session rail
}) {
  const [idx, setIdx] = useState(initialIdx);
  const [response, setResponse] = useState(initialResponse);
  const [result, setResult] = useState<Graded | null>(null);
  const [results, setResults] = useState<Graded[]>(initialResults);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Live timer.
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Study-time tracking — recorded once on finish/exit, fire-and-forget.
  const startedAtRef = useRef(Date.now());
  const answeredRef = useRef(initialResults.length);
  const recordedRef = useRef(false);
  const endSession = useCallback(() => {
    if (recordedRef.current || answeredRef.current === 0) return;
    recordedRef.current = true;
    const duration = Math.min(86_400, Math.round((Date.now() - startedAtRef.current) / 1000));
    if (duration <= 0) return;
    createStudySession({ subject_id: subjectId, duration_seconds: duration, kind: "quiz", started_at: new Date(startedAtRef.current).toISOString() }).catch(() => {});
  }, [subjectId]);
  useEffect(() => () => endSession(), [endSession]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [idx]);

  const q = questions[idx];
  const isMC = q?.kind === "multipleChoice";
  const isLast = idx === questions.length - 1;
  const answered = isMC ? response !== "" : response.trim() !== "";

  async function submit() {
    if (!answered || grading || !q) return;
    setGrading(true);
    setError(null);
    try {
      let graded: Graded;
      if (isMC) {
        const is_correct = response === q.answer_key;
        const score = is_correct ? 1 : 0;
        await createAttempt({ question_id: q.id, response, is_correct, score, feedback: "" });
        graded = { topic: q.topic, score, is_correct, feedback: "", answerKey: q.answer_key, isMC: true };
      } else {
        const g = await gradeShortAnswer({ prompt: q.prompt, model_answer: q.answer_key, response, topic: q.topic, question_id: q.id });
        graded = { topic: q.topic, score: g.score, is_correct: g.is_correct, feedback: g.feedback, answerKey: q.answer_key, isMC: false };
      }
      answeredRef.current += 1;
      setResult(graded);
      setResults((acc) => [...acc, graded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grade that answer.");
    } finally {
      setGrading(false);
    }
  }

  const next = useCallback(() => {
    if (isLast) {
      endSession();
      setFinished(true);
      return;
    }
    setIdx((i) => i + 1);
    setResponse("");
    setResult(null);
    setError(null);
  }, [isLast, endSession]);

  // Keyboard shortcuts: 1–4 pick an option, Enter checks / advances, N next.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!q) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (result) {
        if (e.key === "Enter" || e.key.toLowerCase() === "n" || e.key === "ArrowRight") { e.preventDefault(); next(); }
        return;
      }
      if (isMC) {
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) { e.preventDefault(); setResponse(q.options[n - 1]); }
        else if (e.key === "Enter" && response) { e.preventDefault(); submit(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, isMC, result, response, next]);

  if (!q) return null;
  if (finished) return <Summary title={title} results={results} onClose={onClose} />;

  const answeredCount = results.length;
  const correct = results.filter((r) => r.is_correct).length;
  const incorrect = answeredCount - correct;
  const remaining = questions.length - answeredCount;
  const scorePct = answeredCount ? Math.round((results.reduce((s, r) => s + r.score, 0) / answeredCount) * 100) : 0;

  return (
    <section>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink">
            {title}
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">Practice</span>
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium tabular-nums text-ink-2 shadow-sm">
            <Clock className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
            {formatClock(elapsed)}
          </span>
          <Button variant="secondary" size="sm" onClick={() => { endSession(); onClose(); }}>Exit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Question card */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out" style={{ width: `${((idx + (result ? 1 : 0)) / questions.length) * 100}%` }} />
            </div>
            <span className="flex-none rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{q.topic}</span>
          </div>
          <p className="text-sm text-muted" aria-live="polite">Question {idx + 1} of {questions.length}</p>

          <div key={idx} className="animate-rise rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold leading-snug text-ink focus:outline-none sm:text-xl">{q.prompt}</h2>

            {isMC ? (
              <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Answer options">
                {q.options.map((opt, i) => {
                  const selected = response === opt;
                  const isAnswer = result != null && opt === q.answer_key;
                  const isWrongPick = result != null && selected && opt !== q.answer_key;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={result != null}
                      onClick={() => setResponse(opt)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                        result == null && "hover:border-line-strong active:scale-[0.995]",
                        result == null && selected ? "border-brand-500 bg-brand-50/60 text-ink shadow-brand-sm dark:bg-brand-500/15" : "border-line text-ink-2",
                        isAnswer && "border-green-500 bg-green-50 text-green-800 dark:border-green-500/50 dark:bg-green-500/15 dark:text-green-200",
                        isWrongPick && "border-red-400 bg-red-50 text-red-800 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-200",
                        result != null && "cursor-default",
                      )}
                    >
                      <span className={cn(
                        "flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold",
                        isAnswer ? "bg-green-500 text-white" : isWrongPick ? "bg-red-500 text-white" : selected ? "bg-brand-500 text-white" : "bg-surface-2 text-muted",
                      )}>
                        {isAnswer ? <Check className="h-4 w-4" strokeWidth={3} /> : isWrongPick ? <X className="h-4 w-4" strokeWidth={3} /> : LETTERS[i]}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6">
                <label htmlFor="sa-response" className={labelClass}>Your answer</label>
                <textarea id="sa-response" rows={4} value={response} onChange={(e) => setResponse(e.target.value)} disabled={result != null} className={cn(inputClass, "resize-y disabled:bg-surface-2 disabled:text-muted")} placeholder="Type your answer…" />
              </div>
            )}

            {error ? <div className="mt-4"><ErrorBox message={error} /></div> : null}

            <div className="mt-6">
              {result == null ? (
                <>
                  <Button className="w-full" onClick={submit} loading={grading} disabled={!answered}>
                    {grading && !isMC ? "Grading…" : "Check answer"}
                  </Button>
                  {isMC ? <button type="button" onClick={next} className="mt-3 block w-full text-center text-sm font-medium text-muted transition hover:text-ink-2">I&rsquo;m not sure</button> : null}
                </>
              ) : (
                <Button className="w-full" onClick={next}>{isLast ? "See results" : "Next question"}</Button>
              )}
            </div>
          </div>

          <p className="hidden justify-center gap-4 text-xs text-subtle sm:flex">
            <Kbd>1–4</Kbd> to answer <Kbd>N</Kbd> next question
          </p>
        </div>

        {/* Session overview rail */}
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold tracking-tight text-ink">Session overview</h2>
            <div className="flex items-center gap-4">
              <ScoreDonut pct={scorePct} />
              <div className="flex-1 space-y-2">
                <Tally icon={Check} tone="green" label="Correct" value={correct} />
                <Tally icon={X} tone="red" label="Incorrect" value={incorrect} />
                <Tally icon={Clock} tone="muted" label="Remaining" value={remaining} />
              </div>
            </div>
            <Confidence results={results} />
          </div>

          <TopicBreakdown questions={questions} results={results} />

          {result ? <WhyThisMatters result={result} /> : null}
        </aside>
      </div>
    </section>
  );
}

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">{children}</kbd>;
}

function ScoreDonut({ pct }: { pct: number }) {
  const shown = Math.round(useCountUp(pct));
  const size = 92, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const len = (pct / 100) * c;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(148 163 184 / 0.2)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#7c4dff" strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeLinecap="round" className="transition-[stroke-dasharray] duration-700" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-ink">{shown}%</span>
        <span className="text-[10px] text-muted">Score</span>
      </div>
    </div>
  );
}

function Tally({ icon: Icon, tone, label, value }: { icon: typeof Check; tone: "green" | "red" | "muted"; label: string; value: number }) {
  const c = tone === "green" ? "text-green-600 dark:text-green-400" : tone === "red" ? "text-red-600 dark:text-red-400" : "text-muted";
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={cn("h-4 w-4 flex-none", c)} strokeWidth={2} aria-hidden />
      <span className="flex-1 text-ink-2">{label}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function Confidence({ results }: { results: Graded[] }) {
  const recent = results.slice(-3);
  const hits = recent.filter((r) => r.is_correct).length;
  const level = results.length === 0 ? 0 : hits >= 3 ? 3 : hits >= 2 ? 2 : hits >= 1 ? 1 : 0;
  const label = results.length === 0 ? "—" : level >= 3 ? "High" : level >= 2 ? "Medium" : level >= 1 ? "Building" : "Low";
  const color = level >= 3 ? "text-green-600 dark:text-green-400" : level >= 1 ? "text-amber-600 dark:text-amber-400" : "text-muted";
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink-2">Confidence</span>
        <span className={cn("font-semibold", color)}>{label}</span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < level * 2 ? "bg-brand-500" : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

function TopicBreakdown({ questions, results }: { questions: Question[]; results: Graded[] }) {
  const total = new Map<string, number>();
  for (const q of questions) total.set(q.topic, (total.get(q.topic) ?? 0) + 1);
  const got = new Map<string, number>();
  for (const r of results) if (r.is_correct) got.set(r.topic, (got.get(r.topic) ?? 0) + 1);
  const topics = [...total.keys()];
  if (topics.length <= 1) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Topic breakdown</h2>
      <ul className="space-y-3">
        {topics.map((t) => {
          const n = total.get(t) ?? 1;
          const c = got.get(t) ?? 0;
          return (
            <li key={t}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate text-ink-2">{t}</span>
                <span className="flex-none tabular-nums text-muted">{c}/{n}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c / n) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WhyThisMatters({ result }: { result: Graded }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-100/30 p-5 dark:border-brand-500/20 dark:from-brand-500/12 dark:to-brand-500/5">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden />
        <p className="text-sm font-semibold text-ink">Why this matters</p>
      </div>
      {result.feedback ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{result.feedback}</p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          The correct answer is <span className="font-medium text-ink">{result.answerKey}</span>. Review this concept so it sticks for the exam.
        </p>
      )}
    </div>
  );
}

// Final score summary across the whole quiz.
function Summary({ title, results, onClose }: { title: string; results: Graded[]; onClose: () => void }) {
  const correct = results.filter((r) => r.is_correct).length;
  const total = results.length;
  const avg = total === 0 ? 0 : results.reduce((s, r) => s + r.score, 0) / total;
  const avgPct = Math.round(avg * 100);
  const tone = avgPct >= 80 ? "text-green-600 dark:text-green-400" : avgPct >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const shownPct = Math.round(useCountUp(avgPct, 900));
  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">{title}</p>
        <p className={cn("mt-3 text-5xl font-bold tabular-nums", tone)}>{shownPct}%</p>
        <p className="mt-2 text-sm text-muted">{correct} of {total} correct</p>
        <p className="mt-1 text-sm font-medium text-ink">{avgPct >= 80 ? "Strong — you're exam-ready on this." : avgPct >= 50 ? "Getting there — review the misses." : "Needs review — worth another pass."}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </section>
  );
}
