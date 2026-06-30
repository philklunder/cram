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
  DeltaPage,
  GeneratedDeck,
  GradeRequest,
  GradeResult,
  Question,
  Quiz,
  Source,
  Subject,
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

async function listAll<T extends { deleted_at: string | null }>(resource: string): Promise<T[]> {
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

export interface SubjectBundle {
  subject: Subject;
  sources: Source[];
  cards: Card[];
  quizzes: Quiz[];
  questions: Question[];
}

// Everything needed to render a subject detail page, fetched in parallel and filtered to the
// subject. Questions are filtered via the subject's quiz ids.
export async function loadSubjectBundle(id: string): Promise<SubjectBundle> {
  const [subject, sources, cards, quizzes, questions] = await Promise.all([
    getSubject(id),
    listAll<Source>("sources").then(alive),
    listAll<Card>("cards").then(alive),
    listAll<Quiz>("quizzes").then(alive),
    listAll<Question>("questions").then(alive),
  ]);

  const subjectQuizzes = quizzes.filter((q) => q.subject_id === id);
  const quizIds = new Set(subjectQuizzes.map((q) => q.id));

  return {
    subject,
    sources: sources.filter((s) => s.subject_id === id),
    cards: cards.filter((c) => c.subject_id === id),
    quizzes: subjectQuizzes,
    questions: questions.filter((q) => quizIds.has(q.quiz_id)),
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
