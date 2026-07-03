"use client";

// Take-a-quiz flow. Steps through a quiz's questions one at a time:
//   • multiple choice → graded in the browser against answer_key, persisted via POST /v1/attempts
//   • short answer    → graded by POST /v1/grade (the server-side Claude call, behind the spend
//                       cap), which also persists the attempt when question_id is sent
// Shows per-question feedback, then a final score summary.

import { useEffect, useRef, useState } from "react";

import { Badge, Button, ErrorBox, Panel, cn, labelClass, inputClass } from "@/components/ui";
import { createAttempt, gradeShortAnswer } from "@/lib/api/client";
import type { Question } from "@/lib/api/types";
import { useCountUp } from "@/lib/useCountUp";

interface Graded {
  score: number; // 0..1
  is_correct: boolean;
  feedback: string;
}

export function QuizRunner({
  title,
  questions,
  onClose,
}: {
  title: string;
  questions: Question[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<Graded | null>(null);
  const [results, setResults] = useState<Graded[]>([]);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  // Move focus to the question heading whenever the question changes (and on mount), so
  // keyboard and screen-reader users follow the flow instead of being stranded on the last
  // control. The heading is programmatically focusable (tabIndex -1).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [idx]);

  const q = questions[idx];
  if (!q) return null;

  const isMC = q.kind === "multipleChoice";
  const isLast = idx === questions.length - 1;
  const answered = isMC ? response !== "" : response.trim() !== "";

  async function submit() {
    if (!answered || grading) return;
    setGrading(true);
    setError(null);
    try {
      let graded: Graded;
      if (isMC) {
        const is_correct = response === q.answer_key;
        const score = is_correct ? 1 : 0;
        await createAttempt({ question_id: q.id, response, is_correct, score, feedback: "" });
        graded = { score, is_correct, feedback: "" };
      } else {
        const g = await gradeShortAnswer({
          prompt: q.prompt,
          model_answer: q.answer_key,
          response,
          topic: q.topic,
          question_id: q.id,
        });
        graded = { score: g.score, is_correct: g.is_correct, feedback: g.feedback };
      }
      setResult(graded);
      setResults((acc) => [...acc, graded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grade that answer.");
    } finally {
      setGrading(false);
    }
  }

  function next() {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIdx((i) => i + 1);
    setResponse("");
    setResult(null);
    setError(null);
  }

  if (finished) {
    return <Summary title={title} results={results} onClose={onClose} />;
  }

  return (
    <Panel className="animate-rise space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">{title}</p>
          <p className="mt-0.5 text-sm text-muted" aria-live="polite">
            Question {idx + 1} of {questions.length}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Exit
        </Button>
      </div>

      {/* Progress bar — fills as questions are completed (graded). */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
          style={{ width: `${((idx + (result ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      {/* Keyed on idx so each new question gently rises in. */}
      <div key={idx} className="animate-rise space-y-5">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="text-base font-semibold text-ink focus:outline-none"
            >
              {q.prompt}
            </h3>
            <Badge tone="brand">{isMC ? "Multiple choice" : "Short answer"}</Badge>
          </div>
          <p className="text-xs text-muted">{q.topic}</p>
        </div>

        {isMC ? (
        <fieldset className="space-y-2" disabled={result != null}>
          <legend className="sr-only">Choose an answer</legend>
          {q.options.map((opt, i) => {
            const selected = response === opt;
            // After grading, mark the correct option green and a wrong pick red.
            const isAnswer = result != null && opt === q.answer_key;
            const isWrongPick = result != null && selected && opt !== q.answer_key;
            return (
              <label
                key={i}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition duration-200 ease-out",
                  result == null && "hover:-translate-y-0.5 active:scale-[0.99]",
                  result == null && selected
                    ? "border-brand-500 bg-brand-50/60 text-ink shadow-brand-sm dark:bg-brand-500/15"
                    : "border-line text-ink-2 hover:border-line-strong",
                  isAnswer && "border-green-500 bg-green-50 text-green-800 dark:border-green-500/50 dark:bg-green-500/15 dark:text-green-200",
                  isWrongPick && "border-red-400 bg-red-50 text-red-800 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-200",
                  result != null && "cursor-default",
                )}
              >
                <input
                  type="radio"
                  name="mc-option"
                  value={opt}
                  checked={selected}
                  onChange={() => setResponse(opt)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <div>
          <label htmlFor="sa-response" className={labelClass}>
            Your answer
          </label>
          <textarea
            id="sa-response"
            rows={4}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            disabled={result != null}
            className={cn(inputClass, "resize-y disabled:bg-surface-2 disabled:text-muted")}
            placeholder="Type your answer…"
          />
        </div>
        )}
      </div>

      {error ? <ErrorBox message={error} /> : null}

      {result ? (
        <ResultCard result={result} answerKey={isMC ? null : q.answer_key} />
      ) : null}

      <div className="flex justify-end gap-2">
        {result == null ? (
          <Button onClick={submit} loading={grading} disabled={!answered}>
            {grading && !isMC ? "Grading…" : isMC ? "Submit answer" : "Check answer"}
          </Button>
        ) : (
          <Button onClick={next}>{isLast ? "See results" : "Next question"}</Button>
        )}
      </div>
    </Panel>
  );
}

// Per-question feedback shown after grading. For short answer we also reveal the model answer.
function ResultCard({ result, answerKey }: { result: Graded; answerKey: string | null }) {
  const pct = Math.round(result.score * 100);
  return (
    <div
      aria-live="polite"
      className={cn(
        "animate-rise space-y-2 rounded-xl border px-4 py-3 text-sm",
        result.is_correct
          ? "border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
      )}
    >
      <div className="flex items-center gap-2">
        <Badge tone={result.is_correct ? "green" : "amber"}>
          {result.is_correct ? "Correct" : "Not quite"}
        </Badge>
        {answerKey != null ? (
          <span className="text-xs text-muted">Scored {pct}%</span>
        ) : null}
      </div>
      {result.feedback ? <p className="text-ink-2">{result.feedback}</p> : null}
      {answerKey != null ? (
        <p className="text-ink-2">
          <span className="font-medium text-ink">Model answer:</span> {answerKey}
        </p>
      ) : null}
    </div>
  );
}

// Final score summary across the whole quiz.
function Summary({
  title,
  results,
  onClose,
}: {
  title: string;
  results: Graded[];
  onClose: () => void;
}) {
  const correct = results.filter((r) => r.is_correct).length;
  const total = results.length;
  const avg = total === 0 ? 0 : results.reduce((s, r) => s + r.score, 0) / total;
  const avgPct = Math.round(avg * 100);
  const tone = avgPct >= 80 ? "green" : avgPct >= 50 ? "amber" : "red";
  const shownPct = Math.round(useCountUp(avgPct, 900));

  return (
    <Panel className="animate-rise space-y-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">{title}</p>
      <div>
        <p className="text-4xl font-semibold tracking-tight tabular-nums text-ink">{shownPct}%</p>
        <p className="mt-1 text-sm text-muted">
          {correct} of {total} correct
        </p>
      </div>
      <div className="flex justify-center">
        <Badge tone={tone}>
          {avgPct >= 80 ? "Strong" : avgPct >= 50 ? "Getting there" : "Needs review"}
        </Badge>
      </div>
      <div className="flex justify-center pt-1">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Panel>
  );
}
