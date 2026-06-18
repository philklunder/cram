"""The single Claude call: material (PDF/image) -> structured deck JSON.

One server-side call to claude-sonnet-4-6 (ADR 0005, ADR 0003 amendment). No auth,
no database — that is v0.5. The Claude API key is read from the environment by the
SDK and never leaves the server.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass

import anthropic

from .config import Settings
from .prompt import SYSTEM_PROMPT, build_user_text
from .schemas import DECK_JSON_SCHEMA, GeneratedDeck

log = logging.getLogger("cram.generation")

# Image media types Claude vision accepts. HEIC (common from iOS) is NOT supported
# by the API and must be converted client-side or sent as JPEG.
IMAGE_MEDIA_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
PDF_MEDIA_TYPE = "application/pdf"

MAX_OUTPUT_TOKENS = 8000

# Reuse one SDK client across requests (cheaper than constructing per call).
_client: anthropic.Anthropic | None = None


def _get_client(api_key: str) -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


class GenerationError(Exception):
    """Surfaced to the client as a non-2xx response with a message (ADR 0005).

    Messages on this exception are client-safe by construction — we never put raw
    upstream error text (which can leak account/billing state) into them.
    """


@dataclass
class UploadedFile:
    filename: str
    content_type: str
    data: bytes


@dataclass(frozen=True)
class TokenUsage:
    """Token cost of one Claude call, surfaced so the route can meter it against the spend
    cap (Phase 4, ADR 0009). Cache tokens are folded into the billed input total."""

    input_tokens: int
    output_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @classmethod
    def from_usage(cls, u) -> "TokenUsage":  # noqa: ANN001 — SDK Usage object
        # cache_creation/​cache_read are billed input tokens too; count them so the cap
        # reflects real spend (a cache write costs ~1.25x a normal input token).
        cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
        cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
        return cls(
            input_tokens=(u.input_tokens or 0) + cache_write + cache_read,
            output_tokens=u.output_tokens or 0,
        )


def _content_block(file: UploadedFile) -> dict:
    b64 = base64.standard_b64encode(file.data).decode("ascii")
    ct = (file.content_type or "").lower()
    if ct == PDF_MEDIA_TYPE:
        return {
            "type": "document",
            "source": {"type": "base64", "media_type": PDF_MEDIA_TYPE, "data": b64},
        }
    if ct in IMAGE_MEDIA_TYPES:
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": ct, "data": b64},
        }
    raise GenerationError(
        f"Unsupported file type '{file.content_type}' for '{file.filename}'. "
        "Supported: PDF, JPEG, PNG, GIF, WebP. (HEIC must be converted to JPEG.)"
    )


def generate_deck(
    settings: Settings,
    subject_name: str,
    title: str,
    kind: str,
    files: list[UploadedFile],
) -> tuple[dict, TokenUsage]:
    """Generate a deck and return ``(deck_dict, TokenUsage)`` — the caller meters the token
    usage against the spend cap (Phase 4) and persists the deck."""
    if not files:
        raise GenerationError("No files supplied.")

    client = _get_client(settings.anthropic_api_key)

    content: list[dict] = [{"type": "text", "text": build_user_text(subject_name, title, kind)}]
    content.extend(_content_block(f) for f in files)

    # Prompt caching (automatic): a single top-level cache_control places the breakpoint
    # on the last cacheable block (system + text + files), so the whole prefix is cached.
    # On a repeat request with the SAME material within the 5-min TTL (e.g. a retry, or
    # testing one fixture) the cached prefix is read back. NOTE: in production each upload
    # differs, so reads are rare and this mainly pays the ~1.25x write premium — kept as a
    # dev/retry win. Watch cache_write / cache_read in the usage log below.
    try:
        resp = client.messages.create(
            model=settings.model,
            max_tokens=MAX_OUTPUT_TOKENS,
            cache_control={"type": "ephemeral"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            output_config={"format": {"type": "json_schema", "schema": DECK_JSON_SCHEMA}},
        )
    except anthropic.APIStatusError as e:
        # Log the full upstream detail server-side; return a generic, client-safe message.
        log.warning(
            "Claude API error %s (request_id=%s): %s",
            e.status_code, getattr(e, "request_id", None), getattr(e, "message", e),
        )
        if e.status_code == 429:
            raise GenerationError("The service is busy right now. Please try again shortly.") from e
        raise GenerationError("Generation is temporarily unavailable. Please try again later.") from e
    except anthropic.APIConnectionError as e:
        log.warning("Claude API connection error: %s", e)
        raise GenerationError("Could not reach the generation service.") from e

    u = resp.usage
    log.info(
        "generation ok: input=%s output=%s cache_write=%s cache_read=%s",
        u.input_tokens, u.output_tokens,
        getattr(u, "cache_creation_input_tokens", 0), getattr(u, "cache_read_input_tokens", 0),
    )

    if resp.stop_reason == "refusal":
        raise GenerationError("The model declined to generate from this material.")

    text = next((b.text for b in resp.content if b.type == "text"), None)
    if not text:
        raise GenerationError("The model returned no content.")

    try:
        data = json.loads(text)
        deck = GeneratedDeck.model_validate(data)
    except (json.JSONDecodeError, ValueError) as e:
        log.warning("malformed deck from model: %s", e)
        raise GenerationError("The model returned malformed deck data.") from e

    return deck.model_dump(), TokenUsage.from_usage(u)
