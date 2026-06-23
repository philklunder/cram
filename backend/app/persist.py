"""Persist AI output under the calling user (Phase 3, ADR 0007 §4/§6).

Generation and grading used to be stateless. Here their output is written through the
owner-scoped :class:`~app.repository.OwnedRepository`, so every row (subject, source,
cards, quiz, questions, attempt) is stamped with the caller and validated for parent
ownership by the same invariant that guards the CRUD endpoints. The caller commits the
session once, so a generate either persists fully or not at all.
"""

from __future__ import annotations

import logging
import uuid

from .generation import UploadedFile
from .models import Card, Question, Quiz, Source, Subject
from .models.enums import QuestionKind, SourceKind
from .repository import OwnedRepository
from .storage import Storage, StorageError

log = logging.getLogger("cram.persist")


def persist_generation(
    repo: OwnedRepository,
    storage: Storage | None,
    *,
    subject_name: str,
    title: str,
    kind: str,
    files: list[UploadedFile],
    deck: dict,
) -> dict:
    """Persist a generated deck and its source, returning ``deck`` enriched with the
    created row ids (so the client can sync immediately). Find-or-creates the subject by
    name; uploads the source files to Storage (when configured) before recording the
    ``storage_paths`` on the source row."""
    subject = repo.find_first(Subject, name=subject_name)
    if subject is None:
        subject = repo.create(Subject, {"name": subject_name})

    # The source id is minted up front so the Storage object key can reference it before
    # the row is written.
    source_id = uuid.uuid4()
    storage_paths: list[str] = []
    if storage is not None and files:
        try:
            storage_paths = storage.upload_source_files(repo.user_id, source_id, files)
        except StorageError:
            # A Storage hiccup must not throw away a generation the caller already paid for:
            # persist the deck with no stored file (``storage_paths`` stays empty) and return the
            # cards anyway. The raw bytes are secondary — the generated deck is the product. The
            # underlying reason is logged in storage.py; this records that we degraded.
            log.warning(
                "source %s persisted without stored files after a Storage upload failure",
                source_id,
            )
            storage_paths = []
    source = repo.create(
        Source,
        {
            "id": source_id,
            "subject_id": subject.id,
            "kind": SourceKind(kind),
            "title": title,
            "storage_paths": storage_paths,
        },
    )

    card_rows = []
    for c in deck.get("cards", []):
        card_rows.append(
            repo.create(
                Card,
                {
                    "subject_id": subject.id,
                    "source_id": source.id,
                    "front": c["front"],
                    "back": c["back"],
                    "topic": c["topic"],
                    "difficulty": c["difficulty"],
                },
            )
        )

    quiz = repo.create(Quiz, {"subject_id": subject.id, "title": title})
    question_rows = []
    for q in deck.get("questions", []):
        question_rows.append(
            repo.create(
                Question,
                {
                    "quiz_id": quiz.id,
                    "prompt": q["prompt"],
                    "kind": QuestionKind(q["kind"]),
                    "topic": q["topic"],
                    "options": q.get("options", []),
                    "answer_key": q["answer_key"],
                },
            )
        )

    # Enrich the response with the persisted ids (deck shape is otherwise unchanged).
    enriched = dict(deck)
    enriched["subject_id"] = str(subject.id)
    enriched["source_id"] = str(source.id)
    enriched["quiz_id"] = str(quiz.id)
    enriched["cards"] = [
        {**card, "id": str(row.id)}
        for card, row in zip(deck.get("cards", []), card_rows)
    ]
    enriched["questions"] = [
        {**q, "id": str(row.id)}
        for q, row in zip(deck.get("questions", []), question_rows)
    ]
    return enriched


def persist_attempt(
    repo: OwnedRepository,
    *,
    question_id: uuid.UUID,
    response: str,
    grade: dict,
) -> uuid.UUID:
    """Record a graded short-answer attempt (append-only) under the caller. The question's
    ownership is enforced by the repository's parent check; a foreign/absent question id is
    rejected as 422 before any row is written."""
    from .models import Attempt

    row = repo.insert_append(
        Attempt,
        {
            "question_id": question_id,
            "response": response,
            "is_correct": grade["is_correct"],
            "score": grade["score"],
            "feedback": grade["feedback"],
        },
    )
    return row.id
