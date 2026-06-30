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
  exam_date: string | null;
  grading_scale: GradingScale;
  target_grade: number | null;
  current_grade: number | null;
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
  title: string;
  kind: GradeKind;
  score: number;
  weight: number;
  date: string;
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
  source_id?: string;
  quiz_id?: string;
}
