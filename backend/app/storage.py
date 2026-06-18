"""Supabase Storage uploads for source files (ADR 0007 §6).

Uploaded study material lands in a **private** Supabase Storage bucket, keyed
``{user_id}/{source_id}/{n}-{filename}``. The backend authenticates to Storage with the
**service-role** credential (server-side only — never shipped to a client); a client that
needs to read a file back is later handed a short-lived signed URL.

The :class:`Storage` protocol keeps the generation path testable: the route depends on
``get_storage()``, which returns a real :class:`SupabaseStorage` when configured and
``None`` otherwise (local dev / tests without a Storage project, where a source is still
persisted with empty ``storage_paths``). Tests inject a fake via FastAPI dependency
override. Uploads are best-effort-bounded by the existing per-file/total caps in the
``/v1/generate`` handler — this module just writes already-validated bytes.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Protocol, runtime_checkable

import httpx

from .config import Settings
from .generation import UploadedFile

logger = logging.getLogger(__name__)

# Conservative object-key segment: strip anything outside this set so a hostile filename
# can't inject path segments or odd bytes into the Storage key.
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    cleaned = _SAFE_NAME.sub("_", name).strip("._") or "file"
    return cleaned[:128]


@runtime_checkable
class Storage(Protocol):
    def upload_source_files(
        self, user_id: uuid.UUID, source_id: uuid.UUID, files: list[UploadedFile]
    ) -> list[str]:
        """Upload each file and return the created object keys, in order."""
        ...


class StorageError(Exception):
    """An upload failed. Surfaced to the client as a generic 502 (no upstream detail)."""


class SupabaseStorage:
    """Storage backed by the Supabase Storage REST API and the service-role key."""

    def __init__(self, settings: Settings) -> None:
        self._base = settings.supabase_url.rstrip("/")
        self._bucket = settings.supabase_storage_bucket
        self._key = settings.supabase_service_role_key

    def upload_source_files(
        self, user_id: uuid.UUID, source_id: uuid.UUID, files: list[UploadedFile]
    ) -> list[str]:
        keys: list[str] = []
        headers = {
            "Authorization": f"Bearer {self._key}",
            "apikey": self._key,
            # Overwrite on retry of the same (user, source, file) so a re-run is idempotent.
            "x-upsert": "true",
        }
        with httpx.Client(timeout=30.0) as client:
            for i, f in enumerate(files):
                key = f"{user_id}/{source_id}/{i:03d}-{_safe_filename(f.filename)}"
                url = f"{self._base}/storage/v1/object/{self._bucket}/{key}"
                try:
                    resp = client.post(
                        url,
                        headers={**headers, "Content-Type": f.content_type},
                        content=f.data,
                    )
                    resp.raise_for_status()
                except httpx.HTTPError as e:
                    # Log the real reason server-side; the route returns a generic message.
                    logger.warning("Storage upload failed for %s: %s", key, e)
                    raise StorageError("Could not store the uploaded file.") from e
                keys.append(key)
        return keys


def get_storage(settings: Settings) -> Storage | None:
    """A real Storage client when Supabase Storage is configured (URL + service-role key),
    else ``None`` — callers persist the source with empty ``storage_paths`` in that case."""
    if settings.supabase_url and settings.supabase_service_role_key:
        return SupabaseStorage(settings)
    return None
