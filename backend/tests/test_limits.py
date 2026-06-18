"""Phase 4 acceptance (ADR 0009): rate limit returns 429 past threshold; the spend cap
blocks an over-budget caller *without* calling Anthropic; prod boot fails fast on missing
config.

The rate-limit and spend-cap tests are Postgres-backed (the counters live in Postgres). The
production-config test is a pure unit test and runs without a DB.
"""

from __future__ import annotations

import dataclasses
import uuid

import pytest
from conftest import requires_db


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Each test gets a clean settings cache so env tweaks here don't leak across tests."""
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# --- rate limit -------------------------------------------------------------------------
@requires_db
def test_rate_limit_returns_429_past_threshold(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("CRAM_RATE_LIMIT_PER_MIN", "3")
    get_settings.cache_clear()  # pick up the low limit (enforce_rate_limit reads it per request)

    # Same authenticated user across all calls → one per-minute bucket. 3 succeed, the 4th trips.
    codes = [
        client.post("/v1/subjects", json={"name": f"S{i}"}).status_code for i in range(5)
    ]
    assert codes[:3] == [201, 201, 201], codes
    assert codes[3] == 429, codes

    # The 429 carries a Retry-After hint.
    r = client.post("/v1/subjects", json={"name": "again"})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) >= 1


# --- spend cap --------------------------------------------------------------------------
def _seed_usage(user_id: uuid.UUID, total_tokens: int) -> None:
    """Insert a committed usage row so a spend-cap check sees prior consumption."""
    from sqlalchemy.orm import Session

    from app.db import get_engine
    from app.models.internal import AiCallKind, AiUsageEvent

    with Session(get_engine()) as s:
        s.add(
            AiUsageEvent(
                user_id=user_id,
                kind=AiCallKind.grade,
                input_tokens=total_tokens,
                output_tokens=0,
                total_tokens=total_tokens,
            )
        )
        s.commit()


@requires_db
def test_user_spend_cap_blocks_without_calling_anthropic(client, current_user, monkeypatch):
    import app.main as main

    uid = current_user["user"].id
    _seed_usage(uid, total_tokens=50)  # already at the cap below
    monkeypatch.setattr(
        main, "settings", dataclasses.replace(main.settings, user_daily_token_cap=50)
    )

    def must_not_run(*a, **k):  # noqa: ANN002, ANN003
        raise AssertionError("Claude must not be called once the spend cap is reached")

    monkeypatch.setattr(main, "grade_answer", must_not_run)

    r = client.post(
        "/v1/grade", json={"prompt": "p", "model_answer": "m", "response": "r"}
    )
    assert r.status_code == 429, r.text
    assert "limit" in r.json()["detail"].lower()


@requires_db
def test_global_spend_cap_blocks_other_user(client, current_user, monkeypatch):
    import app.main as main

    # Another user has already exhausted the GLOBAL daily budget.
    _seed_usage(uuid.uuid4(), total_tokens=100)
    monkeypatch.setattr(
        main,
        "settings",
        dataclasses.replace(main.settings, user_daily_token_cap=0, global_daily_token_cap=100),
    )

    def must_not_run(*a, **k):  # noqa: ANN002, ANN003
        raise AssertionError("Claude must not be called once the global cap is reached")

    monkeypatch.setattr(main, "grade_answer", must_not_run)

    r = client.post(
        "/v1/grade", json={"prompt": "p", "model_answer": "m", "response": "r"}
    )
    assert r.status_code == 429, r.text


@requires_db
def test_paid_call_is_metered_even_when_attempt_persist_fails(client, current_user):
    """Regression (security review 2026-06-18): a grade call that pays for Claude but then
    fails to persist its attempt (foreign/absent question_id → 422) must STILL record usage,
    otherwise the spend cap is bypassable by spamming grade with a bogus question_id."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    from app.db import get_engine
    from app.models.internal import AiUsageEvent

    uid = current_user["user"].id
    r = client.post(
        "/v1/grade",
        json={
            "prompt": "p",
            "model_answer": "m",
            "response": "r",
            "question_id": str(uuid.uuid4()),  # not an owned question → persist raises 422
        },
    )
    assert r.status_code == 422, r.text  # the attempt persist is rejected...

    with Session(get_engine()) as s:
        total = s.execute(
            select(func.coalesce(func.sum(AiUsageEvent.total_tokens), 0)).where(
                AiUsageEvent.user_id == uid
            )
        ).scalar_one()
    assert total == 30, "the paid call must be metered despite the 422"  # ...but usage landed


@requires_db
def test_under_cap_records_usage_and_succeeds(client, current_user):
    """A call under budget proceeds and lands a usage row (so the cap can see it next time)."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    from app.db import get_engine
    from app.models.internal import AiUsageEvent

    uid = current_user["user"].id
    r = client.post("/v1/grade", json={"prompt": "p", "model_answer": "m", "response": "r"})
    assert r.status_code == 200, r.text

    with Session(get_engine()) as s:
        total = s.execute(
            select(func.coalesce(func.sum(AiUsageEvent.total_tokens), 0)).where(
                AiUsageEvent.user_id == uid
            )
        ).scalar_one()
    assert total == 30  # the fake grader reports 20 + 10 tokens (see conftest)


# --- production config guard (no DB needed) ---------------------------------------------
def _prod_settings(**overrides):
    from app.config import Settings

    base = dict(
        anthropic_api_key="sk-test",
        model="claude-sonnet-4-6",
        env="prod",
        shared_secret="",
        allow_dev_fallback=False,
        max_files=20,
        max_file_bytes=1,
        max_total_bytes=1,
        max_field_chars=1,
        rate_limit_per_min=60,
        user_daily_token_cap=100_000,
        global_daily_token_cap=1_000_000,
        trust_proxy=False,
        database_url="postgresql://x",
        database_direct_url="",
        supabase_url="https://x.supabase.co",
        supabase_jwt_secret="",
        supabase_jwks_url="https://x.supabase.co/auth/v1/.well-known/jwks.json",
        supabase_service_role_key="",
        supabase_storage_bucket="sources",
    )
    base.update(overrides)
    return Settings(**base)


def test_production_config_complete_boots():
    from app.config import check_production_config

    check_production_config(_prod_settings())  # fully configured → no raise


@pytest.mark.parametrize(
    "override",
    [
        {"anthropic_api_key": ""},
        {"database_url": ""},
        {"supabase_jwks_url": "", "supabase_jwt_secret": ""},  # no auth
        {"allow_dev_fallback": True},
        {"rate_limit_per_min": 0},
        {"user_daily_token_cap": 0},
        {"global_daily_token_cap": 0},
    ],
)
def test_production_config_fails_fast_on_missing(override):
    from app.config import check_production_config

    with pytest.raises(RuntimeError):
        check_production_config(_prod_settings(**override))


def test_dev_config_never_blocks():
    """Outside production the guard is a no-op even with everything blank/disabled."""
    from app.config import check_production_config

    check_production_config(
        _prod_settings(
            env="dev",
            anthropic_api_key="",
            database_url="",
            supabase_jwks_url="",
            supabase_jwt_secret="",
            rate_limit_per_min=0,
            user_daily_token_cap=0,
            global_daily_token_cap=0,
        )
    )
