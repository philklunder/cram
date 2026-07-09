"use client";

// Typed client for the Cram backend. Runs in the browser: it pulls the Supabase access token
// from the browser session and sends it as `Authorization: Bearer <jwt>` (the same scheme the
// iOS client uses). Cross-origin calls require the backend to allow this origin via
// CRAM_CORS_ORIGINS.

import { BACKEND_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

import { cached, invalidate } from "./cache";

import type {
  Attempt,
  AttemptCreate,
  Card,
  CardSM2Update,
  Exam,
  ExamCreate,
  ExamUpdate,
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

// --- the snapshot ------------------------------------------------------------------------
//
// Every read below is served from one request: `GET /v1/dashboard` returns all of the caller's
// live rows in a single owner-scoped payload. Previously each loader paged each resource's
// delta endpoint separately, so a dashboard render cost ten requests and a Dashboard → Review →
// Progress walk cost thirty. The per-resource delta endpoints still exist — they are the sync
// contract the iOS client depends on — but the web app no longer uses them for reading.
//
// The snapshot is cached under one key (see ./cache), so concurrent loaders on the same page
// share one in-flight request and a navigation within the TTL costs nothing.

const SNAPSHOT_KEY = "dashboard";

// Wire shape of GET /v1/dashboard. Rows are identical to the delta endpoints' rows; only the
// envelope keys differ (snake_case, one list per resource). Tombstones are excluded server-side.
interface SnapshotPayload {
  subjects: Subject[];
  exams: Exam[];
  sources: Source[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  grade_entries: GradeEntry[];
  attempts: Attempt[];
  review_logs: ReviewLog[];
  study_sessions: StudySession[];
}

export interface Snapshot {
  subjects: Subject[];
  exams: Exam[];
  sources: Source[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  gradeEntries: GradeEntry[];
  attempts: Attempt[];
  reviewLogs: ReviewLog[];
  studySessions: StudySession[];
}

async function fetchSnapshot(): Promise<Snapshot> {
  const p = await request<SnapshotPayload>("/v1/dashboard");
  return {
    subjects: p.subjects,
    exams: p.exams,
    sources: p.sources,
    cards: p.cards,
    quizzes: p.quizzes,
    questions: p.questions,
    gradeEntries: p.grade_entries,
    attempts: p.attempts,
    reviewLogs: p.review_logs,
    studySessions: p.study_sessions,
  };
}

function snapshot(): Promise<Snapshot> {
  return cached(SNAPSHOT_KEY, fetchSnapshot);
}

// Every caller gets its own array, so a page that sorts or splices in place can't corrupt the
// cached snapshot the other pages are reading.
async function from<K extends keyof Snapshot>(key: K): Promise<Snapshot[K]> {
  const snap = await snapshot();
  return [...snap[key]] as Snapshot[K];
}

// Any write can change the snapshot, so it is dropped wholesale rather than per resource.
function invalidateSnapshot(): void {
  invalidate(SNAPSHOT_KEY);
}

export async function listSubjects(): Promise<Subject[]> {
  return from("subjects");
}

export async function getSubject(id: string): Promise<Subject> {
  const subject = (await snapshot()).subjects.find((s) => s.id === id);
  // Matches the old GET /v1/subjects/{id} behaviour: a tombstoned or foreign id reads as absent.
  if (!subject) throw new ApiError(404, "subject not found");
  return subject;
}

// The uploaded materials, used as "decks" on the Flashcards page.
export async function listSources(): Promise<Source[]> {
  return from("sources");
}

// Create a subject (POST /v1/subjects). Used by the Grades page's "New subject" form; the id is
// server-generated when omitted.
export async function createSubject(body: {
  name: string;
  grading_scale: Subject["grading_scale"];
  target_grade?: number | null;
}): Promise<Subject> {
  const created = await request<Subject>("/v1/subjects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return created;
}

// Patch a subject (PATCH /v1/subjects/{id}). Used by the Grades tab to set the target grade and
// an optional manual current-grade override. Only the sent fields change.
export async function updateSubject(id: string, patch: SubjectUpdate): Promise<Subject> {
  const updated = await request<Subject>(`/v1/subjects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return updated;
}

// Delete a subject (DELETE /v1/subjects/{id}). The backend tombstones the row and cascades to its
// exams, sources, cards, quizzes, questions and grade entries; the snapshot excludes tombstones,
// so all of them stop appearing once it is refetched.
export async function deleteSubject(id: string): Promise<void> {
  await request<void>(`/v1/subjects/${id}`, { method: "DELETE" });
  invalidateSnapshot();
}

// --- exams (a subject's assessments) -----------------------------------------------------

export async function listExams(): Promise<Exam[]> {
  return from("exams");
}

// Create an exam under a subject (POST /v1/exams).
export async function createExam(body: ExamCreate): Promise<Exam> {
  const created = await request<Exam>("/v1/exams", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return created;
}

// Patch an exam (PATCH /v1/exams/{id}). Only the sent fields change.
export async function updateExam(id: string, patch: ExamUpdate): Promise<Exam> {
  const updated = await request<Exam>(`/v1/exams/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return updated;
}

// Delete an exam (DELETE /v1/exams/{id}). Tombstoned server-side; its cards/quizzes survive and
// fall back to the subject's "General" bucket (their exam_id keeps pointing at the gone exam).
export async function deleteExam(id: string): Promise<void> {
  await request<void>(`/v1/exams/${id}`, { method: "DELETE" });
  invalidateSnapshot();
}

export interface SubjectBundle {
  subject: Subject;
  exams: Exam[];
  sources: Source[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  // Needed to derive the subject's grade strength (which feeds SM-2 exam compression) the same
  // way iOS does — its `currentGrade` falls back to the weighted average of grade entries.
  gradeEntries: GradeEntry[];
}

// Everything needed to render a subject detail page, sliced out of the snapshot. Questions are
// filtered via the subject's quiz ids.
export async function loadSubjectBundle(id: string): Promise<SubjectBundle> {
  const { subjects, exams, sources, cards, quizzes, questions, gradeEntries } = await snapshot();

  const subject = subjects.find((s) => s.id === id);
  if (!subject) throw new ApiError(404, "subject not found");

  const subjectQuizzes = quizzes.filter((q) => q.subject_id === id);
  const quizIds = new Set(subjectQuizzes.map((q) => q.id));

  return {
    subject,
    exams: exams.filter((e) => e.subject_id === id),
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
  // When set, the generated cards + quiz are filed under this exam; otherwise "General".
  examId?: string | null;
}

// Upload material and generate a deck (POST /v1/generate, multipart). The backend persists the
// deck under the caller and returns it enriched with row ids. `kind` is inferred from the files
// (any PDF ⇒ "pdf", otherwise "photo").
export async function generateDeck({
  subjectName,
  title,
  files,
  examId,
}: GenerateParams): Promise<GeneratedDeck> {
  const kind = files.some((f) => f.type === "application/pdf") ? "pdf" : "photo";
  const form = new FormData();
  form.append("subject_name", subjectName);
  form.append("title", title);
  form.append("kind", kind);
  if (examId) form.append("exam_id", examId);
  for (const f of files) form.append("files", f);
  // Do NOT set Content-Type — the browser sets the multipart boundary.
  const deck = await request<GeneratedDeck>("/v1/generate", { method: "POST", body: form });
  // One generate writes across subjects (find-or-create), sources, cards, quizzes and questions.
  invalidateSnapshot();
  return deck;
}

// --- Quiz-taking -------------------------------------------------------------------------

// Grade one short-answer response (POST /v1/grade — the server-side Claude call, behind the
// spend cap). Passing `question_id` makes the backend persist the result as an Attempt, so the
// caller must NOT also POST /v1/attempts for the same answer.
export async function gradeShortAnswer(body: GradeRequest): Promise<GradeResult> {
  const result = await request<GradeResult>("/v1/grade", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  // With a question_id the backend persists an Attempt; without one nothing is written, but
  // invalidating an already-absent key is a no-op so this stays unconditional.
  invalidateSnapshot();
  return result;
}

// Persist a locally-graded attempt (POST /v1/attempts). Used for multiple choice, which is
// graded in the browser against `answer_key` and never touches the paid grading endpoint.
export async function createAttempt(body: AttemptCreate): Promise<Attempt> {
  const created = await request<Attempt>("/v1/attempts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return created;
}

// --- Card review (spaced repetition) -----------------------------------------------------

// Write back a card's SM-2 state after a review (PATCH /v1/cards/{id}). The new state is computed
// by the local scheduler (src/lib/srs/scheduler.ts), which is a faithful port of the iOS one.
export async function updateCard(id: string, patch: CardSM2Update): Promise<Card> {
  const updated = await request<Card>(`/v1/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return updated;
}

// Record one review (POST /v1/review-logs, append-only). Mirrors the iOS client, which logs every
// review for analytics / future SRS tuning.
export async function createReviewLog(body: ReviewLogCreate): Promise<ReviewLog> {
  const created = await request<ReviewLog>("/v1/review-logs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return created;
}

// --- Grades ------------------------------------------------------------------------------

// Record a real-world grade for a subject (POST /v1/grade-entries). Grades feed prioritization
// and the SM-2 exam compression (the subject's strength), and surface in the Grades tab.
export async function createGradeEntry(body: GradeEntryCreate): Promise<GradeEntry> {
  const created = await request<GradeEntry>("/v1/grade-entries", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return created;
}

// Soft-delete a grade entry (DELETE /v1/grade-entries/{id}) — a tombstone, so the deletion also
// converges to the iOS client on its next pull rather than reappearing.
export async function deleteGradeEntry(id: string): Promise<void> {
  await request<void>(`/v1/grade-entries/${id}`, { method: "DELETE" });
  invalidateSnapshot();
}

// All of the caller's grade entries. Feeds the cross-subject Grades page.
export async function listGradeEntries(): Promise<GradeEntry[]> {
  return from("gradeEntries");
}

// --- Analytics reads (append-only rows) --------------------------------------------------

// All of the caller's quiz attempts. Feeds the dashboard's quiz-average stat.
export async function listAttempts(): Promise<Attempt[]> {
  return from("attempts");
}

// All of the caller's review logs. Feeds the study streak.
export async function listReviewLogs(): Promise<ReviewLog[]> {
  return from("reviewLogs");
}

// --- Study sessions (duration tracking) --------------------------------------------------

// All of the caller's study sessions. Feeds the weekly-activity chart.
export async function listStudySessions(): Promise<StudySession[]> {
  return from("studySessions");
}

// Record a completed study block (POST /v1/study-sessions). Called by the review/quiz runners when
// a session ends, so the weekly-activity chart reflects real elapsed study time.
export async function createStudySession(body: StudySessionCreate): Promise<StudySession> {
  const created = await request<StudySession>("/v1/study-sessions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  invalidateSnapshot();
  return created;
}

// --- Library (subjects + their decks/quizzes) --------------------------------------------

export interface LibraryData {
  subjects: Subject[];
  exams: Exam[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
}

// The subjects/exams/cards/quizzes/questions the Review, Quizzes, Flashcards and Progress pages
// browse. Exams let those pages scope study to a single assessment. Sliced from the snapshot;
// aggregation is client-side, matching the rest of the app.
export async function loadLibrary(): Promise<LibraryData> {
  const { subjects, exams, cards, quizzes, questions } = await snapshot();
  return {
    subjects: [...subjects],
    exams: [...exams],
    cards: [...cards],
    quizzes: [...quizzes],
    questions: [...questions],
  };
}

// --- Dashboard ---------------------------------------------------------------------------

export interface DashboardData {
  subjects: Subject[];
  exams: Exam[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
  attempts: Attempt[];
  reviewLogs: ReviewLog[];
  gradeEntries: GradeEntry[];
  studySessions: StudySession[];
}

// Everything the dashboard needs, in one request. Aggregation is done client-side (same pattern as
// the SRS scheduler and progress heuristics) — see lib/dashboard.ts. Quizzes + questions are needed
// only to attribute each attempt to a subject for the per-subject quiz average.
export async function loadDashboard(): Promise<DashboardData> {
  const snap = await snapshot();
  return {
    subjects: [...snap.subjects],
    exams: [...snap.exams],
    cards: [...snap.cards],
    quizzes: [...snap.quizzes],
    questions: [...snap.questions],
    attempts: [...snap.attempts],
    reviewLogs: [...snap.reviewLogs],
    gradeEntries: [...snap.gradeEntries],
    studySessions: [...snap.studySessions],
  };
}
