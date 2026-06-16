"""Runtime configuration, read once from the environment.

The Claude API key is server-side only (ADR 0005): it is read here from the
environment (loaded from a gitignored ``.env`` in development) and never leaves
the backend.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str
    model: str
    shared_secret: str
    max_files: int
    max_file_bytes: int
    max_total_bytes: int
    max_field_chars: int


def load_settings() -> Settings:
    return Settings(
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        model=os.environ.get("CRAM_MODEL", "claude-sonnet-4-6"),
        # Optional. When set, every /v1/generate call must send it in X-Cram-Secret.
        # When unset, the endpoint serves loopback clients only (see main.require_access).
        shared_secret=os.environ.get("CRAM_SHARED_SECRET", ""),
        max_files=int(os.environ.get("CRAM_MAX_FILES", "20")),
        max_file_bytes=int(os.environ.get("CRAM_MAX_FILE_BYTES", str(32 * 1024 * 1024))),
        max_total_bytes=int(os.environ.get("CRAM_MAX_TOTAL_BYTES", str(32 * 1024 * 1024))),
        # Cap on each free-text form field (subject_name / title / kind), in characters.
        max_field_chars=int(os.environ.get("CRAM_MAX_FIELD_CHARS", "4096")),
    )
