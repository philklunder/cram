"""Cram backend — FastAPI app.

Endpoints: POST /v1/generate (multipart material -> deck JSON, ADR 0005) and POST
/v1/grade (short-answer -> score + feedback, ADR 0006). As of v0.5 both are gated by
Supabase JWT auth (ADR 0007 §2) — see app/auth.py. Persistence + per-user data endpoints
land in Phase 3.
"""

from __future__ import annotations

import logging
import mimetypes

from dotenv import load_dotenv

load_dotenv()  # load .env before reading settings

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from .auth import CurrentUser, get_current_user  # noqa: E402
from .config import get_settings  # noqa: E402
from .db import db_status  # noqa: E402
from .generation import GenerationError, UploadedFile, generate_deck  # noqa: E402
from .grading import grade_answer  # noqa: E402
from .schemas import GradeRequest  # noqa: E402

logging.basicConfig(level=logging.INFO)
settings = get_settings()

# Fail closed in production (ADR 0007 §2/§3): without configured JWT auth the only gate
# is the dev loopback fallback, which is unsafe behind a same-host reverse proxy. So in
# production Supabase JWT auth is mandatory; refuse to start without it.
if settings.is_production and not settings.auth_configured:
    raise RuntimeError(
        "Supabase JWT auth must be configured when CRAM_ENV=prod: set SUPABASE_JWKS_URL "
        "(preferred) or SUPABASE_JWT_SECRET. The dev loopback fallback fails open behind "
        "a reverse proxy and is refused in production."
    )
# The dev fallback must never be enabled in production — it would bypass auth entirely.
if settings.is_production and settings.allow_dev_fallback:
    raise RuntimeError(
        "CRAM_ALLOW_DEV_FALLBACK must not be set when CRAM_ENV=prod: it serves loopback "
        "requests as a fixed dev user, bypassing authentication."
    )

# Upload read granularity for the per-file streaming size check (see /v1/generate).
_UPLOAD_CHUNK_BYTES = 1 << 20  # 1 MiB

app = FastAPI(title="Cram backend", version="0.5")


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """Reject oversized requests before the body is buffered into memory/disk.

    Content-Length can be absent (chunked) or spoofed, so the per-file/total caps in
    the handler remain as defense-in-depth; this just stops the obvious large-body case
    cheaply. For real deployments, also cap the body at a reverse proxy.
    """
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > settings.max_total_bytes + (1 << 20):  # +1 MiB multipart overhead
                return JSONResponse({"detail": "Request too large."}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
    return await call_next(request)


@app.get("/healthz")
def healthz() -> dict:
    # "db": "ok" | "unreachable" | "not_configured" (Phase 0 — see app/db.py).
    return {
        "ok": True,
        "model": settings.model,
        "key_configured": bool(settings.anthropic_api_key),
        "db": db_status(),
    }


def _resolve_content_type(file: UploadFile) -> str:
    """Trust the client-set content type (ADR 0005); fall back to the extension."""
    if file.content_type and file.content_type != "application/octet-stream":
        return file.content_type
    guessed, _ = mimetypes.guess_type(file.filename or "")
    return guessed or "application/octet-stream"


@app.post("/v1/generate")
async def generate(
    subject_name: str = Form(...),
    title: str = Form(...),
    kind: str = Form(...),
    files: list[UploadFile] = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    # current_user authorizes the call; the generated deck becomes owned by it in Phase 3.
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=500, detail="Server is missing ANTHROPIC_API_KEY.")

    # Cap free-text fields (H3): file caps don't cover form text, which also becomes tokens.
    for name, value in (("subject_name", subject_name), ("title", title), ("kind", kind)):
        if len(value) > settings.max_field_chars:
            raise HTTPException(status_code=413, detail=f"Field '{name}' is too long.")
    if kind not in ("pdf", "photo"):
        raise HTTPException(status_code=422, detail="Field 'kind' must be 'pdf' or 'photo'.")

    if len(files) > settings.max_files:
        raise HTTPException(status_code=413, detail=f"Too many files (max {settings.max_files}).")

    uploads: list[UploadedFile] = []
    total = 0
    for f in files:
        # Read incrementally and abort as soon as a cap is exceeded, so a chunked-encoding
        # upload (which bypasses the Content-Length middleware) can't buffer an unbounded
        # body — memory is bounded to ~max_file_bytes per file (M1 hardening).
        buf = bytearray()
        while chunk := await f.read(_UPLOAD_CHUNK_BYTES):
            buf.extend(chunk)
            if len(buf) > settings.max_file_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File '{f.filename}' exceeds the {settings.max_file_bytes} byte limit.",
                )
            if total + len(buf) > settings.max_total_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Total upload exceeds the {settings.max_total_bytes} byte limit.",
                )
        total += len(buf)
        uploads.append(
            UploadedFile(
                filename=f.filename or "upload",
                content_type=_resolve_content_type(f),
                data=bytes(buf),
            )
        )

    try:
        return generate_deck(settings, subject_name, title, kind, uploads)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/v1/grade")
async def grade(
    body: GradeRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Grade one short-answer response against its model answer (ADR 0006).

    JSON in, JSON out — no files. Multiple-choice is graded on-device and never sent here.
    The recorded attempt becomes owned by current_user in Phase 3.
    """
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=500, detail="Server is missing ANTHROPIC_API_KEY.")

    # Cap free-text fields (same rationale as /v1/generate: form text becomes tokens too).
    # The student's `response` is untrusted; an empty response is allowed (grades to 0).
    for name, value in (
        ("prompt", body.prompt),
        ("model_answer", body.model_answer),
        ("response", body.response),
        ("topic", body.topic),
    ):
        if len(value) > settings.max_field_chars:
            raise HTTPException(status_code=413, detail=f"Field '{name}' is too long.")
    if not body.prompt.strip() or not body.model_answer.strip():
        raise HTTPException(
            status_code=422, detail="Fields 'prompt' and 'model_answer' must not be empty."
        )

    try:
        return grade_answer(settings, body.prompt, body.model_answer, body.response, body.topic)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
