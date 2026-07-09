"""CRUD + delta-sync routers for the eight owned resources (Phase 3, ADR 0007 §5).

A single :func:`build_router` factory wires every resource the same way, and every read
and write goes through :class:`~app.repository.OwnedRepository` — so the owner-scoping
invariant (ADR 0008 §3) is expressed once and cannot drift per resource. Sync tables get
full CRUD plus batch upsert; append-only logs (attempts, review_logs) get insert + read
only.

NOTE: this module intentionally does **not** use ``from __future__ import annotations`` —
the route signatures are built from per-resource schema classes resolved at definition
time, which FastAPI must see as real types, not strings.
"""

import uuid
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import api_schemas as s
from .auth import CurrentUser, get_current_user
from .db import get_session
from .limits import enforce_rate_limit
from .models import (
    Attempt,
    Card,
    Exam,
    GradeEntry,
    Question,
    Quiz,
    ReviewLog,
    Source,
    StudySession,
    Subject,
)
from .repository import ConflictError, OwnedRepository, OwnershipError
from .sync import InvalidCursor, decode_cursor

# Delta-pull page sizes. A batch upsert shares one updated_at, so a page never splits a
# batch incorrectly (keyset cursor handles it) — the cap is purely about response size.
DEFAULT_LIMIT = 500
MAX_LIMIT = 1000


def get_repo(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(get_current_user),
) -> OwnedRepository:
    """The per-request owner-scoped data layer, bound to the authenticated user."""
    return OwnedRepository(session, user.id)


@dataclass(frozen=True)
class ResourceSpec:
    name: str  # URL segment under /v1/
    model: type
    read: type[BaseModel]
    create: type[BaseModel]
    update: type[BaseModel] | None  # None ⇒ append-only (no PATCH/DELETE/upsert)

    @property
    def append_only(self) -> bool:
        return self.update is None


def _create_values(payload: BaseModel) -> tuple[dict, uuid.UUID | None]:
    """Split a create/upsert payload into (column values, client id). Only fields the
    client actually sent are kept, so server/model defaults fill the rest."""
    values = payload.model_dump(exclude_unset=True)
    row_id = values.pop("id", None)
    return values, row_id


def build_router(spec: ResourceSpec) -> APIRouter:
    # enforce_rate_limit guards every route on this router (Phase 4, ADR 0009): one router-
    # level dependency so the per-minute ceiling covers all CRUD + sync paths uniformly.
    router = APIRouter(
        prefix=f"/v1/{spec.name}",
        tags=[spec.name],
        dependencies=[Depends(enforce_rate_limit)],
    )
    Read = spec.read

    @router.get("", response_model=s.DeltaPage[Read])
    def list_delta(
        since: str | None = Query(default=None, description="Opaque delta cursor"),
        limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
        repo: OwnedRepository = Depends(get_repo),
    ):
        cursor = decode_cursor(since) if since else None  # InvalidCursor → 400 handler
        rows, next_cursor, has_more = repo.list_delta(spec.model, cursor, limit)
        return s.DeltaPage[Read](
            items=[Read.model_validate(r) for r in rows],
            next_cursor=next_cursor.encode() if next_cursor else None,
            has_more=has_more,
        )

    @router.get("/{row_id}", response_model=Read)
    def get_one(row_id: uuid.UUID, repo: OwnedRepository = Depends(get_repo)):
        obj = repo.get(spec.model, row_id)
        if obj is None:
            raise HTTPException(status_code=404, detail=f"{spec.name[:-1]} not found")
        return Read.model_validate(obj)

    @router.post("", response_model=Read, status_code=201)
    def create_one(payload: spec.create, repo: OwnedRepository = Depends(get_repo)):
        values, row_id = _create_values(payload)
        if row_id is not None:
            values["id"] = row_id
        obj = repo.create(spec.model, values)
        repo.session.commit()
        return Read.model_validate(obj)

    @router.post("/batch", response_model=s.DeltaPage[Read])
    def batch(
        payload: s.BatchUpsert[spec.create], repo: OwnedRepository = Depends(get_repo)
    ):
        """Idempotent push: upsert sync rows by client id, insert append-only logs. Atomic —
        any rejected item rolls the whole batch back."""
        out = []
        for item in payload.items:
            values, row_id = _create_values(item)
            if spec.append_only:
                if row_id is not None:
                    values["id"] = row_id
                out.append(repo.insert_append(spec.model, values))
            else:
                if row_id is None:
                    raise HTTPException(
                        status_code=422, detail="each item requires 'id' for upsert"
                    )
                out.append(repo.upsert(spec.model, row_id, values))
        repo.session.commit()
        return s.DeltaPage[Read](items=[Read.model_validate(o) for o in out])

    if not spec.append_only:

        @router.patch("/{row_id}", response_model=Read)
        def update_one(
            row_id: uuid.UUID,
            payload: spec.update,
            repo: OwnedRepository = Depends(get_repo),
        ):
            values = payload.model_dump(exclude_unset=True)
            obj = repo.update(spec.model, row_id, values)
            if obj is None:
                raise HTTPException(status_code=404, detail=f"{spec.name[:-1]} not found")
            repo.session.commit()
            return Read.model_validate(obj)

        @router.delete("/{row_id}", status_code=204)
        def delete_one(row_id: uuid.UUID, repo: OwnedRepository = Depends(get_repo)):
            if not repo.soft_delete(spec.model, row_id):
                raise HTTPException(status_code=404, detail=f"{spec.name[:-1]} not found")
            repo.session.commit()
            return Response(status_code=204)

    return router


