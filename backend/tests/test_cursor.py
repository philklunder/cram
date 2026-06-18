"""Cursor codec — no database needed."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.sync import Cursor, InvalidCursor, decode_cursor


def test_cursor_roundtrip() -> None:
    cur = Cursor(ts=datetime(2026, 6, 18, 12, 30, 45, 123456, tzinfo=timezone.utc), id=uuid.uuid4())
    assert decode_cursor(cur.encode()) == cur


@pytest.mark.parametrize("bad", ["", "not-base64!!", "Zm9vfGJhcg==", "x", "  "])
def test_invalid_cursor_raises(bad: str) -> None:
    # Malformed cursors must raise InvalidCursor (→ 400), never a generic ValueError/500.
    with pytest.raises(InvalidCursor):
        decode_cursor(bad)
