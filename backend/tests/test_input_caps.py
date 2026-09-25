"""Inbound size caps and the one-AI-call-per-user guard (security review 2026-09-25).

Pure unit tests — no database needed: the body cap rejects before routing, and the schema
caps and the guard are exercised directly.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import api_schemas as s
from app import main


@pytest.fixture
def client():
    # Past the middleware the routes need a DB; a 500 there still proves the cap let it through.
    return TestClient(main.app, raise_server_exceptions=False)


def test_json_route_rejects_body_over_json_cap(client):
    too_big = str(main._MAX_JSON_BODY_BYTES + 1)
    r = client.post(
        "/v1/cards/batch",
        content=b"{}",
        headers={"content-length": too_big, "content-type": "application/json"},
    )
    assert r.status_code == 413


def test_upload_route_keeps_the_larger_upload_cap(client):
    # Just over the JSON cap but well under the upload cap: must get past the middleware
    # (whatever the route then says, it is not the body-size 413).
    size = str(main._MAX_JSON_BODY_BYTES + 1)
    r = client.post("/v1/generate", content=b"", headers={"content-length": size})
    assert r.status_code != 413


def test_create_schemas_cap_strings_and_lists():
    sid = uuid.uuid4()
    with pytest.raises(ValidationError):
        s.SubjectCreate(name="x" * 513)
    with pytest.raises(ValidationError):
        s.CardCreate(subject_id=sid, front="x" * 20_001, back="b", topic="t")
    with pytest.raises(ValidationError):
        s.CardUpdate(topic="x" * 257)
    with pytest.raises(ValidationError):
        s.QuestionCreate(
            quiz_id=sid, prompt="p", kind="multipleChoice", topic="t",
            options=["o"] * 21, answer_key="a",
        )
    with pytest.raises(ValidationError):
        s.SourceCreate(subject_id=sid, kind="pdf", title="t", storage_paths=["p"] * 51)
    # Values at the limit are accepted.
    s.SubjectCreate(name="x" * 512)
    s.CardCreate(subject_id=sid, front="x" * 20_000, back="b", topic="x" * 256)


def test_batch_item_cap():
    item = {"subject_id": str(uuid.uuid4()), "title": "t"}
    s.BatchUpsert[s.QuizCreate](items=[item] * s.MAX_BATCH_ITEMS)
    with pytest.raises(ValidationError):
        s.BatchUpsert[s.QuizCreate](items=[item] * (s.MAX_BATCH_ITEMS + 1))


def test_one_ai_call_per_user():
    alice, bob = uuid.uuid4(), uuid.uuid4()
    with main._one_ai_call_per_user(alice):
        # A second call for the same user is refused while the first is in flight…
        with pytest.raises(HTTPException) as exc:
            with main._one_ai_call_per_user(alice):
                pass
        assert exc.value.status_code == 429
        # …but other users are unaffected.
        with main._one_ai_call_per_user(bob):
            pass
    # Released on exit, including after an error inside the call.
    with pytest.raises(RuntimeError):
        with main._one_ai_call_per_user(alice):
            raise RuntimeError("claude failed")
    with main._one_ai_call_per_user(alice):
        pass
