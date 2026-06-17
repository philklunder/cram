"""The single Claude call for short-answer grading: question + model answer + student
response -> score + feedback (ADR 0006).

One server-side text call to claude-sonnet-4-6 (no vision, no files). Mirrors generation.py:
same SDK client reuse, the same client-safe error mapping (raw upstream text never leaks),
and structured output re-validated with Pydantic. Multiple-choice is graded on-device and
never reaches here.
"""

from __future__ import annotations

import json
import logging

import anthropic

from .config import Settings
from .generation import GenerationError, _get_client
from .prompt import GRADING_SYSTEM_PROMPT, build_grading_user_text
from .schemas import GRADE_JSON_SCHEMA, GRADE_PASS_THRESHOLD, GradeResult

log = logging.getLogger("cram.grading")

# Grading output is tiny (a number + a sentence or two); keep the cap small.
MAX_OUTPUT_TOKENS = 1000


def grade_answer(
    settings: Settings,
    prompt: str,
    model_answer: str,
    response: str,
    topic: str,
) -> dict:
    """Grade one short-answer response. Returns a GradeResult dump (score, feedback,
    is_correct). Raises GenerationError (client-safe message) on any upstream failure."""
    client = _get_client(settings.anthropic_api_key)
    user_text = build_grading_user_text(prompt, model_answer, response, topic)

    try:
        resp = client.messages.create(
            model=settings.model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=GRADING_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": [{"type": "text", "text": user_text}]}],
            output_config={"format": {"type": "json_schema", "schema": GRADE_JSON_SCHEMA}},
        )
    except anthropic.APIStatusError as e:
        log.warning(
            "Claude API error %s (request_id=%s): %s",
            e.status_code, getattr(e, "request_id", None), getattr(e, "message", e),
        )
        if e.status_code == 429:
            raise GenerationError("The service is busy right now. Please try again shortly.") from e
        raise GenerationError("Grading is temporarily unavailable. Please try again later.") from e
    except anthropic.APIConnectionError as e:
        log.warning("Claude API connection error: %s", e)
        raise GenerationError("Could not reach the grading service.") from e

    u = resp.usage
    log.info("grading ok: input=%s output=%s", u.input_tokens, u.output_tokens)

    if resp.stop_reason == "refusal":
        raise GenerationError("The model declined to grade this answer.")

    text = next((b.text for b in resp.content if b.type == "text"), None)
    if not text:
        raise GenerationError("The model returned no content.")

    try:
        data = json.loads(text)
        # Clamp before validation: the structured-output schema can't express a 0..1 range,
        # so guard against a stray out-of-range score rather than 502-ing the user.
        if isinstance(data, dict) and isinstance(data.get("score"), (int, float)):
            data["score"] = min(1.0, max(0.0, float(data["score"])))
        result = GradeResult.model_validate(data)
    except (json.JSONDecodeError, ValueError) as e:
        log.warning("malformed grade from model: %s", e)
        raise GenerationError("The model returned malformed grade data.") from e

    # is_correct is a server-side decision, not the model's (ADR 0006).
    result.is_correct = result.score >= GRADE_PASS_THRESHOLD
    return result.model_dump()
