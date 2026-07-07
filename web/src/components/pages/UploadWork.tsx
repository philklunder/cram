"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlignLeft,
  ArrowRight,
  Check,
  FileText,
  HelpCircle,
  Layers,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/pages/shared";
import { Button, ErrorBox, cn, inputClass, labelClass } from "@/components/ui";
import { generateDeck, listSubjects, updateSubject } from "@/lib/api/client";
import type { GeneratedDeck } from "@/lib/api/types";
import { useAsync } from "@/lib/useAsync";

const ACCEPT = ".pdf,image/jpeg,image/png,image/gif,image/webp";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// AI Decks: upload material, choose a subject + exam target, and let Claude generate a study deck.
// The generation call is real (POST /v1/generate → flashcards + quiz); the "AI preview" rail shows
// the pipeline + example output format (illustrative — the backend runs one call, not a live stream).
export function UploadWork({
  demoFiles,
  demoSubject,
}: {
  demoFiles?: { name: string; size: number }[]; // dev/preview only
  demoSubject?: string; // dev/preview only
}) {
  const { data: subjects, reload } = useAsync(() => listSubjects(), []);
  const [files, setFiles] = useState<File[]>([]);
  const [subjectName, setSubjectName] = useState(demoSubject ?? "");
  const [targetGrade, setTargetGrade] = useState("");
  const [gen, setGen] = useState({ flashcards: true, quiz: true, summary: false });
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<GeneratedDeck | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayFiles = demoFiles ?? files.map((f) => ({ name: f.name, size: f.size }));
  const canGenerate = subjectName.trim() !== "" && (files.length > 0 || !!demoFiles);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    setError(null);
  }

  async function generate() {
    if (files.length === 0) { setError("Choose at least one PDF or image."); return; }
    if (subjectName.trim() === "") { setError("Name the subject this material belongs to."); return; }
    setBusy(true);
    setError(null);
    setDeck(null);
    try {
      const result = await generateDeck({ subjectName: subjectName.trim(), title: files[0].name, files });
      // Persist the target grade onto the (possibly new) subject. Exam dates live on exams now and
      // are set on the subject page — the AI Decks flow just files cards under the subject.
      if (result.subject_id && targetGrade) {
        await updateSubject(result.subject_id, {
          target_grade: Number(targetGrade.replace(",", ".")) || null,
        }).catch(() => {});
      }
      setDeck(result);
      setFiles([]);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            <Sparkles className="h-6 w-6 text-brand-500" strokeWidth={2} aria-hidden />
            AI Decks
          </span>
        }
        subtitle="Upload your materials and let Claude turn them into a study deck."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            className={cn(
              "rounded-2xl border-2 border-dashed p-8 text-center transition-colors sm:p-10",
              dragOver ? "border-brand-400 bg-brand-50/50 dark:bg-brand-500/10" : "border-line-strong bg-surface-2/30",
            )}
          >
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-brand-md">
              <UploadCloud className="h-8 w-8" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold text-ink">Upload your study materials</p>
            <p className="mt-1 text-sm text-muted">Drag &amp; drop or click to browse</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">Supports PDF and images (JPG, PNG, GIF, WebP).</p>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <Button className="mt-4" variant="secondary" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="h-4 w-4" strokeWidth={2} aria-hidden /> Choose files
            </Button>
          </div>

          {displayFiles.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">{displayFiles.length} file{displayFiles.length === 1 ? "" : "s"} ready</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {displayFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-card">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><FileText className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{f.name}</p>
                      <p className="text-xs text-muted">{formatSize(f.size)}</p>
                    </div>
                    {!demoFiles ? (
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="flex-none rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"><X className="h-4 w-4" strokeWidth={2} aria-hidden /></button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Subject + exam + target */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ad-subject" className={labelClass}>Subject</label>
                <input id="ad-subject" list="ad-subjects" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. ABU" autoComplete="off" className={inputClass} />
                <datalist id="ad-subjects">{(subjects ?? []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
              </div>
              <div>
                <label htmlFor="ad-target" className={labelClass}>Target grade <span className="font-normal text-muted">(optional)</span></label>
                <input id="ad-target" inputMode="decimal" value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)} placeholder="e.g. 5.5" className={inputClass} />
              </div>
            </div>

            <p className="mb-2 mt-5 text-sm font-medium text-ink-2">What should Claude generate?</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Toggle icon={Layers} label="Flashcards" hint="Key concepts" on={gen.flashcards} onClick={() => setGen((g) => ({ ...g, flashcards: !g.flashcards }))} />
              <Toggle icon={HelpCircle} label="Quiz questions" hint="Test yourself" on={gen.quiz} onClick={() => setGen((g) => ({ ...g, quiz: !g.quiz }))} />
              <Toggle icon={AlignLeft} label="Summary" hint="Soon" on={gen.summary} disabled onClick={() => {}} />
            </div>

            {error ? <div className="mt-4"><ErrorBox message={error} /></div> : null}

            <Button className="mt-5 w-full" onClick={generate} loading={busy} disabled={!canGenerate}>
              {busy ? "Generating… this can take a moment" : "Generate study deck"}
              {!busy ? <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : null}
            </Button>
            <p className="mt-2 text-center text-xs text-muted">Claude adapts the content to how you&rsquo;re doing.</p>
          </div>

          {deck ? (
            <div className="rounded-2xl border border-green-200 bg-green-50/70 p-5 dark:border-green-500/30 dark:bg-green-500/10">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-green-500 text-white"><Check className="h-4 w-4" strokeWidth={3} aria-hidden /></span>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">Generated {deck.cards.length} cards and {deck.questions.length} questions from “{deck.source_title}”. Saved to your account.</p>
              </div>
              <Link href="/flashcards" className="mt-3 inline-block"><Button size="sm" variant="secondary">Open deck <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /></Button></Link>
            </div>
          ) : null}
        </div>

        {/* AI preview rail */}
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight text-ink">AI preview</h2>
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", busy ? "text-brand-600 dark:text-brand-300" : "text-muted")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", busy ? "animate-pulse bg-brand-500" : "bg-line-strong")} />
                {busy ? "Live" : deck ? "Done" : "Example"}
              </span>
            </div>
            <p className="mb-5 text-xs text-muted">
              {busy ? "Claude is analyzing your materials…" : deck ? "Your study deck is ready." : "How Claude turns your files into a deck."}
            </p>
            <Pipeline busy={busy} done={!!deck} />
          </div>

          <PreviewCard icon={Layers} title="Flashcards" tag="example">
            <p className="text-sm font-medium text-ink">What is the difference between perfect competition and monopoly?</p>
            <p className="mt-1.5 text-sm text-ink-2">Perfect competition has many firms selling identical products; a monopoly has a single seller of a unique product.</p>
          </PreviewCard>

          <PreviewCard icon={HelpCircle} title="Quiz question" tag="example">
            <p className="text-sm font-medium text-ink">In the long run, economic profits in perfect competition are…</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              {["Always positive", "Zero", "Negative", "Equal to revenue"].map((o, i) => (
                <li key={o} className={cn("rounded-md px-2 py-1", i === 1 ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "")}>{"ABCD"[i]}. {o}</li>
              ))}
            </ul>
          </PreviewCard>

          <PreviewCard icon={AlignLeft} title="Summary" tag="soon">
            <p className="text-sm text-muted">A concise overview of each topic — coming soon.</p>
          </PreviewCard>
        </aside>
      </div>
    </section>
  );
}

