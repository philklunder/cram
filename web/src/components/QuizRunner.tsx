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
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{title}</p>
          <p className="mt-0.5 text-sm text-gray-500" aria-live="polite">
            Question {idx + 1} of {questions.length}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Exit
        </Button>
      </div>

      {/* Progress bar — fills as questions are completed (graded). */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-500 ease-out"
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
              className="text-base font-semibold text-gray-900 focus:outline-none"
            >
              {q.prompt}
            </h3>
            <Badge tone="brand">{isMC ? "Multiple choice" : "Short answer"}</Badge>
          </div>
          <p className="text-xs text-gray-500">{q.topic}</p>
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
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
                  result == null && selected
                    ? "border-brand-500 bg-brand-50/60 text-gray-900"
                    : "border-gray-200 text-gray-700 hover:border-gray-300",
                  isAnswer && "border-green-500 bg-green-50 text-green-800",
                  isWrongPick && "border-red-400 bg-red-50 text-red-800",
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
            className={cn(inputClass, "resize-y disabled:bg-gray-50 disabled:text-gray-500")}
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
        "animate-rise space-y-2 rounded-lg border px-4 py-3 text-sm",
        result.is_correct ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50",
      )}
    >
      <div className="flex items-center gap-2">
        <Badge tone={result.is_correct ? "green" : "amber"}>
          {result.is_correct ? "Correct" : "Not quite"}
        </Badge>
        {answerKey != null ? (
          <span className="text-xs text-gray-500">Scored {pct}%</span>
        ) : null}
      </div>
      {result.feedback ? <p className="text-gray-700">{result.feedback}</p> : null}
      {answerKey != null ? (
        <p className="text-gray-600">
          <span className="font-medium text-gray-700">Model answer:</span> {answerKey}
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

  return (
    <Panel className="animate-rise space-y-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{title}</p>
      <div>
        <p className="text-4xl font-semibold tracking-tight text-gray-900">{avgPct}%</p>
        <p className="mt-1 text-sm text-gray-500">
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
