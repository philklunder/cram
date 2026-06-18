"""Test harness for the Phase 3 data layer.

DB-backed tests require Postgres (the models use JSONB, ``Uuid``, checked-text enums and
``timestamptz`` — SQLite can't stand in). Point ``TEST_DATABASE_URL`` at a disposable
Postgres; without it the DB-backed tests **skip** (the cursor unit test still runs). A
container is the easy path:

    docker run --rm -d -e POSTGRES_PASSWORD=pw -p 55432:5432 --name cram-test postgres:15
    TEST_DATABASE_URL=postgresql://postgres:pw@localhost:55432/postgres pytest

The harness builds the schema straight from ``Base.metadata`` (not Alembic), so it omits
the Supabase ``auth.users`` FKs/RLS from migration 0002 — those need the ``auth`` schema and
aren't part of the ORM metadata. Auth and Storage are replaced by dependency overrides: a
settable current user (to exercise cross-user isolation) and an in-memory fake Storage.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

import pytest

TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

# These must be set before importing the app: db.py builds its engine at import time, and
# the route handlers check ANTHROPIC_API_KEY. The Claude calls themselves are monkeypatched.
if TEST_DB_URL:
    os.environ["DATABASE_URL"] = TEST_DB_URL
    os.environ["DATABASE_DIRECT_URL"] = TEST_DB_URL
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
    os.environ.setdefault("CRAM_ALLOW_DEV_FALLBACK", "1")

requires_db = pytest.mark.skipif(not TEST_DB_URL, reason="TEST_DATABASE_URL not set")


@dataclass
class FakeStorage:
    """In-memory Storage: records uploads, returns deterministic keys."""

    uploads: dict[str, bytes]

    def upload_source_files(self, user_id, source_id, files):  # noqa: ANN001
        keys = []
        for i, f in enumerate(files):
            key = f"{user_id}/{source_id}/{i:03d}-{f.filename}"
            self.uploads[key] = f.data
            keys.append(key)
        return keys


@pytest.fixture(scope="session")
def _app_env():
    if not TEST_DB_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    import app.db as db
    import app.main as main
    import app.models  # noqa: F401 — registers all tables on Base.metadata

    engine = db.get_engine()
    assert engine is not None
    db.Base.metadata.drop_all(engine)
    db.Base.metadata.create_all(engine)
    yield main
    db.Base.metadata.drop_all(engine)


@pytest.fixture
def current_user(_app_env):
    """A mutable holder for the authenticated user, so a test can switch identities to
    assert cross-user isolation. Defaults to a fresh user per test."""
    from app.auth import CurrentUser

    holder = {"user": CurrentUser(id=uuid.uuid4())}
    return holder


@pytest.fixture
def storage(_app_env):
    return FakeStorage(uploads={})


@pytest.fixture
def client(_app_env, current_user, storage, monkeypatch):
    from fastapi.testclient import TestClient

    import app.main as main
    from app.auth import get_current_user
    from app.routers import get_repo  # noqa: F401 — get_repo depends on get_current_user

    main.app.dependency_overrides[get_current_user] = lambda: current_user["user"]
    main.app.dependency_overrides[main.storage_dependency] = lambda: storage

    # Stub the two Claude calls so tests need no API key / network. Each returns the
    # (payload, TokenUsage) tuple the real functions now return (Phase 4 metering).
    from app.generation import TokenUsage

    def fake_generate_deck(settings, subject_name, title, kind, files):
        return {
            "source_title": title,
            "cards": [
                {"front": "Q1", "back": "A1", "topic": "t", "difficulty": 2},
                {"front": "Q2", "back": "A2", "topic": "t", "difficulty": 4},
            ],
            "questions": [
                {
                    "prompt": "Explain X",
                    "kind": "shortAnswer",
                    "topic": "t",
                    "options": [],
                    "answer_key": "because Y",
                }
            ],
        }, TokenUsage(input_tokens=100, output_tokens=50)

    def fake_grade_answer(settings, prompt, model_answer, response, topic):
        return {"score": 1.0, "feedback": "Correct.", "is_correct": True}, TokenUsage(
            input_tokens=20, output_tokens=10
        )

    monkeypatch.setattr(main, "generate_deck", fake_generate_deck)
    monkeypatch.setattr(main, "grade_answer", fake_grade_answer)

    with TestClient(main.app) as c:
        yield c

    main.app.dependency_overrides.clear()


@pytest.fixture
def as_user(current_user):
    """Switch the authenticated identity mid-test (for isolation assertions)."""
    from app.auth import CurrentUser

    def _switch(user_id: uuid.UUID | None = None) -> uuid.UUID:
        uid = user_id or uuid.uuid4()
        current_user["user"] = CurrentUser(id=uid)
        return uid

    return _switch
