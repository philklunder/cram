"""Coverage level ("density") for /v1/generate: prompt wording and the Claude call's budget.

Pure unit tests — the SDK client is stubbed, so no API key, network or database is needed.
The endpoint-level checks (default, pass-through, 422) are DB-backed in test_sync_crud.py.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import generation
from app.generation import GenerationError, UploadedFile, generate_deck
from app.prompt import DEFAULT_DENSITY, DENSITIES, DENSITY_GUIDANCE, build_user_text

PDF = UploadedFile(filename="notes.pdf", content_type="application/pdf", data=b"%PDF-1.4")
DECK_JSON = '{"source_title": "Notes", "cards": [], "questions": []}'


class _FakeMessages:
    def __init__(self, stop_reason: str = "end_turn"):
        self.stop_reason = stop_reason
        self.kwargs: dict | None = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="text", text=DECK_JSON)],
            usage=SimpleNamespace(input_tokens=10, output_tokens=5),
        )


@pytest.fixture
def fake_messages(monkeypatch):
    messages = _FakeMessages()
    monkeypatch.setattr(generation, "_get_client", lambda _key: SimpleNamespace(messages=messages))
    return messages


def _settings():
    return SimpleNamespace(anthropic_api_key="test", model="claude-test")


def test_every_density_has_guidance_and_a_token_ceiling():
    assert DEFAULT_DENSITY == "balanced"
    assert set(DENSITY_GUIDANCE) == set(DENSITIES)
    assert set(generation.MAX_OUTPUT_TOKENS_BY_DENSITY) == set(DENSITIES)
    # The SDK refuses non-streaming calls whose max_tokens could run past ~10 minutes.
    assert max(generation.MAX_OUTPUT_TOKENS_BY_DENSITY.values()) <= 21_000


def test_user_text_carries_exactly_the_chosen_guidance():
    texts = {d: build_user_text("Biology", "Cells", "pdf", d) for d in DENSITIES}
    for density, text in texts.items():
        assert DENSITY_GUIDANCE[density] in text
        for other in DENSITIES:
            if other != density:
                assert DENSITY_GUIDANCE[other] not in text
    assert build_user_text("Biology", "Cells", "pdf") == texts[DEFAULT_DENSITY]


@pytest.mark.parametrize("density", DENSITIES)
def test_generate_sends_the_density_prompt_and_budget(fake_messages, density):
    generate_deck(_settings(), "Biology", "Cells", "pdf", [PDF], density)
    kw = fake_messages.kwargs
    assert kw["max_tokens"] == generation.MAX_OUTPUT_TOKENS_BY_DENSITY[density]
    assert DENSITY_GUIDANCE[density] in kw["messages"][0]["content"][0]["text"]


def test_comprehensive_gets_more_room_than_essentials():
    budget = generation.MAX_OUTPUT_TOKENS_BY_DENSITY
    assert budget["comprehensive"] > budget["balanced"] >= budget["essentials"]


def test_truncated_deck_is_a_clear_error_not_malformed_json(fake_messages):
    fake_messages.stop_reason = "max_tokens"
    with pytest.raises(GenerationError, match="too long to cover at this level"):
        generate_deck(_settings(), "Biology", "Cells", "pdf", [PDF], "comprehensive")


@pytest.mark.parametrize("stop_reason, text", [("max_tokens", DECK_JSON), ("refusal", DECK_JSON), ("end_turn", "{not json")])
def test_failures_after_the_response_carry_the_billed_usage(fake_messages, stop_reason, text):
    fake_messages.stop_reason = stop_reason
    original = fake_messages.create

    def create(**kwargs):
        resp = original(**kwargs)
        resp.content[0].text = text
        return resp

    fake_messages.create = create
    with pytest.raises(GenerationError) as exc:
        generate_deck(_settings(), "Biology", "Cells", "pdf", [PDF], "balanced")
    assert exc.value.usage is not None and exc.value.usage.total_tokens == 15
