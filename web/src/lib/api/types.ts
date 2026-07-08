// TypeScript mirrors of the backend wire schemas (backend/app/api_schemas.py and schemas.py).
// Field names are snake_case on the wire — kept verbatim so there is one source of truth and
// no mapping layer to drift. Keep this file in sync with the Pydantic *Read models.

export type GradingScale = "german" | "swiss" | "percentage" | "letter" | "gpa";
export type SourceKind = "pdf" | "photo" | "web" | "youtube" | "audio";
export type QuestionKind = "multipleChoice" | "shortAnswer";
export type GradeKind = "exam" | "test" | "assignment" | "overall";

// Common audit/tombstone fields on every syncable row (_SyncRead).
export interface SyncRow {
  id: string;
  created_at: string; // ISO-8601
  updated_at: string;
  deleted_at: string | null;
}

export interface Subject extends SyncRow {
  name: string;
  grading_scale: GradingScale;
  target_grade: number | null;
  current_grade: number | null;
}

// An assessment within a subject; groups the cards (and quiz) studied for it. exam_date is
// optional and, when set, drives the countdown + SM-2 exam compression for that exam's cards.
export interface Exam extends SyncRow {
  subject_id: string;
  title: string;
  exam_date: string | null;
}

// POST /v1/exams body (ExamCreate). `id` is server-defaulted when omitted.
export interface ExamCreate {
  subject_id: string;
  title: string;
  exam_date?: string | null;
}

// PATCH /v1/exams/{id} body (ExamUpdate). Every field optional; only sent fields change.
export interface ExamUpdate {
  title?: string;
  exam_date?: string | null;
}

export interface Source extends SyncRow {
  subject_id: string;
  kind: SourceKind;
  title: string;
  added_at: string;
  storage_paths: string[];
}

export interface Card extends SyncRow {
  subject_id: string;
  exam_id: string | null;
  source_id: string | null;
  front: string;
  back: string;
  topic: string;
  difficulty: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_date: string;
}

export interface Quiz extends SyncRow {
  subject_id: string;
  exam_id: string | null;
  title: string;
}

export interface Question extends SyncRow {
  quiz_id: string;
  prompt: string;
  kind: QuestionKind;
  topic: string;
  options: string[];
  answer_key: string;
}

export interface GradeEntry extends SyncRow {
  subject_id: string;
  // The exam this grade records a result for, or null for a standalone grade (homework,
  // participation). A live grade pointing at an exam is what "finishes" that exam: it moves
  // out of the subject's active exam list into "Past exams".
  exam_id: string | null;
  title: string;
  kind: GradeKind;
  score: number;
  weight: number;
  date: string;
}

// POST /v1/grade-entries body (GradeEntryCreate). `id`/`date` are server-defaulted when omitted.
export interface GradeEntryCreate {
  subject_id: string;
  exam_id?: string | null; // links the grade to an exam; omit/null for a standalone grade
  title: string;
  kind: GradeKind;
  score: number;
  weight?: number; // 0..1, defaults to 1.0 server-side
  date?: string; // ISO-8601
}

// PATCH /v1/subjects/{id} body (SubjectUpdate). Every field optional; only sent fields change.
export interface SubjectUpdate {
  name?: string;
  grading_scale?: GradingScale;
  target_grade?: number | null;
  current_grade?: number | null;
}

// Delta-pull envelope returned by every GET /v1/<resource>.
export interface DeltaPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

// Append-only attempt row (AttemptRead). No updated_at/deleted_at — attempts are never edited.
export interface Attempt {
  id: string;
  created_at: string; // ISO-8601 (server-insert time)
  question_id: string;
  response: string;
  is_correct: boolean;
  score: number; // 0..1
  feedback: string;
  graded_at: string;
}

// POST /v1/attempts body (AttemptCreate). Used for locally-graded multiple choice; `id` and
// `graded_at` are server-defaulted when omitted.
export interface AttemptCreate {
  question_id: string;
  response: string;
  is_correct: boolean;
  score: number; // 0..1
  feedback?: string;
  graded_at?: string;
}

// POST /v1/grade body (GradeRequest) — short-answer grading via the server-side Claude call.
export interface GradeRequest {
  prompt: string;
  model_answer: string;
  response: string;
  topic?: string;
  // When set, the backend persists the graded result as an Attempt under this question.
  question_id?: string;
}

// POST /v1/grade response (GradeResult). `is_correct` is decided server-side from `score`.
// `attempt_id` is present only when `question_id` was sent (the attempt was persisted).
export interface GradeResult {
  score: number; // 0..1
  feedback: string;
  is_correct: boolean;
  attempt_id?: string;
}

// Append-only review-log row (ReviewLogRead). One recorded card review.
export interface ReviewLog {
  id: string;
  created_at: string;
  card_id: string;
  reviewed_at: string;
  rating: number; // SM-2 quality: 1 again / 3 hard / 4 good / 5 easy
}

// POST /v1/review-logs body (ReviewLogCreate).
export interface ReviewLogCreate {
  card_id: string;
  rating: number; // 1..5
  reviewed_at?: string;
}

export type StudyKind = "review" | "quiz" | "other";

// Append-only study-session row (StudySessionRead) — one recorded block of study time, used for
// the dashboard's weekly-activity chart. Same append-only shape as ReviewLog. `started_at` buckets
// the block by day; `duration_seconds` is the elapsed study time. Mirrors the backend
// study_sessions resource (migration 0004) so the iOS client can adopt the identical contract.
export interface StudySession {
  id: string;
  created_at: string;
  subject_id: string | null; // null = not attributed to a single subject
  started_at: string; // ISO-8601 — when the block began
  duration_seconds: number;
  kind: StudyKind;
}

// POST /v1/study-sessions body (StudySessionCreate). `id`/`started_at` are server-defaulted when
// omitted; `kind` defaults to "other".
export interface StudySessionCreate {
  subject_id?: string | null;
  started_at?: string;
  duration_seconds: number;
  kind?: StudyKind;
}

// PATCH /v1/cards/{id} body — the SM-2 write-back after a review (a subset of CardUpdate).
export interface CardSM2Update {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_date: string;
}

// --- POST /v1/generate response (GeneratedDeck enriched with persisted row ids) ----------

export interface GeneratedCard {
  front: string;
  back: string;
  topic: string;
  difficulty: number;
  id?: string;
}

export interface GeneratedQuestion {
  prompt: string;
  kind: QuestionKind;
  topic: string;
  options: string[];
  answer_key: string;
  id?: string;
}

export interface GeneratedDeck {
  source_title: string;
  cards: GeneratedCard[];
  questions: GeneratedQuestion[];
  // Present once the server has persisted the deck under the caller.
  subject_id?: string;
  exam_id?: string | null;
  source_id?: string;
  quiz_id?: string;
}
