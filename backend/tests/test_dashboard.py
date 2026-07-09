"""GET /v1/dashboard — the aggregated read that replaces the web client's ten-request fan-out.

It is a convenience view over the same owner-scoped repository as the resource routers, so the
tests that matter are: it returns the caller's live rows, it excludes tombstones (unlike a delta
pull), and it never leaks another user's rows (ADR 0008 §3).
"""

from __future__ import annotations

from conftest import requires_db

GENERATE_FILES = [("files", ("notes.pdf", b"%PDF-1.4 fake-bytes", "application/pdf"))]

RESOURCE_KEYS = [
    "subjects",
    "exams",
    "sources",
    "cards",
    "quizzes",
    "questions",
    "grade_entries",
    "attempts",
    "review_logs",
    "study_sessions",
]


def _generate(client, subject_name="Biology", title="Cell notes"):
    return client.post(
        "/v1/generate",
        data={"subject_name": subject_name, "title": title, "kind": "pdf"},
        files=GENERATE_FILES,
    )


@requires_db
def test_dashboard_is_empty_for_a_fresh_user(client):
    body = client.get("/v1/dashboard").json()
    # Every resource is present as an empty list — the client destructures all ten unconditionally.
    assert sorted(body) == sorted(RESOURCE_KEYS)
    assert all(body[k] == [] for k in RESOURCE_KEYS)


@requires_db
def test_dashboard_returns_the_callers_live_rows(client):
    r = _generate(client)
    assert r.status_code == 200, r.text
    deck = r.json()

    body = client.get("/v1/dashboard").json()
    assert [s["id"] for s in body["subjects"]] == [deck["subject_id"]]
    assert [s["id"] for s in body["sources"]] == [deck["source_id"]]
    assert [q["id"] for q in body["quizzes"]] == [deck["quiz_id"]]
    assert len(body["cards"]) == 2
    assert len(body["questions"]) == 1

    # The aggregate agrees with what the per-resource delta pulls return, which is the contract
    # the client is trading away ten requests for.
    for resource, key in (("cards", "cards"), ("quizzes", "quizzes"), ("questions", "questions")):
        delta = client.get(f"/v1/{resource}").json()["items"]
        assert {r["id"] for r in delta} == {r["id"] for r in body[key]}


@requires_db
def test_dashboard_excludes_tombstones(client):
    """A delta pull includes soft-deleted rows so replicas converge; the dashboard must not —
    it renders live rows."""
    deck = _generate(client).json()
    subject_id, quiz_id = deck["subject_id"], deck["quiz_id"]

    assert client.delete(f"/v1/quizzes/{quiz_id}").status_code == 204

    body = client.get("/v1/dashboard").json()
    assert body["quizzes"] == []
    # The cascade tombstones the quiz's questions too, so they vanish from the aggregate as well.
    assert body["questions"] == []
    # ...while the delta pull still surfaces the tombstone for sync clients.
    delta = client.get("/v1/quizzes").json()["items"]
    assert [q["id"] for q in delta] == [quiz_id]
    assert delta[0]["deleted_at"] is not None

    # The subject is untouched.
    assert [s["id"] for s in body["subjects"]] == [subject_id]


@requires_db
def test_dashboard_never_leaks_another_users_rows(client, as_user):
    """The load-bearing invariant: a new read path must still be owner-scoped."""
    _generate(client, subject_name="Biology")
    owner_body = client.get("/v1/dashboard").json()
    assert len(owner_body["cards"]) == 2

    as_user()  # switch to a different authenticated identity
    intruder_body = client.get("/v1/dashboard").json()
    assert all(intruder_body[k] == [] for k in RESOURCE_KEYS)

    # And the intruder's own rows don't bleed back the other way.
    _generate(client, subject_name="Chemistry")
    intruder_body = client.get("/v1/dashboard").json()
    assert [s["name"] for s in intruder_body["subjects"]] == ["Chemistry"]
