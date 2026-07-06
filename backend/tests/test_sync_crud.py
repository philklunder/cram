"""Phase 3 acceptance: the full create → generate → delta → grade → soft-delete → tombstone
flow, plus the cross-user isolation that ADR 0008 §3 makes the load-bearing invariant.

All tests are Postgres-backed (see conftest). Identity is swapped via ``as_user`` to prove
one user can never read, write, relink, or delete another user's rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from conftest import requires_db

GENERATE_FILES = [("files", ("notes.pdf", b"%PDF-1.4 fake-bytes", "application/pdf"))]


def _generate(client, subject_name="Biology", title="Cell notes"):
    return client.post(
        "/v1/generate",
        data={"subject_name": subject_name, "title": title, "kind": "pdf"},
        files=GENERATE_FILES,
    )


@requires_db
def test_end_to_end_flow(client, storage):
    # 1. Create a subject directly via CRUD.
    r = client.post("/v1/subjects", json={"name": "Biology", "grading_scale": "german"})
    assert r.status_code == 201, r.text
    subject_id = r.json()["id"]

    # 2. Generate — persists source (file → Storage), cards, quiz + questions, reusing the
    #    existing subject by name.
    r = _generate(client)
    assert r.status_code == 200, r.text
    deck = r.json()
    assert deck["subject_id"] == subject_id  # reused, not duplicated
    source_id, quiz_id = deck["source_id"], deck["quiz_id"]
    assert len(deck["cards"]) == 2 and all("id" in c for c in deck["cards"])
    question_id = deck["questions"][0]["id"]

    # File was persisted to Storage and recorded on the source row.
    assert storage.uploads, "expected the uploaded file in Storage"
    src = client.get(f"/v1/sources/{source_id}").json()
    assert src["storage_paths"] and len(src["storage_paths"]) == 1

    # 3. Delta pull of cards: both cards come back, then the caller is caught up.
    r = client.get("/v1/cards").json()
    assert len(r["items"]) == 2
    assert r["has_more"] is False
    cards_cursor = r["next_cursor"]
    assert cards_cursor is not None
    # Pulling again from the cursor yields nothing new and the SAME position.
    r2 = client.get("/v1/cards", params={"since": cards_cursor}).json()
    assert r2["items"] == [] and r2["next_cursor"] == cards_cursor

    # 4. Grade the short-answer question → persists an append-only attempt.
    r = client.post(
        "/v1/grade",
        json={
            "prompt": "Explain X",
            "model_answer": "because Y",
            "response": "because Y",
            "question_id": question_id,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_correct"] is True
    attempt_id = r.json()["attempt_id"]
    attempts = client.get("/v1/attempts").json()["items"]
    assert [a["id"] for a in attempts] == [attempt_id]
    assert attempts[0]["feedback"] == "Correct."

    # 5. Soft-delete the subject → tombstones cascade to every sync-table descendant.
    r = client.delete(f"/v1/subjects/{subject_id}")
    assert r.status_code == 204
    # The subject now reads as absent (a tombstone is not a live row).
    assert client.get(f"/v1/subjects/{subject_id}").status_code == 404

    # 6. The deletion propagates on the next delta pull as tombstones (deleted_at set).
    tomb = client.get("/v1/cards", params={"since": cards_cursor}).json()["items"]
    assert len(tomb) == 2 and all(c["deleted_at"] is not None for c in tomb)
    # Cascade reached the source, quiz, and question too.
    for path, rid in (
        ("sources", source_id),
        ("quizzes", quiz_id),
        ("questions", question_id),
    ):
        got = client.get(f"/v1/{path}").json()["items"]
        assert any(x["id"] == rid and x["deleted_at"] is not None for x in got), path


@requires_db
def test_cross_user_isolation(client, as_user):
    # User A creates a subject and a card.
    a_id = as_user()
    a_subject = client.post("/v1/subjects", json={"name": "A-Subject"}).json()["id"]
    a_card = client.post(
        "/v1/cards",
        json={"subject_id": a_subject, "front": "f", "back": "b", "topic": "t"},
    ).json()["id"]

    # User B must not see, fetch, patch, delete, steal the parent of, or squat the id of
    # any of A's rows.
    as_user()
    assert client.get("/v1/subjects").json()["items"] == []
    assert client.get(f"/v1/subjects/{a_subject}").status_code == 404
    assert client.get(f"/v1/cards/{a_card}").status_code == 404
    assert client.patch(f"/v1/cards/{a_card}", json={"front": "hacked"}).status_code == 404
    assert client.delete(f"/v1/cards/{a_card}").status_code == 404

    # Parent stealing: create a card under A's subject → 422 (indistinguishable from absent).
    r = client.post(
        "/v1/cards",
        json={"subject_id": a_subject, "front": "x", "back": "y", "topic": "t"},
    )
    assert r.status_code == 422

    # Id squatting: upsert onto A's card id → rejected (422 if the bogus parent check fires
    # first, else 409 on the global PK). Either way A's row must be untouched.
    r = client.post(
        "/v1/cards/batch",
        json={"items": [{"id": a_card, "subject_id": str(uuid.uuid4()),
                         "front": "evil", "back": "evil", "topic": "t"}]},
    )
    assert r.status_code in (409, 422)

    # Back as A: the card is exactly as A wrote it.
    as_user(a_id)
    a_view = client.get(f"/v1/cards/{a_card}").json()
    assert a_view["front"] == "f" and a_view["back"] == "b"


@requires_db
def test_patch_bumps_updated_at_and_serializes(client):
    # A successful PATCH must return a real (serializable) updated_at that advanced past the
    # row's creation — guards the onupdate/refresh path in the repository.
    subj = client.post("/v1/subjects", json={"name": "S"}).json()
    card = client.post(
        "/v1/cards",
        json={"subject_id": subj["id"], "front": "f", "back": "b", "topic": "t"},
    ).json()

    r = client.patch(f"/v1/cards/{card['id']}", json={"front": "edited"})
    assert r.status_code == 200, r.text
    patched = r.json()
    assert patched["front"] == "edited"
    assert datetime.fromisoformat(patched["updated_at"]) >= datetime.fromisoformat(card["created_at"])

    # The edit is durable and visible on read-back.
    again = client.get(f"/v1/cards/{card['id']}").json()
    assert again["front"] == "edited"


@requires_db
def test_keyset_pagination_across_shared_timestamp(client):
    # A batch upsert writes many rows in one transaction → they share one updated_at. The
    # keyset (ts, id) cursor must page through them with no skips and no repeats.
    items = [{"id": str(uuid.uuid4()), "name": f"S{i}"} for i in range(5)]
    r = client.post("/v1/subjects/batch", json={"items": items})
    assert r.status_code == 200, r.text

    seen: list[str] = []
    cursor = None
    for _ in range(10):  # generous upper bound on loop iterations
        params = {"limit": 2}
        if cursor:
            params["since"] = cursor
        page = client.get("/v1/subjects", params=params).json()
        seen.extend(x["id"] for x in page["items"])
        cursor = page["next_cursor"]
        if not page["has_more"]:
            break

    assert len(seen) == len(set(seen)) == 5  # every row exactly once
    assert set(seen) == {i["id"] for i in items}


@requires_db
def test_study_sessions_append_only_and_owner_scoped(client, as_user):
    # User A records two study blocks: one attributed to a subject, one unattributed (null).
    a_id = as_user()
    subject = client.post("/v1/subjects", json={"name": "Bio"}).json()["id"]

    r = client.post(
        "/v1/study-sessions",
        json={"subject_id": subject, "duration_seconds": 900, "kind": "review"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["subject_id"] == subject and r.json()["kind"] == "review"

    r = client.post("/v1/study-sessions", json={"duration_seconds": 300})
    assert r.status_code == 201, r.text
    assert r.json()["subject_id"] is None and r.json()["kind"] == "other"  # defaults

    # Both come back on the delta pull.
    items = client.get("/v1/study-sessions").json()["items"]
    assert len(items) == 2
    assert sum(i["duration_seconds"] for i in items) == 1200

    # Append-only: no PATCH / DELETE routes exist.
    sid = items[0]["id"]
    assert client.patch(f"/v1/study-sessions/{sid}", json={"duration_seconds": 1}).status_code == 405
    assert client.delete(f"/v1/study-sessions/{sid}").status_code == 405

    # Validation: a runaway duration is rejected (guards the weekly-activity aggregate).
    assert client.post("/v1/study-sessions", json={"duration_seconds": 999_999}).status_code == 422

    # User B is isolated: sees none of A's sessions, and cannot attribute one to A's subject.
    as_user()
    assert client.get("/v1/study-sessions").json()["items"] == []
    r = client.post(
        "/v1/study-sessions", json={"subject_id": subject, "duration_seconds": 60}
    )
    assert r.status_code == 422  # parent-steal: A's subject is not owned (indistinguishable from absent)

    # Back as A: still exactly two sessions.
    as_user(a_id)
    assert len(client.get("/v1/study-sessions").json()["items"]) == 2
