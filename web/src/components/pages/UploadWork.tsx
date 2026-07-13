"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

import { InteractiveClaudeMascot, type MascotMood } from "@/components/ClaudeMascot";
import { PageHeader, SelectChevron } from "@/components/pages/shared";
import { Button, ErrorBox, cn, inputClass, labelClass, selectClass } from "@/components/ui";
import { generateDeck, listExams, listSubjects, updateSubject } from "@/lib/api/client";
import type { GeneratedDeck } from "@/lib/api/types";
import { examsForSubject } from "@/lib/scope";
import { useAsync } from "@/lib/useAsync";

const ACCEPT = ".pdf,image/jpeg,image/png,image/gif,image/webp";
const NEW_SUBJECT = "__new__";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// AI Decks: upload material, choose a subject + exam target, and let Claude generate a study deck.
// The subject page's "Add material" buttons deep-link here with ?subject=<name>&exam=<id> so the
// right subject/exam are pre-selected. The generation call is real (POST /v1/generate → flashcards
// + quiz); the "AI preview" rail shows the pipeline + example output (illustrative — the backend
// runs one call, not a live stream).
export function UploadWork({
  demoFiles,
  demoSubject,
}: {
  demoFiles?: { name: string; size: number }[]; // dev/preview only
  demoSubject?: string; // dev/preview only
}) {
  const { data, reload } = useAsync(() => Promise.all([listSubjects(), listExams()]), []);
  const subjects = data?.[0] ?? [];
  const exams = data?.[1] ?? [];

  const [files, setFiles] = useState<File[]>([]);
  // subjectSel is a subject id, or NEW_SUBJECT for a brand-new subject, or "" before a choice.
  const [subjectSel, setSubjectSel] = useState<string>(demoSubject ? NEW_SUBJECT : "");
  const [newName, setNewName] = useState(demoSubject ?? "");
  const [examId, setExamId] = useState<string>(""); // "" = General (no exam)
  const [targetGrade, setTargetGrade] = useState("");
  const [gen, setGen] = useState({ flashcards: true, quiz: true, summary: false });
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<GeneratedDeck | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The mascot celebrates or commiserates, then goes back to watching the cursor. It's a
  // reaction, not a status light -- the panels below already say what happened, and a
  // permanently grinning (or permanently sad) mascot stops meaning anything.
  const [reaction, setReaction] = useState<Exclude<MascotMood, "reading" | null> | null>(null);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); }, []);

  function react(next: "done" | "error") {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setReaction(next);
    reactionTimer.current = setTimeout(() => setReaction(null), next === "done" ? 3600 : 4200);
  }

  const mascotMood: MascotMood = busy ? "reading" : reaction;

  // Deep-link pre-fill: ?subject=<name>&exam=<examId>. Runs once, after subjects have loaded, so a
  // name can be matched to an existing subject (else it seeds a new-subject entry).
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || subjects.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const wantSubject = params.get("subject");
    const wantExam = params.get("exam");
    if (!wantSubject) {
      prefilled.current = true;
      return;
    }
    prefilled.current = true;
    const match = subjects.find((s) => s.name.toLowerCase() === wantSubject.toLowerCase());
    if (match) {
      setSubjectSel(match.id);
      if (wantExam && exams.some((e) => e.id === wantExam && e.subject_id === match.id)) {
        setExamId(wantExam);
      }
    } else {
      setSubjectSel(NEW_SUBJECT);
      setNewName(wantSubject);
    }
  }, [subjects, exams]);

  const isNew = subjectSel === NEW_SUBJECT;
  const selectedSubject = subjects.find((s) => s.id === subjectSel);
  const subjectExams = useMemo(
    () => (selectedSubject ? examsForSubject(exams, selectedSubject.id) : []),
    [exams, selectedSubject],
  );
  const subjectName = (isNew ? newName : selectedSubject?.name ?? "").trim();
  const examToSend = !isNew && examId ? examId : null;

  const displayFiles = demoFiles ?? files.map((f) => ({ name: f.name, size: f.size }));
  const canGenerate = subjectName !== "" && (files.length > 0 || !!demoFiles);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    setError(null);
  }

  async function generate() {
    if (files.length === 0) { setError("Choose at least one PDF or image."); react("error"); return; }
    if (subjectName === "") { setError("Pick a subject (or name a new one) for this material."); react("error"); return; }
    setBusy(true);
    setError(null);
    setDeck(null);
    try {
      const result = await generateDeck({ subjectName, title: files[0].name, files, examId: examToSend });
      // Persist the target grade onto the (possibly new) subject. Exam dates live on exams and are
      // set on the subject page — the AI Decks flow just files cards under the subject + chosen exam.
      if (result.subject_id && targetGrade) {
        await updateSubject(result.subject_id, {
          target_grade: Number(targetGrade.replace(",", ".")) || null,
        }).catch(() => {});
      }
      setDeck(result);
      setFiles([]);
      reload();
      react("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      react("error");
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
        subtitle="Upload your materials, choose the subject and exam they belong to, and let Claude turn them into a study deck."
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
                <div className="relative mt-1.5">
                  <select
                    id="ad-subject"
                    value={subjectSel}
                    onChange={(e) => { setSubjectSel(e.target.value); setExamId(""); }}
                    className={cn(selectClass, "mt-0")}
                  >
                    <option value="" disabled>Select a subject…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value={NEW_SUBJECT}>+ New subject…</option>
                  </select>
                  <SelectChevron />
                </div>
                {isNew ? (
                  <input
                    aria-label="New subject name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Name the new subject — e.g. Biology 101"
                    autoComplete="off"
                    className={inputClass}
                  />
                ) : null}
              </div>

              {!isNew && selectedSubject && subjectExams.length > 0 ? (
                <div>
                  <label htmlFor="ad-exam" className={labelClass}>Exam</label>
                  <div className="relative mt-1.5">
                    <select
                      id="ad-exam"
                      value={examId}
                      onChange={(e) => setExamId(e.target.value)}
                      className={cn(selectClass, "mt-0")}
                    >
                      <option value="">General (no exam)</option>
                      {subjectExams.map((e) => (
                        <option key={e.id} value={e.id}>{e.title}</option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="ad-target" className={labelClass}>Target grade <span className="font-normal text-muted">(optional)</span></label>
                  <input id="ad-target" inputMode="decimal" value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)} placeholder="e.g. 5.5" className={inputClass} />
                </div>
              )}
            </div>

            {/* When the exam picker took the second column, target grade moves to its own row. */}
            {!isNew && selectedSubject && subjectExams.length > 0 ? (
              <div className="mt-4 sm:max-w-[calc(50%-0.5rem)]">
                <label htmlFor="ad-target-2" className={labelClass}>Target grade <span className="font-normal text-muted">(optional)</span></label>
                <input id="ad-target-2" inputMode="decimal" value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)} placeholder="e.g. 5.5" className={inputClass} />
              </div>
            ) : null}

            {!isNew && selectedSubject && subjectExams.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                No exams in {selectedSubject.name} yet — this deck files under “General”. Create exams on the subject page to target one.
              </p>
            ) : null}

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
              <div className="mt-3 flex flex-wrap gap-2">
                {deck.subject_id ? (
                  <Link href={`/subjects/${deck.subject_id}`}><Button size="sm" variant="secondary">Open subject <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /></Button></Link>
                ) : null}
                <Link href="/flashcards"><Button size="sm" variant="secondary">Browse flashcards</Button></Link>
              </div>
            </div>
          ) : null}
        </div>

        {/* "How it works" rail */}
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight text-ink">How it works</h2>
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", busy ? "text-brand-600 dark:text-brand-300" : "text-muted")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", busy ? "animate-pulse bg-brand-500" : "bg-line-strong")} />
                {busy ? "Live" : deck ? "Done" : "Example"}
              </span>
            </div>

            {/* Mascot + one-line description, then the four stages. The mascot reacts to the run:
                watches your cursor while idle, reads while Claude works, reacts on finish.
                `flex-none` is load-bearing — without it the flex row shrinks the mascot's box while
                its inner sprite keeps full height, squashing him horizontally. */}
            <div className="mb-4 flex items-center gap-1">
              <InteractiveClaudeMascot className="flex-none" size={76} mood={mascotMood} trim />
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
                {busy
                  ? "Claude is reading your material…"
                  : deck
                    ? "Your study deck is ready — review it below."
                    : "Claude reads every page, pulls out the concepts worth testing, and writes the cards."}
              </p>
            </div>

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

const STEPS = ["Read", "Extract", "Write", "You approve"] as const;
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
