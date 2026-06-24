"use client";

import { useState } from "react";

import { Badge, Button, ErrorBox, difficultyTone, inputClass, labelClass } from "@/components/ui";
import { generateDeck } from "@/lib/api/client";
import type { GeneratedDeck } from "@/lib/api/types";

const ACCEPT = ".pdf,image/jpeg,image/png,image/gif,image/webp";

// Upload material (PDF or photos) and call POST /v1/generate. On success the server has already
// persisted the deck under the user; we show it and let the parent refresh the subject.
export function GenerateMaterialForm({
  subjectName,
  onGenerated,
}: {
  subjectName: string;
  onGenerated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<GeneratedDeck | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one PDF or image.");
      return;
    }
    setBusy(true);
    setError(null);
    setDeck(null);
    try {
      const result = await generateDeck({ subjectName, title: title || files[0].name, files });
      setDeck(result);
      setTitle("");
      setFiles([]);
      onGenerated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Add material</h3>
        <p className="mt-0.5 text-sm text-gray-500">
          Upload a PDF or photos — Cram generates flashcards and a quiz from them.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className={labelClass}>
            Title <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 — Photosynthesis"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="files" className={labelClass}>
            Material
          </label>
          <input
            id="files"
            type="file"
            accept={ACCEPT}
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="mt-1.5 block w-full cursor-pointer rounded-lg border border-gray-300 text-sm text-gray-600 transition file:mr-4 file:cursor-pointer file:border-0 file:border-r file:border-gray-200 file:bg-gray-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            PDF or images (JPEG, PNG, GIF, WebP).
            {files.length > 0 ? (
              <span className="font-medium text-gray-600">
                {" "}
                {files.length} selected.
              </span>
            ) : null}
          </p>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Generating… this can take a moment" : "Generate deck"}
        </Button>
      </form>

      {deck ? (
        <div className="space-y-4 rounded-xl border border-green-200 bg-green-50/70 p-4">
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-5 w-5 flex-none text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm font-medium text-green-800">
              Generated {deck.cards.length} {deck.cards.length === 1 ? "card" : "cards"} and{" "}
              {deck.questions.length} {deck.questions.length === 1 ? "question" : "questions"} from
              “{deck.source_title}”. Saved to your account.
            </p>
          </div>

          {deck.cards.length > 0 ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">Preview</h4>
              <ul className="space-y-2">
                {deck.cards.slice(0, 5).map((c, i) => (
                  <li key={c.id ?? i} className="rounded-lg border border-green-200 bg-white p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-gray-900">{c.front}</span>
                      <Badge tone={difficultyTone(c.difficulty)}>D{c.difficulty}</Badge>
                    </div>
                    <p className="mt-1 text-gray-600">{c.back}</p>
                    <p className="mt-1 text-xs text-gray-400">{c.topic}</p>
                  </li>
                ))}
              </ul>
              {deck.cards.length > 5 ? (
                <p className="mt-2 text-xs text-green-700">
                  + {deck.cards.length - 5} more — refresh the Cards tab to see all.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