function Toggle({ icon: Icon, label, hint, on, disabled, onClick }: { icon: typeof Layers; label: string; hint: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition", on ? "border-brand-300 bg-brand-50/50 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-line bg-surface", disabled && "opacity-70")}>
      <span className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-lg", on ? "bg-brand-500 text-white" : "bg-surface-2 text-muted")}><Icon className="h-4 w-4" strokeWidth={2} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{label}</p>
        <p className="truncate text-xs text-muted">{hint}</p>
      </div>
      <span className={cn("relative h-5 w-9 flex-none rounded-full transition-colors", on ? "bg-brand-500" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

const STEPS = ["Ingest", "Extract", "Generate", "Review"] as const;
function Pipeline({ busy, done }: { busy: boolean; done: boolean }) {
  // Horizontal stepper. Illustrative: an "example" run paused at Generate when idle, the live run
  // while busy (Generate pulses), all four complete when done. The connector into each reached node
  // fills brand so progress reads left-to-right.
  const active = done ? 4 : 2;
  return (
    <ol className="flex items-start">
      {STEPS.map((s, i) => {
        const state = i < active ? "done" : i === active ? "active" : "idle";
        const reached = i <= active;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn("absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 rounded-full transition-colors", reached ? "bg-brand-400 dark:bg-brand-500/60" : "bg-line")}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold transition-colors",
                state === "done"
                  ? "bg-green-500 text-white"
                  : state === "active"
                    ? cn("bg-brand-500 text-white ring-4 ring-brand-500/15", busy && "animate-pulse")
                    : "bg-surface-2 text-muted ring-1 ring-inset ring-line",
              )}
            >
              {state === "done" ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn("mt-2 text-center text-xs", state === "idle" ? "text-muted" : "font-medium text-ink")}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PreviewCard({ icon: Icon, title, tag, children }: { icon: typeof Layers; title: string; tag: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-500" strokeWidth={2} aria-hidden />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{tag}</span>
      </div>
      <div className="rounded-xl bg-surface-2/50 p-3">{children}</div>
    </div>
  );
}
