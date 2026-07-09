// Deep links into the Flashcards hub, where you browse and practise a deck.
//
// The subject page uses these so its "Study" buttons land on the right cards without duplicating a
// card browser. Practice is not progress — nothing reached through these links moves your schedule
// or mastery; only a Review does (see lib/readiness.ts).
//
//   subject → a subject id, or ALL_SUBJECTS for the cross-subject view
//   exam    → an exam id, or GENERAL_SCOPE for cards not tied to an exam
//   due     → "1" pre-arms the "Due only" filter
//   start   → "1" opens practice immediately, so a "Study" button stays one click

import { GENERAL_SCOPE } from "@/lib/scope";

export const ALL_SUBJECTS = "__all__";

export function studyHref(opts: {
  subjectId?: string | null;
  examId?: string | null;
  general?: boolean;
  dueOnly?: boolean;
  start?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts.subjectId) params.set("subject", opts.subjectId);
  if (opts.general) params.set("exam", GENERAL_SCOPE);
  else if (opts.examId) params.set("exam", opts.examId);
  if (opts.dueOnly) params.set("due", "1");
  if (opts.start) params.set("start", "1");
  const qs = params.toString();
  return qs ? `/flashcards?${qs}` : "/flashcards";
}
