"""The single owner-scoped data-access layer — the load-bearing security invariant of
Phase 3 (ADR 0008 §3).

The backend connects to Postgres as the table-owner role, which **bypasses** the
``ENABLE``d-but-not-``FORCE``d RLS policies. RLS therefore does *not* guard the backend's
own queries: a single forgotten ``WHERE user_id = …`` is a cross-user data leak with no
database backstop. So **every** read and write against an owned table goes through this
class, and every query it builds starts from :meth:`_owned`, which pins ``user_id`` to the
caller. Routes never touch ``session`` for owned models directly — they call these methods.

Two further cross-user hazards are closed here centrally, so a route cannot reintroduce
them by forgetting a check:

- **Parent stealing.** Creating a child (e.g. a card) with a ``subject_id`` belonging to
  another user would attach the caller's row under a foreign parent. :data:`PARENTS`
  declares every FK→owner relationship; :meth:`_check_parents` verifies each referenced
  parent is owned by the caller before any insert.
- **Id squatting.** Upsert is keyed by the client-generated UUID PK. The existence check is
  scoped by ``user_id``; a PK that exists under another user can never be updated (it isn't
  found as owned), and the subsequent insert hits the global PK and fails closed as a 409 —
  never a silent overwrite of someone else's row.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import (
    Attempt,
    Card,
    GradeEntry,
    Question,
    Quiz,
    ReviewLog,
    Source,
    StudySession,
    Subject,
)
from .sync import Cursor

# Owned tables, keyed by model. Every model below carries `user_id` (OwnedMixin); this set
# is the allow-list — _owned() refuses anything not registered here, so a stray non-owned
# model can never be queried unscoped through this repository.
OWNED_MODELS: frozenset[type] = frozenset(
    {Subject, Source, Card, Quiz, Question, Attempt, GradeEntry, ReviewLog, StudySession}
)

# FK → owning-parent relationships: {model: {fk_attr: (parent_model, required)}}. Used to
# assert the caller owns every referenced parent before an insert (anti parent-stealing).
PARENTS: dict[type, dict[str, tuple[type, bool]]] = {
    Subject: {},
    Source: {"subject_id": (Subject, True)},
    Card: {"subject_id": (Subject, True), "source_id": (Source, False)},
    Quiz: {"subject_id": (Subject, True)},
    Question: {"quiz_id": (Quiz, True)},
    Attempt: {"question_id": (Question, True)},
    GradeEntry: {"subject_id": (Subject, True)},
    ReviewLog: {"card_id": (Card, True)},
    # subject_id is optional (a session can span subjects); when present it must be owned.
    StudySession: {"subject_id": (Subject, False)},
}

# Soft-delete cascade: {model: [(child_model, child_fk_attr), …]} over *sync* tables only.
# Append-only event rows (attempts, review_logs) are immutable history and are never
# tombstoned, so they are absent here. Cards deliberately do NOT cascade from sources
# (a card outlives its source — source_id is SET NULL on hard delete), so Source has no
# entry. Recursion handles the nested case (subject → quiz → question).
CASCADE: dict[type, list[tuple[type, str]]] = {
    Subject: [
        (Source, "subject_id"),
        (Card, "subject_id"),
        (Quiz, "subject_id"),
        (GradeEntry, "subject_id"),
    ],
    Quiz: [(Question, "quiz_id")],
}


class OwnershipError(Exception):
    """A referenced parent row is not owned by the caller (or does not exist). Routes map
    this to 422 — it is indistinguishable, by design, from 'parent does not exist', so it
    never reveals whether a foreign id is real."""


class ConflictError(Exception):
    """A client-supplied PK already exists under a different owner (id squatting), or an
    insert otherwise violated the PK. Routes map this to 409."""


class OwnedRepository:
    """All owned-table access for one authenticated user. Construct per request from the
    session dependency and ``current_user.id``."""

    def __init__(self, session: Session, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id

    # --- query scoping -----------------------------------------------------------------
    def _owned(self, model: type):
        """The one place a query against an owned model is born — always pinned to the
        caller. Refuses any model not on the OWNED_MODELS allow-list."""
        if model not in OWNED_MODELS:
            raise ValueError(f"{model.__name__} is not an owned model")
        return select(model).where(model.user_id == self.user_id)

    @staticmethod
    def _is_soft_deletable(model: type) -> bool:
        return hasattr(model, "deleted_at")

    def _check_parents(self, model: type, values: dict[str, Any]) -> None:
        """Verify the caller owns every referenced parent (anti parent-stealing). A missing
        required parent or a foreign/absent parent both raise OwnershipError."""
        for fk_attr, (parent_model, required) in PARENTS.get(model, {}).items():
            parent_id = values.get(fk_attr)
            if parent_id is None:
                if required:
                    raise OwnershipError(f"{model.__name__}.{fk_attr} is required")
                continue
            if self.get(parent_model, parent_id) is None:
                raise OwnershipError(
                    f"{fk_attr}={parent_id} is not an owned {parent_model.__name__}"
                )

    # --- reads -------------------------------------------------------------------------
    def get(self, model: type, row_id: uuid.UUID):
        """One owned row by id, or ``None``. Soft-deleted rows read as absent (a tombstone
        is not a live row); delta-pull is the only path that surfaces them."""
        stmt = self._owned(model).where(model.id == row_id)
        if self._is_soft_deletable(model):
            stmt = stmt.where(model.deleted_at.is_(None))
        return self.session.execute(stmt).scalar_one_or_none()

    def find_first(self, model: type, **filters: Any):
        """First owned, live row matching equality ``filters`` (e.g. ``name=…``), or
        ``None``. Owner-scoped like every other read — used by generation's find-or-create
        of the subject so even that lookup can't cross users."""
        stmt = self._owned(model)
        if self._is_soft_deletable(model):
            stmt = stmt.where(model.deleted_at.is_(None))
        for attr, val in filters.items():
            stmt = stmt.where(getattr(model, attr) == val)
        return self.session.execute(stmt.limit(1)).scalar_one_or_none()

    def list_delta(
        self, model: type, since: Cursor | None, limit: int
    ) -> tuple[list[Any], Cursor | None, bool]:
        """Keyset delta pull (ADR 0007 §5). Orders by ``(ts_attr, id)`` and seeks strictly
        past ``since`` — exact even when a whole batch shares one ``updated_at``.

        Tombstones are **included** (no ``deleted_at`` filter) so deletions propagate. The
        sort/seek column is ``updated_at`` for sync tables and ``created_at`` for append-
        only logs (which have no ``updated_at``).

        Returns ``(rows, next_cursor, has_more)``. ``next_cursor`` is **always** a resume
        point: the ``(ts, id)`` of the last row, or the incoming ``since`` echoed back when
        the page is empty — so a caught-up client keeps a stable position to poll for future
        changes. ``has_more`` is True when rows beyond this page are already available."""
        ts_attr = model.updated_at if self._is_soft_deletable(model) else model.created_at
        stmt = self._owned(model)
        if since is not None:
            # (ts, id) > (since.ts, since.id), expanded so it uses the (ts, id) ordering.
            stmt = stmt.where(
                (ts_attr > since.ts)
                | ((ts_attr == since.ts) & (model.id > since.id))
            )
        stmt = stmt.order_by(ts_attr.asc(), model.id.asc()).limit(limit + 1)
        rows = list(self.session.execute(stmt).scalars().all())

        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        if rows:
            last = rows[-1]
            next_cursor: Cursor | None = Cursor(ts=getattr(last, ts_attr.key), id=last.id)
        else:
            next_cursor = since  # nothing new — echo the caller's position
        return rows, next_cursor, has_more

    # --- writes ------------------------------------------------------------------------
    def create(self, model: type, values: dict[str, Any]):
        """Insert one owned row. Stamps ``user_id`` (any client-supplied ``user_id`` is
        ignored — ownership is the caller, never the payload) and validates parents."""
        values = {**values, "user_id": self.user_id}
        self._check_parents(model, values)
        obj = model(**values)
        self.session.add(obj)
        try:
            self._flush()
        except IntegrityError as e:
            # A client-supplied PK can collide (with the caller's own row or, on the global
            # PK, another user's). Either way fail closed as a conflict, never a 500.
            self.session.rollback()
            raise ConflictError("id already exists") from e
        return obj

    def insert_append(self, model: type, values: dict[str, Any]):
        """Insert an append-only event row (attempt / review_log). Same ownership stamping
        and parent check as :meth:`create`; there is deliberately no update/delete path."""
        return self.create(model, values)

    def update(self, model: type, row_id: uuid.UUID, values: dict[str, Any]):
        """Patch mutable fields of one owned, live row. Returns the row, or ``None`` if no
        owned live row has that id. ``updated_at`` is bumped so the change is pulled."""
        obj = self.get(model, row_id)
        if obj is None:
            return None
        self._apply_update(model, obj, values)
        self._flush()
        # Reload server-computed columns (notably the onupdate-bumped updated_at) so the
        # response carries real timestamps, not stale/uncomputed values.
        self.session.refresh(obj)
        return obj

    def upsert(self, model: type, row_id: uuid.UUID, values: dict[str, Any]):
        """Upsert one owned row by client-generated PK (idempotent push, ADR 0007 §5).

        Existence is checked **scoped to the caller**: an id owned by someone else is not
        found, so the code falls through to insert, which fails closed on the global PK as a
        :class:`ConflictError` — never an overwrite of a foreign row. A soft-deleted row of
        the caller's own is resurrected (deleted_at cleared) on upsert."""
        existing = self.session.execute(
            self._owned(model).where(model.id == row_id)
        ).scalar_one_or_none()
        if existing is not None:
            self._apply_update(model, existing, values, clear_tombstone=True)
            self._flush()
            self.session.refresh(existing)  # fresh updated_at for the response
            return existing
        values = {**values, "id": row_id, "user_id": self.user_id}
        self._check_parents(model, values)
        obj = model(**values)
        self.session.add(obj)
        try:
            self._flush()
        except IntegrityError as e:
            self.session.rollback()
            raise ConflictError(f"id {row_id} already exists") from e
        return obj

    def soft_delete(self, model: type, row_id: uuid.UUID) -> bool:
        """Tombstone one owned row and cascade ``deleted_at`` to its sync-table descendants
        (ADR 0008: a hard ORM cascade emits no child tombstones → ghost rows on offline
        clients). Returns ``False`` if no owned live row has that id. ``updated_at`` is
        bumped alongside ``deleted_at`` so every tombstone surfaces on the next delta pull."""
        obj = self.get(model, row_id)
        if obj is None:
            return False
        self._tombstone_subtree(model, [row_id])
        self.session.flush()
        return True

    # --- internals ---------------------------------------------------------------------
    def _apply_update(
        self, model: type, obj: Any, values: dict[str, Any], clear_tombstone: bool = False
    ) -> None:
        # user_id / id are never client-mutable; parents are re-validated if relinked.
        values = {k: v for k, v in values.items() if k not in ("id", "user_id")}
        parent_attrs = PARENTS.get(model, {})
        if any(k in parent_attrs for k in values):
            merged = {a: getattr(obj, a) for a in parent_attrs}
            merged.update(values)
            self._check_parents(model, merged)
        for key, val in values.items():
            setattr(obj, key, val)
        if clear_tombstone and self._is_soft_deletable(model):
            obj.deleted_at = None
        # updated_at is bumped by SyncMixin.onupdate=func.now() whenever a column actually
        # changes — no manual touch (which would leave a SQL clause on the in-memory attr and
        # break serialization). A true no-op upsert emits no UPDATE, which is correct: nothing
        # changed, so there is nothing new to propagate.

    def _tombstone_subtree(self, model: type, ids: Sequence[uuid.UUID]) -> None:
        """Set deleted_at + updated_at = now() on the given owned rows, then recurse into
        CASCADE children. All statements are owner-scoped and skip already-tombstoned rows."""
        if not ids:
            return
        self.session.execute(
            update(model)
            .where(model.user_id == self.user_id, model.id.in_(ids))
            .values(deleted_at=func.now(), updated_at=func.now())
        )
        for child_model, fk_attr in CASCADE.get(model, []):
            fk_col = getattr(child_model, fk_attr)
            child_ids = list(
                self.session.execute(
                    select(child_model.id).where(
                        child_model.user_id == self.user_id,
                        fk_col.in_(ids),
                        child_model.deleted_at.is_(None),
                    )
                ).scalars().all()
            )
            self._tombstone_subtree(child_model, child_ids)

    def _flush(self) -> None:
        self.session.flush()
