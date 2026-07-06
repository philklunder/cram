"use client";

// Typed client for the Cram backend. Runs in the browser: it pulls the Supabase access token
// from the browser session and sends it as `Authorization: Bearer <jwt>` (the same scheme the
// iOS client uses). Cross-origin calls require the backend to allow this origin via
// CRAM_CORS_ORIGINS.

import { BACKEND_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

import type {
  Attempt,
  AttemptCreate,
  Card,
  CardSM2Update,
  DeltaPage,
  GeneratedDeck,
  GradeEntry,
  GradeEntryCreate,
  GradeRequest,
  GradeResult,
  Question,
  Quiz,
  ReviewLog,
  ReviewLogCreate,
  Source,
  StudySession,
  StudySessionCreate,
  Subject,
  SubjectUpdate,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function accessToken(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  return data.session.access_token;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Page through a delta-pull resource to get every row the user owns. The CRUD list endpoints
// are not filtered server-side, so callers filter by subject/quiz client-side. Fine at a
// single-user study app's scale.
const PAGE_LIMIT = 1000;

// Page through every row the caller owns for a delta-pull resource. Works for both syncable rows
// and append-only ones (attempts, review-logs, study-sessions) — tombstone filtering is a separate
// concern applied by `alive` only where the resource has a `deleted_at`.
async function pageAll<T>(resource: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  // Hard ceiling on iterations as a safety net against a misbehaving cursor.
  for (let i = 0; i < 1000; i++) {
    const qs = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) qs.set("since", cursor);
    const page: DeltaPage<T> = await request<DeltaPage<T>>(`/v1/${resource}?${qs.toString()}`);
    out.push(...page.items);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return out;
}

async function listAll<T extends { deleted_at: string | null }>(resource: string): Promise<T[]> {
  return pageAll<T>(resource);
}

// Drop tombstoned rows — a delta pull includes soft-deleted rows so clients can converge.
function alive<T extends { deleted_at: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted_at);
}

export async function listSubjects(): Promise<Subject[]> {
  return alive(await listAll<Subject>("subjects"));
}

export async function getSubject(id: string): Promise<Subject> {
  return request<Subject>(`/v1/subjects/${id}`);
}

// All of the caller's sources (GET /v1/sources) — the uploaded materials, used as "decks" on the
// Flashcards page.
export async function listSources(): Promise<Source[]> {
  return alive(await listAll<Source>("sources"));
}

// Create a subject (POST /v1/subjects). Used by the Grades page's "New subject" form; the id is
// server-generated when omitted.
export async function createSubject(body: {
  name: string;
  grading_scale: Subject["grading_scale"];
  exam_date?: string | null;
  target_grade?: number | null;
}): Promise<Subject> {
  return request<Subject>("/v1/subjects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Patch a subject (PATCH /v1/subjects/{id}). Used by the Grades tab to set the target grade and
// an optional manual current-grade override. Only the sent fields change.
export async function updateSubject(id: string, patch: SubjectUpdate): Promise<Subject> {
  return request<Subject>(`/v1/subjects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
}

export interface SubjectBundle {
  subject: Subject;
  sources: Source[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  // Needed to derive the subject's grade strength (which feeds SM-2 exam compression) the same
  // way iOS does — its `currentGrade` falls back to the weighted average of grade entries.
  gradeEntries: GradeEntry[];
}

// Everything needed to render a subject detail page, fetched in parallel and filtered to the
// subject. Questions are filtered via the subject's quiz ids.
export async function loadSubjectBundle(id: string): Promise<SubjectBundle> {
  const [subject, sources, cards, quizzes, questions, gradeEntries] = await Promise.all([
    getSubject(id),
    listAll<Source>("sources").then(alive),
    listAll<Card>("cards").then(alive),
    listAll<Quiz>("quizzes").then(alive),
    listAll<Question>("questions").then(alive),
    listAll<GradeEntry>("grade-entries").then(alive),
  ]);

  const subjectQuizzes = quizzes.filter((q) => q.subject_id === id);
  const quizIds = new Set(subjectQuizzes.map((q) => q.id));

  return {
    subject,
    sources: sources.filter((s) => s.subject_id === id),
    cards: cards.filter((c) => c.subject_id === id),
    quizzes: subjectQuizzes,
    questions: questions.filter((q) => quizIds.has(q.quiz_id)),
    gradeEntries: gradeEntries.filter((g) => g.subject_id === id),
  };
}

export interface GenerateParams {
  subjectName: string;
  title: string;
  files: File[];
}

// Upload material and generate a deck (POST /v1/generate, multipart). The backend persists the
// deck under the caller and returns it enriched with row ids. `kind` is inferred from the files
// (any PDF ⇒ "pdf", otherwise "photo").
export async function generateDeck({
  subjectName,
  title,
  files,
}: GenerateParams): Promise<GeneratedDeck> {
  const kind = files.some((f) => f.type === "application/pdf") ? "pdf" : "photo";
  const form = new FormData();
  form.append("subject_name", subjectName);
  form.append("title", title);
  form.append("kind", kind);
  for (const f of files) form.append("files", f);
  // Do NOT set Content-Type — the browser sets the multipart boundary.
  return request<GeneratedDeck>("/v1/generate", { method: "POST", body: form });
}

// --- Quiz-taking -------------------------------------------------------------------------

// Grade one short-answer response (POST /v1/grade — the server-side Claude call, behind the
// spend cap). Passing `question_id` makes the backend persist the result as an Attempt, so the
// caller must NOT also POST /v1/attempts for the same answer.
export async function gradeShortAnswer(body: GradeRequest): Promise<GradeResult> {
  return request<GradeResult>("/v1/grade", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Persist a locally-graded attempt (POST /v1/attempts). Used for multiple choice, which is
// graded in the browser against `answer_key` and never touches the paid grading endpoint.
export async function createAttempt(body: AttemptCreate): Promise<Attempt> {
  return request<Attempt>("/v1/attempts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- Card review (spaced repetition) -----------------------------------------------------

// Write back a card's SM-2 state after a review (PATCH /v1/cards/{id}). The new state is computed
// by the local scheduler (src/lib/srs/scheduler.ts), which is a faithful port of the iOS one.
export async function updateCard(id: string, patch: CardSM2Update): Promise<Card> {
  return request<Card>(`/v1/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
}

// Record one review (POST /v1/review-logs, append-only). Mirrors the iOS client, which logs every
// review for analytics / future SRS tuning.
export async function createReviewLog(body: ReviewLogCreate): Promise<ReviewLog> {
  return request<ReviewLog>("/v1/review-logs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- Grades ------------------------------------------------------------------------------

// Record a real-world grade for a subject (POST /v1/grade-entries). Grades feed prioritization
// and the SM-2 exam compression (the subject's strength), and surface in the Grades tab.
export async function createGradeEntry(body: GradeEntryCreate): Promise<GradeEntry> {
  return request<GradeEntry>("/v1/grade-entries", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Soft-delete a grade entry (DELETE /v1/grade-entries/{id}) — a tombstone, so the deletion also
// converges to the iOS client on its next pull rather than reappearing.
export async function deleteGradeEntry(id: string): Promise<void> {
  await request<void>(`/v1/grade-entries/${id}`, { method: "DELETE" });
}

// All of the caller's grade entries (GET /v1/grade-entries). Feeds the cross-subject Grades page.
export async function listGradeEntries(): Promise<GradeEntry[]> {
  return alive(await listAll<GradeEntry>("grade-entries"));
}

// --- Analytics reads (append-only rows) --------------------------------------------------

// All of the caller's quiz attempts (GET /v1/attempts). Feeds the dashboard's quiz-average stat.
export async function listAttempts(): Promise<Attempt[]> {
  return pageAll<Attempt>("attempts");
}

// All of the caller's review logs (GET /v1/review-logs). Feeds the study streak.
export async function listReviewLogs(): Promise<ReviewLog[]> {
  return pageAll<ReviewLog>("review-logs");
}

// --- Study sessions (duration tracking) --------------------------------------------------

// All of the caller's study sessions (GET /v1/study-sessions). Feeds the weekly-activity chart.
export async function listStudySessions(): Promise<StudySession[]> {
  return pageAll<StudySession>("study-sessions");
}

// Record a completed study block (POST /v1/study-sessions). Called by the review/quiz runners when
// a session ends, so the weekly-activity chart reflects real elapsed study time.
export async function createStudySession(body: StudySessionCreate): Promise<StudySession> {
  return request<StudySession>("/v1/study-sessions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- Library (subjects + their decks/quizzes) --------------------------------------------

export interface LibraryData {
  subjects: Subject[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
}

// The subjects/cards/quizzes/questions the Review, Quizzes, Flashcards and Progress pages browse.
// Fetched in parallel; aggregation is client-side, matching the rest of the app.
export async function loadLibrary(): Promise<LibraryData> {
  const [subjects, cards, quizzes, questions] = await Promise.all([
    listSubjects(),
    listAll<Card>("cards").then(alive),
    listAll<Quiz>("quizzes").then(alive),
    listAll<Question>("questions").then(alive),
  ]);
  return { subjects, cards, quizzes, questions };
}

// --- Dashboard ---------------------------------------------------------------------------

export interface DashboardData {
  subjects: Subject[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  attempts: Attempt[];
  reviewLogs: ReviewLog[];
  gradeEntries: GradeEntry[];
  studySessions: StudySession[];
}

// Everything the dashboard needs, fetched in parallel. Aggregation is done client-side (same
// pattern as the SRS scheduler and progress heuristics) — see lib/dashboard.ts. Quizzes +
// questions are needed only to attribute each attempt to a subject for the per-subject quiz average.
// `study-sessions` is tolerated as empty until its backend resource ships (migration 0004), so the
// dashboard renders fully before duration tracking is live.
export async function loadDashboard(): Promise<DashboardData> {
  const [subjects, cards, quizzes, questions, attempts, reviewLogs, gradeEntries, studySessions] =
    await Promise.all([
      listSubjects(),
      listAll<Card>("cards").then(alive),
      listAll<Quiz>("quizzes").then(alive),
      listAll<Question>("questions").then(alive),
      listAttempts(),
      listReviewLogs(),
      listAll<GradeEntry>("grade-entries").then(alive),
      listStudySessions().catch(() => [] as StudySession[]),
    ]);
  return { subjects, cards, quizzes, questions, attempts, reviewLogs, gradeEntries, studySessions };
}
