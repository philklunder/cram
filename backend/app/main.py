"""Cram v0.3 generation backend — FastAPI app.

A single endpoint, POST /v1/generate, exactly per docs/adr/0005-generation-api-contract.md:
multipart material in -> deck JSON out. No database yet (ADR 0003 amendment); access is
gated by a shared secret (or loopback-only when no secret is set). Revisit auth at v0.5.
"""

from __future__ import annotations

import logging
import mimetypes
import secrets

from dotenv import load_dotenv

load_dotenv()  # load .env before reading settings

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from .config import load_settings  # noqa: E402
from .generation import GenerationError, UploadedFile, generate_deck  # noqa: E402

logging.basicConfig(level=logging.INFO)
settings = load_settings()

# Fail closed in production (H1): the loopback-only access fallback trusts the socket
# peer, which a same-host reverse proxy makes always read as 127.0.0.1 — silently
# opening the endpoint. So in production a shared secret is mandatory; refuse to start
# without one rather than serve unauthenticated traffic.
if settings.is_production and not settings.shared_secret:
    raise RuntimeError(
        "CRAM_SHARED_SECRET must be set when CRAM_ENV=prod. The loopback-only fallback "
        "is dev-only and fails open behind a reverse proxy. Generate one with: "
        'python -c "import secrets; print(secrets.token_urlsafe(32))"'
    )

app = FastAPI(title="Cram generation backend", version="0.3")

_LOOPBACK = {"127.0.0.1", "::1"}


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
    return {"ok": True, "model": settings.model, "key_configured": bool(settings.anthropic_api_key)}


def require_access(request: Request, x_cram_secret: str = Header(default="")) -> None:
    """Gate the endpoint (H1).

    - If CRAM_SHARED_SECRET is set, every request must present it in X-Cram-Secret.
    - If it is not set, only loopback clients are served — so the endpoint is never
      reachable unauthenticated from the LAN/internet. Set the secret before exposing
      it to a device or deploying.

    The loopback fallback is a DEV convenience only: it trusts the socket peer, which a
    same-host reverse proxy reads as 127.0.0.1. Production therefore requires the secret,
    enforced by the startup guard above (this branch is unreachable when CRAM_ENV=prod).
    """
    if settings.shared_secret:
        if not secrets.compare_digest(x_cram_secret, settings.shared_secret):
            raise HTTPException(status_code=401, detail="Unauthorized.")
        return
    client_host = request.client.host if request.client else ""
    if client_host not in _LOOPBACK:
        raise HTTPException(
            status_code=401,
            detail="Set CRAM_SHARED_SECRET on the server to allow non-loopback access.",
        )


def _resolve_content_type(file: UploadFile) -> str:
    """Trust the client-set content type (ADR 0005); fall back to the extension."""
    if file.content_type and file.content_type != "application/octet-stream":
        return file.content_type
    guessed, _ = mimetypes.guess_type(file.filename or "")
    return guessed or "application/octet-stream"


@app.post("/v1/generate", dependencies=[Depends(require_access)])
async def generate(
    subject_name: str = Form(...),
    title: str = Form(...),
    kind: str = Form(...),
    files: list[UploadFile] = File(...),
) -> dict:
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
        data = await f.read()
        total += len(data)
        if len(data) > settings.max_file_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File '{f.filename}' exceeds the {settings.max_file_bytes} byte limit.",
            )
        if total > settings.max_total_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Total upload exceeds the {settings.max_total_bytes} byte limit.",
            )
        uploads.append(
            UploadedFile(
                filename=f.filename or "upload",
                content_type=_resolve_content_type(f),
                data=data,
            )
        )

    try:
        return generate_deck(settings, subject_name, title, kind, uploads)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
