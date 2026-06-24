"use client";

import Link from "next/link";
import { useState } from "react";

import { GenerateMaterialForm } from "@/components/GenerateMaterialForm";
import { ProgressPanel } from "@/components/ProgressPanel";
import {
  Badge,
  EmptyState,
  ErrorBox,
  PageLoader,
  Panel,
  cn,
  difficultyTone,
} from "@/components/ui";
import { loadSubjectBundle, type SubjectBundle } from "@/lib/api/client";
import type { Card, Question, Source } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

type Tab = "progress" | "cards" | "quizzes" | "sources" | "add";

export function SubjectDetail({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("progress");
  const { loading, error, data, reload } = useAsync<SubjectBundle>(() => loadSubjectBundle(id), [id]);

  if (loading) return <PageLoader label="Loading subject…" />;
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox message={error} />
      </div>
    );
  }
  if (!data) return null;

  const { subject, sources, cards, quizzes, questions } = data;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "progress", label: "Progress" },
    { id: "cards", label: "Cards", count: cards.length },
    { id: "quizzes", label: "Quizzes", count: quizzes.length },
    { id: "sources", label: "Sources", count: sources.length },
    { id: "add", label: "Add material" },
  ];

  return (
    <section className="animate-rise space-y-6">
      <div>
        <BackLink />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">{subject.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {cards.length} {cards.length === 1 ? "card" : "cards"} · {quizzes.length}{" "}
          {quizzes.length === 1 ? "quiz" : "quizzes"} · {sources.length}{" "}
          {sources.length === 1 ? "source" : "sources"}
        </p>
      </div>

      <div role="tablist" aria-label="Subject sections" className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-800",
              )}
            >
              {t.label}
              {t.count != null ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    active ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "progress" ? <ProgressPanel subject={subject} cards={cards} /> : null}
        {tab === "cards" ? <CardsTab cards={cards} /> : null}
        {tab === "quizzes" ? <QuizzesTab quizzes={quizzes} questions={questions} /> : null}
        {tab === "sources" ? <SourcesTab sources={sources} /> : null}
        {tab === "add" ? (
          <Panel>
            <GenerateMaterialForm subjectName={subject.name} onGenerated={reload} />
          </Panel>
        ) : null}
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/subjects"
      className="inline-flex items-center gap-1 rounded text-sm font-medium text-gray-500 transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      All subjects
    </Link>
  );
}

function CardsTab({ cards }: { cards: Card[] }) {
  if (cards.length === 0) {
    return <EmptyState title="No cards yet" hint="Use “Add material” to generate a deck." />;
  }
  return (
    <ul className="grid gap-3">
      {cards.map((c) => (
        <li key={c.id}>
          <Panel>
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-gray-900">{c.front}</span>
              <Badge tone={difficultyTone(c.difficulty)}>D{c.difficulty}</Badge>
            </div>
            <p className="mt-1 text-sm text-gray-600">{c.back}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
              <Badge tone="neutral">{c.topic}</Badge>
              <span>reps {c.repetitions}</span>
              <span aria-hidden>·</span>
              <span>lapses {c.lapses}</span>
              <span aria-hidden>·</span>
              <span>due {formatDate(c.due_date)}</span>
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
}

function QuizzesTab({ quizzes, questions }: { quizzes: { id: string; title: string }[]; questions: Question[] }) {
  if (quizzes.length === 0) {
    return <EmptyState title="No quizzes yet" hint="Generating material also creates a quiz." />;
  }
  return (
    <div className="space-y-5">
      {quizzes.map((quiz) => {
        const qs = questions.filter((q) => q.quiz_id === quiz.id);
        return (
          <Panel key={quiz.id}>
            <h3 className="text-base font-semibold text-gray-900">{quiz.title}</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {qs.length} {qs.length === 1 ? "question" : "questions"}
            </p>
            <ul className="mt-3 space-y-3">
              {qs.map((q) => (
                <li key={q.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-gray-900">{q.prompt}</span>
                    <Badge tone="brand">
                      {q.kind === "multipleChoice" ? "Multiple choice" : "Short answer"}
                    </Badge>
                  </div>
                  {q.options.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-gray-600">
                      {q.options.map((opt, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-center gap-2",
                            opt === q.answer_key && "font-medium text-green-700",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "h-1.5 w-1.5 flex-none rounded-full",
                              opt === q.answer_key ? "bg-green-500" : "bg-gray-300",
                            )}
                          />
                          {opt}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      Model answer: <span className="text-gray-700">{q.answer_key}</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">{q.topic}</p>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function SourcesTab({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return <EmptyState title="No sources yet" hint="Uploaded material appears here." />;
  }
  return (
    <ul className="grid gap-3">
      {sources.map((s) => (
        <li key={s.id}>
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-gray-900">{s.title}</span>
              <Badge tone="neutral">{s.kind}</Badge>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Added {formatDate(s.added_at)}
              {s.storage_paths.length > 0
                ? ` · ${s.storage_paths.length} ${s.storage_paths.length === 1 ? "file" : "files"}`
                : ""}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