def build_dashboard_router() -> APIRouter:
    """``GET /v1/dashboard`` — the caller's whole live working set in one response.

    A read-only convenience aggregate over the same owner-scoped repository the resource routers
    use, so it inherits the ownership invariant unchanged (ADR 0008 §3). It exists purely to
    remove the client's ten-request fan-out; it is not part of the sync contract, and the
    per-resource delta endpoints remain the only thing iOS depends on.
    """
    router = APIRouter(
        prefix="/v1/dashboard",
        tags=["dashboard"],
        dependencies=[Depends(enforce_rate_limit)],
    )

    @router.get("", response_model=s.DashboardRead)
    def read_dashboard(repo: OwnedRepository = Depends(get_repo)):
        # One session, one transaction: ten owner-scoped SELECTs on a single pooled connection.
        def rows(model, schema):
            return [schema.model_validate(r) for r in repo.list_live(model)]

        return s.DashboardRead(
            subjects=rows(Subject, s.SubjectRead),
            exams=rows(Exam, s.ExamRead),
            sources=rows(Source, s.SourceRead),
            cards=rows(Card, s.CardRead),
            quizzes=rows(Quiz, s.QuizRead),
            questions=rows(Question, s.QuestionRead),
            grade_entries=rows(GradeEntry, s.GradeEntryRead),
            attempts=rows(Attempt, s.AttemptRead),
            review_logs=rows(ReviewLog, s.ReviewLogRead),
            study_sessions=rows(StudySession, s.StudySessionRead),
        )

    return router


# The resources. Order is irrelevant; each is independent.
SPECS: list[ResourceSpec] = [
    ResourceSpec("subjects", Subject, s.SubjectRead, s.SubjectCreate, s.SubjectUpdate),
    ResourceSpec("exams", Exam, s.ExamRead, s.ExamCreate, s.ExamUpdate),
    ResourceSpec("sources", Source, s.SourceRead, s.SourceCreate, s.SourceUpdate),
    ResourceSpec("cards", Card, s.CardRead, s.CardCreate, s.CardUpdate),
    ResourceSpec("quizzes", Quiz, s.QuizRead, s.QuizCreate, s.QuizUpdate),
    ResourceSpec("questions", Question, s.QuestionRead, s.QuestionCreate, s.QuestionUpdate),
    ResourceSpec(
        "grade-entries", GradeEntry, s.GradeEntryRead, s.GradeEntryCreate, s.GradeEntryUpdate
    ),
    ResourceSpec("attempts", Attempt, s.AttemptRead, s.AttemptCreate, None),
    ResourceSpec("review-logs", ReviewLog, s.ReviewLogRead, s.ReviewLogCreate, None),
    ResourceSpec(
        "study-sessions", StudySession, s.StudySessionRead, s.StudySessionCreate, None
    ),
]


def install_resource_routers(app) -> None:
    """Mount every resource router and the repository-exception → HTTP handlers."""
    for spec in SPECS:
        app.include_router(build_router(spec))
    app.include_router(build_dashboard_router())

    @app.exception_handler(OwnershipError)
    async def _ownership(_: Request, exc: OwnershipError):
        # 422, and deliberately indistinguishable from 'parent does not exist' — never
        # confirm whether a foreign id is real.
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(ConflictError)
    async def _conflict(_: Request, exc: ConflictError):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(InvalidCursor)
    async def _bad_cursor(_: Request, exc: InvalidCursor):
        return JSONResponse({"detail": str(exc)}, status_code=400)
