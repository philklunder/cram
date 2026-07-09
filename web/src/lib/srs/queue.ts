// Session queue construction, shared by the Flashcards hub (which owns *what* is in a session via
// its filters) and the study runner (which just plays the queue it's handed).
//
// Filtering is deliberately NOT done here: the hub's Subject / Exam / Deck / Due-only filters
// already decide the card set, and silently re-filtering to "due cards only" inside the runner is
// how a "Cram 47" button ends up serving 12 cards. Ordering and the session cap come from the
// user's device-local Review settings.

import type { Card } from "@/lib/api/types";
import type { ReviewOrder } from "@/lib/reviewSettings";

// Fisher–Yates shuffle (a fresh copy; never mutates the input).
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The cards a session will actually serve, in the order it will serve them.
//   order "due"     → most-overdue first (the default; clears the backlog)
//   order "shuffle" → randomised
//   limit           → cap the session length (0 = no cap)
export function buildSessionQueue(cards: Card[], order: ReviewOrder = "due", limit = 0): Card[] {
  const ordered =
    order === "shuffle"
      ? shuffled(cards)
      : [...cards].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  return limit > 0 ? ordered.slice(0, limit) : ordered;
}
