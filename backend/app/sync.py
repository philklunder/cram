"""Delta-sync cursor (ADR 0007 §5).

The pull contract is ``GET …?since=<cursor>`` returning rows changed after the cursor,
including tombstones, with a ``next_cursor`` to resume from. The cursor is a **compound
keyset** of ``(timestamp, id)``, not a bare timestamp, for one concrete reason: every row
in a batch upsert shares the *same* ``updated_at`` (one transaction → one ``now()``), so a
timestamp-only cursor with strict ``>`` would skip rows across a page boundary and ``>=``
would loop. Ordering by ``(timestamp, id)`` and seeking past the last ``(timestamp, id)``
pair is exact — no skips, no re-delivery. ADR 0007 says "newest updated_at as the next
cursor"; this is that, refined with an id tiebreak.

The cursor is opaque to clients: a URL-safe base64 of ``"{iso8601}|{uuid}"``. It is *not*
a security boundary — it carries no ownership — so a tampered cursor can only mis-page the
caller's own data, never reach another user's (every query is owner-scoped in
``repository.py``).
"""

from __future__ import annotations

import base64
import binascii
import uuid
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Cursor:
    """A keyset position: rows with ``(ts, id)`` strictly greater are still unseen."""

    ts: datetime
    id: uuid.UUID

    def encode(self) -> str:
        raw = f"{self.ts.isoformat()}|{self.id}".encode()
        return base64.urlsafe_b64encode(raw).decode("ascii")


class InvalidCursor(ValueError):
    """A malformed ``since`` value — surfaced to the client as 400, never a 500."""


def decode_cursor(value: str) -> Cursor:
    """Parse a client-supplied ``since`` token. Raises :class:`InvalidCursor` on anything
    malformed so the route can return a clean 400 rather than leak a stack trace."""
    try:
        raw = base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
        ts_str, id_str = raw.split("|", 1)
        return Cursor(ts=datetime.fromisoformat(ts_str), id=uuid.UUID(id_str))
    except (binascii.Error, UnicodeDecodeError, ValueError) as e:
        raise InvalidCursor(f"Invalid 'since' cursor: {value!r}") from e
