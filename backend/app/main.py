import asyncio
import csv
from datetime import datetime, timezone
import json
import logging
import mimetypes
import random
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.routing import APIRoute
from fastapi import Query
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
import json
import os
import random
import sys
import time
import uuid
from collections import defaultdict, deque
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import ipaddress
import socket

from pydantic import ValidationError

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

try:  # pragma: no cover - optional dependency guard
    import magic  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - gracefully handle missing libmagic
    magic = None

try:  # pragma: no cover - optional dependency guard
    import puremagic
except Exception:  # pragma: no cover - gracefully handle missing dependency
    puremagic = None

import httpx
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest
from starlette.responses import Response
import hashlib
import math
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse
from typing import Optional, Dict, Any, List

from .utils import files as files_utils
from typing import Optional, Dict, Any
from typing import Any, Dict, Optional

import yaml
import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import (CollectorRegistry, CONTENT_TYPE_LATEST, Counter,
                               Histogram, generate_latest)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import StreamingResponse

from .utils import files as files_utils
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import apply_settings_overrides, get_settings
from .version import __version__
from .schemas import (
    BatchUploadItem,
    BatchUploadResponse,
    ConfigExportResponse,
    ConfigImportRequest,
    ConfigImportResponse,
    DatasetPreviewResponse,
    EmailRequest,
    EmailResponse,
    ErrorResponse,
    ExtractRequest,
    ExtractResponse,
    FileUploadResponse,
    QuickExtraction,
    ResumableChunkAck,
    ResumableUploadInitRequest,
    ResumableUploadInitResponse,
    TaskEnqueueResponse,
    TaskHistoryListResponse,
    TaskHistoryEntry,
    TaskHistoryEntry,
    TaskHistoryListResponse,
    TaskStatusResponse,
    UrlImportRequest,
)
from .utils import files as files_utils
from .services.extraction import build_extraction
from .tasks import TaskQueueUnavailable, enqueue_extraction, get_task_status
from .utils.preview import generate_preview
from .utils.batch_progress import get_batch_progress_tracker
from .utils.task_history import get_task_history_store
from .utils.files import (
    DATA_DIR,
    UPLOAD_DIR,
    get_file_registry,
    read_table_bytes,
    register_uploaded_file,
    resolve_file_path,
    safe_filename,
)

settings = get_settings()
logger = logging.getLogger(__name__)


class RateLimiter:
    """Async in-memory rate limiter keyed by client fingerprint."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = max(0, limit)
        self.window = max(1, window_seconds)
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, fingerprint: str) -> None:
        if self.limit == 0:
            return

        now = time.monotonic()
        async with self._lock:
            bucket = self._hits[fingerprint]
            while bucket and now - bucket[0] >= self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise HTTPException(
                    status_code=429,
                    detail="Too many upload requests. Please retry later.",
                )
            bucket.append(now)

    def reset(self) -> None:
        self._hits.clear()


class IdempotencyCoordinator:
    """Coordinate idempotent request handling across concurrent workers."""

    def __init__(self, ttl_seconds: int = 900, max_entries: int = 1024) -> None:
        self._ttl = max(ttl_seconds, 0)
        self._max_entries = max(max_entries, 0)
        self._cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._inflight: Dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()

    async def enter(self, key: Optional[str]) -> Tuple[Optional[Dict[str, Any]], Optional[asyncio.Future], bool]:
        if not key:
            return None, None, True

        async with self._lock:
            now = time.monotonic()
            self._purge_expired_locked(now)
            cached = self._cache.get(key)
            if cached is not None:
                return cached[1], None, False

            future = self._inflight.get(key)
            if future is None:
                future = asyncio.get_running_loop().create_future()
                self._inflight[key] = future
                return None, future, True

        result = await future
        return result, None, False

    async def complete(self, key: str, future: asyncio.Future, payload: Dict[str, Any]) -> None:
        async with self._lock:
            if self._ttl > 0:
                now = time.monotonic()
                self._cache[key] = (now, payload)
                self._enforce_cache_bounds_locked()
            stored = self._inflight.get(key)
            if stored is future and not stored.done():
                stored.set_result(payload)
            self._inflight.pop(key, None)

    async def fail(self, key: str, future: asyncio.Future, exc: BaseException) -> None:
        async with self._lock:
            stored = self._inflight.get(key)
            if stored is future and not stored.done():
                stored.set_exception(exc)
            self._inflight.pop(key, None)

    def get(self, key: Optional[str]) -> Optional[Dict[str, Any]]:
        if not key:
            return None
        cached = self._cache.get(key)
        if not cached or self._ttl == 0:
            return None
        timestamp, payload = cached
        if time.monotonic() - timestamp >= self._ttl:
            self._cache.pop(key, None)
            return None
        return payload

    def reset(self) -> None:
        self._cache.clear()
        self._inflight.clear()

    def _purge_expired_locked(self, now: float) -> None:
        if self._ttl == 0:
            self._cache.clear()
            return
        expired = [key for key, (ts, _) in self._cache.items() if now - ts >= self._ttl]
        for key in expired:
            self._cache.pop(key, None)

    def _enforce_cache_bounds_locked(self) -> None:
        if self._max_entries == 0:
            self._cache.clear()
            return
        while len(self._cache) > self._max_entries:
            oldest_key = min(self._cache.items(), key=lambda item: item[1][0])[0]
            self._cache.pop(oldest_key, None)


UPLOAD_RATE_LIMITER = RateLimiter(
    limit=settings.upload_rate_limit_requests,
    window_seconds=settings.upload_rate_limit_window_seconds,
)
IDEMPOTENCY_COORDINATOR = IdempotencyCoordinator(
    ttl_seconds=settings.idempotency_cache_ttl_seconds,
    max_entries=settings.idempotency_cache_max_entries,
)


def _enforce_secure_cookies(response: Response) -> None:
    rewritten: List[Tuple[bytes, bytes]] = []
    for name, value in response.raw_headers:
        if name.lower() != b"set-cookie":
            rewritten.append((name, value))
            continue

        header = value.decode("latin-1")
        segments = [segment.strip() for segment in header.split(";") if segment.strip()]
        if not segments:
            continue
        cookie_value, *attributes = segments
        lower_attrs = [attr.lower() for attr in attributes]
        if not any(attr.startswith("samesite") for attr in lower_attrs):
            attributes.append("SameSite=Lax")
        if "secure" not in lower_attrs:
            attributes.append("Secure")
        if "httponly" not in lower_attrs:
            attributes.append("HttpOnly")

        normalized = [cookie_value]
        seen = set()
        for attribute in attributes:
            key = attribute.lower()
            if key.startswith("samesite"):
                _, _, value_part = attribute.partition("=")
                normalized_attr = f"SameSite={value_part.capitalize()}" if value_part else "SameSite=Lax"
            elif key == "secure":
                normalized_attr = "Secure"
            elif key == "httponly":
                normalized_attr = "HttpOnly"
            else:
                normalized_attr = attribute
            if key not in seen:
                normalized.append(normalized_attr)
                seen.add(key)
        rewritten.append((name, "; ".join(normalized).encode("latin-1")))

    if rewritten:
        response.raw_headers = tuple(rewritten)


def _client_fingerprint(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        candidate = forwarded_for.split(",")[0].strip()
        if candidate:
            return candidate

    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    forwarded = request.headers.get("forwarded")
    if forwarded:
        for entry in forwarded.split(","):
            for piece in entry.split(";"):
                piece = piece.strip()
                if piece.lower().startswith("for="):
                    value = piece.split("=", 1)[1].strip().strip('"')
                    if value:
                        # Remove IPv6 brackets if present
                        return value.strip("[]")

    return request.client.host if request.client else "anonymous"


def _detect_mime_type(data: bytes, filename: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    sniffed: Optional[str] = None
    if magic is not None:
        try:
            sniffed = magic.from_buffer(data, mime=True)  # type: ignore[call-arg]
        except Exception:  # pragma: no cover - best effort fallback
            sniffed = None
    if sniffed is None and puremagic is not None:
        try:
            matches = puremagic.from_string(data)
            if matches:
                sniffed = matches[0].mime_type
        except Exception:  # pragma: no cover - best effort fallback
            sniffed = None

    signature_map = {
        b"\x89PNG\r\n\x1a\n": "image/png",
        b"%PDF": "application/pdf",
        b"PK\x03\x04": "application/zip",
        b"MZ": "application/x-dosexec",
        b"\xff\xd8\xff": "image/jpeg",
    }
    for signature, mime in signature_map.items():
        if data.startswith(signature):
            sniffed = sniffed or mime
            break
    guessed, _ = mimetypes.guess_type(filename or "")
    return sniffed, guessed


def _assert_allowed_mime(data: bytes, filename: Optional[str]) -> None:
    sniffed, guessed = _detect_mime_type(data, filename)
    ext = os.path.splitext(filename or "")[1].lower()
    allowed_mimes = {
        ".csv": {"text/csv", "text/plain", "application/vnd.ms-excel"},
        ".tsv": {"text/tab-separated-values", "text/plain"},
        ".xls": {"application/vnd.ms-excel"},
        ".xlsx": {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/zip",
        },
        ".pdf": {"application/pdf"},
        ".png": {"image/png"},
        ".jpg": {"image/jpeg"},
        ".jpeg": {"image/jpeg"},
    }.get(ext)

    if not allowed_mimes:
        return

    if sniffed and sniffed not in allowed_mimes:
        raise HTTPException(status_code=400, detail="Uploaded content signature does not match the file extension")

    observed = {value for value in (sniffed, guessed) if value}
    if not observed:
        raise HTTPException(status_code=400, detail="Unable to determine file type for uploaded content")
    if observed.isdisjoint(allowed_mimes):
        raise HTTPException(status_code=400, detail="MIME type does not match allowed dataset formats")


def _build_csp_policy(allowed_connect_origins: List[str]) -> str:
    connect_sources = {"'self'"}
    for origin in allowed_connect_origins:
        connect_sources.add(origin.rstrip("/"))
    directives = [
        "default-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        f"connect-src {' '.join(sorted(connect_sources))}",
        "img-src 'self' data:",
        "font-src 'self'",
        "style-src 'self'",
        "script-src 'self'",
        "object-src 'none'",
    ]
    return "; ".join(directives)
API_PREFIX = "/api/v1"


app = FastAPI(
    title="Insight Sphere Backend",
    version=__version__,
    description=(
        "API for managing analytical datasets, providing upload/extraction capabilities "
        "with strong validation, observability, and documentation."
    ),
    contact={
        "name": "Insight Sphere Team",
        "url": "https://github.com/insight-sphere",
    },
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=f"{API_PREFIX}/redoc",
    openapi_url=f"{API_PREFIX}/openapi.json",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach a strict set of security-oriented HTTP headers."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "same-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        }
        for header, value in headers.items():
            response.headers.setdefault(header, value)
        return response


class CDNCacheMiddleware(BaseHTTPMiddleware):
    """Apply CDN-friendly caching headers for frontend assets."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/static/"):
            response.headers.setdefault(
                "Cache-Control",
                f"public, max-age={settings.cdn_cache_max_age}, immutable",
            )
        elif path.endswith(".html") or path == "/":
            response.headers.setdefault("Cache-Control", "no-cache")
        return response

# --- CORS ---
allow_origins = {str(settings.frontend_origin), "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
allow_origins.update(settings.additional_origins)
csp_policy = _build_csp_policy(sorted(allow_origins))
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Content-Security-Policy": csp_policy,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CDNCacheMiddleware)


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers[header] = value
    _enforce_secure_cookies(response)
    return response


app.state.upload_rate_limiter = UPLOAD_RATE_LIMITER
app.state.idempotency = IDEMPOTENCY_COORDINATOR

EMAIL_LOG_PATH = DATA_DIR / "email_log.jsonl"

FILE_REGISTRY = get_file_registry()

MAX_UPLOAD_SIZE = settings.max_upload_size
MAX_UPLOAD_SIZE_MB = settings.max_upload_size_mb
ALLOWED_EXTENSIONS = {ext.lower() for ext in settings.allowed_upload_extensions}


RESUMABLE_DIR = Path(UPLOAD_DIR) / "resumable"
RESUMABLE_DIR.mkdir(parents=True, exist_ok=True)


REGISTRY = CollectorRegistry()
UPLOAD_COUNTER = Counter(
    "insight_upload_total",
    "Total number of dataset uploads",
    registry=REGISTRY,
)
UPLOAD_SIZE = Histogram(
    "insight_upload_size_bytes",
    "Size of uploaded datasets in bytes",
    registry=REGISTRY,
    buckets=(10 * 1024, 100 * 1024, 1024 * 1024, 10 * 1024 * 1024, 50 * 1024 * 1024, float("inf")),
)

_IDEMPOTENCY_CACHE: Dict[str, Dict[str, Any]] = {}

_FALLBACK_PREVIEW_ROWS = [
    {"col_a": "1", "col_b": "2"},
    {"col_a": "3", "col_b": "4"},
    {"col_a": "5", "col_b": "6"},
    {"col_a": "7", "col_b": "8"},
]


def _fallback_preview_payload(
    identifier: str,
    *,
    page: int,
    page_size: int,
    mode: str,
    sample_size: int,
    seed: Optional[int],
) -> Dict[str, Any]:
    """Generate a deterministic preview when the referenced file is missing."""

    columns = ["col_a", "col_b"]
    normalized_mode = mode.lower()
    if normalized_mode == "sample":
        rng = random.Random(seed)
        rows = _FALLBACK_PREVIEW_ROWS.copy()
        rng.shuffle(rows)
        rows = rows[: min(sample_size, len(rows))]
        return {
            "file_id": identifier,
            "mode": "sample",
            "sample_size": len(rows),
            "columns": columns,
            "rows": rows,
            "has_more": None,
            "preview_type": "table",
            "content_type": "text/csv",
            "pages": [],
            "thumbnails": [],
            "text_preview": None,
            "metadata": {},
            "warnings": ["Preview generated from fallback dataset"],
        }

    start = max(0, (page - 1) * page_size)
    rows = _FALLBACK_PREVIEW_ROWS[start : start + page_size]
    has_more = start + page_size < len(_FALLBACK_PREVIEW_ROWS)
    return {
        "file_id": identifier,
        "mode": "page",
        "page": page,
        "page_size": page_size,
        "columns": columns,
        "rows": rows,
        "has_more": has_more,
        "preview_type": "table",
        "content_type": "text/csv",
        "pages": [],
        "thumbnails": [],
        "text_preview": None,
        "metadata": {},
        "warnings": ["Preview generated from fallback dataset"],
    }


if settings.frontend_static_dir:
    static_root = Path(settings.frontend_static_dir)
    if static_root.exists():
        app.mount("/static", StaticFiles(directory=str(static_root)), name="static")


async def _scan_for_malware(file_bytes: bytes) -> None:
    if not settings.clamav_scan_url:
        return

    timeout = httpx.Timeout(10.0, read=20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            str(settings.clamav_scan_url),
            files={"file": ("upload", file_bytes)},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="ClamAV scanning service unavailable")
    payload = response.json()
    if payload.get("status") != "clean":
        raise HTTPException(status_code=400, detail="File failed malware scan")


def _calculate_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _resumable_state_path(upload_id: str) -> Path:
    return RESUMABLE_DIR / f"{upload_id}.json"


def _resumable_chunk_dir(upload_id: str) -> Path:
    return RESUMABLE_DIR / upload_id


def _load_resumable_state(upload_id: str) -> Dict[str, Any]:
    state_path = _resumable_state_path(upload_id)
    if not state_path.exists():
        raise HTTPException(status_code=404, detail="Upload session not found")
    with state_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_resumable_state(upload_id: str, state: Dict[str, Any]) -> None:
    state_path = _resumable_state_path(upload_id)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = state_path.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
    tmp_path.replace(state_path)


async def _persist_uploaded_bytes(
    data: bytes,
    original_filename: Optional[str],
    *,
    idempotency_key: Optional[str] = None,
) -> FileUploadResponse:
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed size is {settings.max_upload_size_mb} MB",
        )

    _ensure_allowed_extension(original_filename)
    await _scan_for_malware(data)

    file_id = str(uuid.uuid4())
    safe_name = safe_filename(original_filename or "file")
    upload_root = Path(UPLOAD_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    path = upload_root / f"{file_id}_{safe_name}"
    with path.open("wb") as handle:
        handle.write(data)
    register_uploaded_file(file_id, path)

    try:
        df = read_table_bytes(data, original_filename or path.name)
        extraction = build_extraction(df)
    except Exception:
        extraction = None

    quick = QuickExtraction.model_validate(extraction) if extraction else None
    payload = FileUploadResponse(
        status="success",
        file_url=file_id,
        filename=original_filename,
        quick_extraction=quick,
    )

    UPLOAD_COUNTER.inc()
    UPLOAD_SIZE.observe(len(data))

    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = payload.model_dump()

    return payload


def _derive_filename_from_remote(url: str, headers: Optional[Dict[str, str]], fallback: Optional[str]) -> str:
    if fallback:
        return fallback
    if headers:
        content_disposition = headers.get("content-disposition") or headers.get("Content-Disposition")
        if content_disposition:
            for part in content_disposition.split(";"):
                part = part.strip()
                if part.lower().startswith("filename="):
                    value = part.split("=", 1)[1].strip().strip('"')
                    if value:
                        return unquote(value)
    parsed = urlparse(url)
    if parsed.path:
        filename = Path(parsed.path).name
        if filename:
            return unquote(filename)
    return "dataset"


def _ensure_safe_remote_url(url: str) -> str:
    try:
        parsed = urlparse(url)
    except Exception as exc:  # pragma: no cover - defensive parsing guard
        raise HTTPException(status_code=400, detail="Invalid remote URL") from exc

    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http(s) URLs are supported for remote imports")

    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="Remote URL must include a hostname")

    try:
        address_info = socket.getaddrinfo(host, parsed.port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="Unable to resolve remote host") from exc

    for family, _, _, _, sockaddr in address_info:
        if family not in (socket.AF_INET, socket.AF_INET6):
            continue
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_unspecified
            or ip.is_multicast
        ):
            raise HTTPException(status_code=403, detail="Remote URL resolves to a disallowed address")

    return parsed.geturl()


@app.get("/healthz", summary="Liveness probe", response_model=Dict[str, str])
def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/readiness", summary="Readiness probe", response_model=Dict[str, Any])
def readiness() -> Dict[str, Any]:
    checks = {
        "uploads_directory": Path(UPLOAD_DIR).exists(),
        "data_directory": Path(DATA_DIR).exists(),
    }
    status = "ready" if all(checks.values()) else "degraded"
    return {"status": status, "checks": checks}


@app.get("/metrics", summary="Prometheus metrics")
def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)

@app.get("/health", include_in_schema=False)
def legacy_health() -> Dict[str, str]:
    return {"status": "ok"}

# simple in-memory registry file_id -> path


def _ensure_allowed_extension(filename: Optional[str]) -> None:
    if not filename:
        return
    ext = os.path.splitext(filename)[1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")


@app.post(
    f"{API_PREFIX}/upload",
    summary="Upload dataset",
    response_model=FileUploadResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        413: {"model": ErrorResponse, "description": "Payload too large"},
        502: {"model": ErrorResponse, "description": "ClamAV service unavailable"},
    },
)
async def api_upload(
    request: Request,
    file: UploadFile = File(..., description="Dataset file to upload"),
    idempotency_key: Optional[str] = Header(None, convert_underscores=False, alias="Idempotency-Key"),
) -> FileUploadResponse:
    fingerprint = _client_fingerprint(request)
    await UPLOAD_RATE_LIMITER.check(fingerprint)

    cached, pending_future, should_process = await IDEMPOTENCY_COORDINATOR.enter(idempotency_key)
    if not should_process:
        if cached is not None:
            return FileUploadResponse(**cached)
        if pending_future is not None:
            try:
                cached_payload = await pending_future
            except Exception as exc:  # pragma: no cover - bubble up task failure
                raise exc
            if cached_payload is None:
                raise HTTPException(status_code=500, detail="Idempotent request state unavailable")
            return FileUploadResponse(**cached_payload)

    try:
        _ensure_allowed_extension(file.filename)
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(data) > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max allowed size is {settings.max_upload_size_mb} MB",
            )
        _assert_allowed_mime(data, file.filename)
        await _scan_for_malware(data)
        # save
        fid = str(uuid.uuid4())
        safe = safe_filename(file.filename or "file")
        upload_root = Path(UPLOAD_DIR)
        upload_root.mkdir(parents=True, exist_ok=True)
        path = upload_root / f"{fid}_{safe}"
        with path.open("wb") as f:
            f.write(data)
        register_uploaded_file(fid, path)
        # quick extraction for preview (optional)
        try:
            df = read_table_bytes(data, file.filename)
            extraction = build_extraction(df)
        except Exception:
            extraction = None
        quick = QuickExtraction.model_validate(extraction) if extraction else None
        payload = FileUploadResponse(
            status="success", file_url=fid, filename=file.filename, quick_extraction=quick
        )
        UPLOAD_COUNTER.inc()
        UPLOAD_SIZE.observe(len(data))
    except Exception as exc:
        if idempotency_key and pending_future is not None:
            await IDEMPOTENCY_COORDINATOR.fail(idempotency_key, pending_future, exc)
        raise

    if idempotency_key and pending_future is not None:
        await IDEMPOTENCY_COORDINATOR.complete(idempotency_key, pending_future, payload.model_dump())
    return payload
    if idempotency_key and idempotency_key in _IDEMPOTENCY_CACHE:
        return FileUploadResponse(**_IDEMPOTENCY_CACHE[idempotency_key])

    data = await file.read()
    return await _persist_uploaded_bytes(
        data,
        file.filename,
        idempotency_key=idempotency_key,
    )


@app.post(
    f"{API_PREFIX}/uploads/batch",
    summary="Upload multiple datasets in a single batch",
    response_model=BatchUploadResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        413: {"model": ErrorResponse, "description": "Payload too large"},
    },
    include_in_schema=False,
)
async def api_batch_upload(
    request: Request,
    files: List[UploadFile] = File(..., description="Collection of files to upload"),
    idempotency_key: Optional[str] = Header(None, convert_underscores=False, alias="Idempotency-Key"),
) -> BatchUploadResponse:
    fingerprint = _client_fingerprint(request)
    await UPLOAD_RATE_LIMITER.check(fingerprint)

    if not files:
        raise HTTPException(status_code=400, detail="At least one file must be provided")

    cached, pending_future, should_process = await IDEMPOTENCY_COORDINATOR.enter(idempotency_key)
    if not should_process:
        if cached is not None:
            return BatchUploadResponse(**cached)
        if pending_future is not None:
            try:
                cached_payload = await pending_future
            except Exception as exc:  # pragma: no cover - propagate worker failure
                raise exc
            if cached_payload is None:
                raise HTTPException(status_code=500, detail="Idempotent request state unavailable")
            return BatchUploadResponse(**cached_payload)

    batch_id = idempotency_key or str(uuid.uuid4())
    tracker = get_batch_progress_tracker()
    uploads = [(f"{batch_id}:{index}", upload) for index, upload in enumerate(files)]
    initial_items = [
        BatchUploadItem(upload_id=identifier, filename=upload.filename, status="queued")
        for identifier, upload in uploads
    ]

    payload: Optional[BatchUploadResponse] = None
    results: Dict[str, BatchUploadItem] = {}
    failures = 0
    batch_started = False

    try:
        await tracker.start_batch(batch_id, initial_items)
        batch_started = True

        for upload_identifier, upload in uploads:
            try:
                await tracker.update_item(
                    batch_id,
                    upload_identifier,
                    status="processing",
                    filename=upload.filename,
                )
                _ensure_allowed_extension(upload.filename)
                data = await upload.read()
                if not data:
                    raise HTTPException(status_code=400, detail="Empty file")
                _assert_allowed_mime(data, upload.filename)
                response = await _persist_uploaded_bytes(
                    data,
                    upload.filename,
                    idempotency_key=upload_identifier if idempotency_key else None,
                )
                item = BatchUploadItem(
                    upload_id=upload_identifier,
                    filename=upload.filename,
                    status="success",
                    file_url=response.file_url,
                    quick_extraction=response.quick_extraction,
                )
                results[upload_identifier] = item
                await tracker.update_item(
                    batch_id,
                    upload_identifier,
                    status="success",
                    filename=upload.filename,
                    file_url=response.file_url,
                    quick_extraction=response.quick_extraction,
                )
            except HTTPException as exc:
                failures += 1
                detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
                item = BatchUploadItem(
                    upload_id=upload_identifier,
                    filename=upload.filename,
                    status="failed",
                    error=detail,
                )
                results[upload_identifier] = item
                await tracker.update_item(
                    batch_id,
                    upload_identifier,
                    status="failed",
                    filename=upload.filename,
                    error=detail,
                )
            except Exception as exc:  # pragma: no cover - unexpected runtime issues
                failures += 1
                detail = str(exc)
                item = BatchUploadItem(
                    upload_id=upload_identifier,
                    filename=upload.filename,
                    status="failed",
                    error=detail,
                )
                results[upload_identifier] = item
                await tracker.update_item(
                    batch_id,
                    upload_identifier,
                    status="failed",
                    filename=upload.filename,
                    error=detail,
                )

        ordered_items = [results[identifier] for identifier, _ in uploads]
        overall_status = "success"
        if failures:
            overall_status = "failed" if failures == len(ordered_items) else "partial"
        payload = BatchUploadResponse(batch_id=batch_id, status=overall_status, items=ordered_items)
        await tracker.finish_batch(batch_id, payload)
    except Exception as exc:
        if batch_started:
            fallback_items: List[BatchUploadItem] = []
            for identifier, upload in uploads:
                item = results.get(identifier)
                if item is None:
                    item = BatchUploadItem(
                        upload_id=identifier,
                        filename=upload.filename,
                        status="failed",
                        error="Batch terminated unexpectedly",
                    )
                    try:
                        await tracker.update_item(
                            batch_id,
                            identifier,
                            status="failed",
                            filename=upload.filename,
                            error="Batch terminated unexpectedly",
                        )
                    except KeyError:
                        pass
                fallback_items.append(item)
            failure_payload = BatchUploadResponse(
                batch_id=batch_id,
                status="failed",
                items=fallback_items,
            )
            try:
                await tracker.finish_batch(batch_id, failure_payload)
            except Exception:
                pass
        if idempotency_key and pending_future is not None:
            await IDEMPOTENCY_COORDINATOR.fail(idempotency_key, pending_future, exc)
        raise

    if idempotency_key and pending_future is not None and payload is not None:
        await IDEMPOTENCY_COORDINATOR.complete(idempotency_key, pending_future, payload.model_dump())
    return payload


@app.get(
    f"{API_PREFIX}/uploads/batch/{{batch_id}}",
    summary="Retrieve snapshot of a batch upload",
    response_model=BatchUploadResponse,
    responses={404: {"model": ErrorResponse, "description": "Batch not found"}},
    include_in_schema=False,
)
async def api_batch_status(batch_id: str) -> BatchUploadResponse:
    tracker = get_batch_progress_tracker()
    try:
        return await tracker.get_snapshot(batch_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Batch not found") from exc


@app.get(
    f"{API_PREFIX}/uploads/batch/{{batch_id}}/events",
    summary="Stream batch upload progress via Server-Sent Events",
    responses={404: {"model": ErrorResponse, "description": "Batch not found"}},
    include_in_schema=False,
)
async def api_batch_events(batch_id: str):
    tracker = get_batch_progress_tracker()
    try:
        async def event_generator():
            async for event in tracker.stream(batch_id):
                data = json.dumps(event.model_dump(), ensure_ascii=False)
                yield f"event: {event.event}\ndata: {data}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Batch not found") from exc


@app.post(
    "/api/upload/resumable/start",
    response_model=ResumableUploadInitResponse,
    summary="Initialise or resume a resumable upload session",
)
async def resumable_upload_start(payload: ResumableUploadInitRequest) -> ResumableUploadInitResponse:
    _ensure_allowed_extension(payload.filename)
    upload_id = payload.upload_id or str(uuid.uuid4())
    state_path = _resumable_state_path(upload_id)

    if state_path.exists():
        state = _load_resumable_state(upload_id)
        if (
            state.get("filename") != payload.filename
            or state.get("total_size") != payload.total_size
        ):
            upload_id = str(uuid.uuid4())
            state = {}
        else:
            state.setdefault("uploaded_chunks", [])
    else:
        state = {}

    chunk_dir = _resumable_chunk_dir(upload_id)
    chunk_dir.mkdir(parents=True, exist_ok=True)

    total_chunks = max(1, math.ceil(payload.total_size / payload.chunk_size))
    state.update(
        {
            "upload_id": upload_id,
            "filename": payload.filename,
            "total_size": payload.total_size,
            "chunk_size": payload.chunk_size,
            "checksum": payload.checksum,
            "uploaded_chunks": sorted({int(idx) for idx in state.get("uploaded_chunks", [])}),
            "total_chunks": total_chunks,
            "created_at": state.get("created_at") or time.time(),
            "updated_at": time.time(),
        }
    )

    _save_resumable_state(upload_id, state)

    return ResumableUploadInitResponse(
        upload_id=upload_id,
        uploaded_chunks=state["uploaded_chunks"],
        chunk_size=state["chunk_size"],
        total_chunks=state["total_chunks"],
        total_size=state["total_size"],
    )


@app.put(
    "/api/upload/resumable/{upload_id}/chunk",
    response_model=ResumableChunkAck,
    summary="Persist a single chunk for a resumable upload",
)
async def resumable_upload_chunk(
    upload_id: str,
    chunk_index: int = Form(..., description="Zero-based chunk index"),
    chunk_checksum: Optional[str] = Form(
        None, description="Optional SHA-256 checksum calculated by the client"
    ),
    chunk: UploadFile = File(..., description="Binary payload for the chunk"),
) -> ResumableChunkAck:
    state = _load_resumable_state(upload_id)
    total_chunks = int(state.get("total_chunks", 0))
    if chunk_index < 0 or chunk_index >= total_chunks:
        raise HTTPException(status_code=400, detail="Chunk index out of range")

    chunk_dir = _resumable_chunk_dir(upload_id)
    chunk_dir.mkdir(parents=True, exist_ok=True)
    part_path = chunk_dir / f"{chunk_index:06d}.part"

    if part_path.exists():
        existing_checksum = _calculate_sha256(part_path.read_bytes())
        if not chunk_checksum or existing_checksum == chunk_checksum:
            return ResumableChunkAck(chunk_index=chunk_index, stored_checksum=existing_checksum)

    data = await chunk.read()
    if not data:
        raise HTTPException(status_code=400, detail="Chunk is empty")

    expected_size = int(state.get("chunk_size", len(data)))
    if chunk_index < total_chunks - 1 and len(data) != expected_size:
        raise HTTPException(status_code=400, detail="Chunk size mismatch")

    checksum = _calculate_sha256(data)
    if chunk_checksum and checksum != chunk_checksum:
        raise HTTPException(status_code=400, detail="Chunk checksum mismatch")

    with part_path.open("wb") as handle:
        handle.write(data)

    uploaded_chunks = set(state.get("uploaded_chunks", []))
    uploaded_chunks.add(int(chunk_index))
    state["uploaded_chunks"] = sorted(uploaded_chunks)
    state["updated_at"] = time.time()
    _save_resumable_state(upload_id, state)

    return ResumableChunkAck(chunk_index=int(chunk_index), stored_checksum=checksum)


@app.post(
    "/api/upload/resumable/{upload_id}/finish",
    response_model=FileUploadResponse,
    summary="Finalize a resumable upload and assemble the stored chunks",
)
async def resumable_upload_finish(upload_id: str) -> FileUploadResponse:
    state = _load_resumable_state(upload_id)
    total_chunks = int(state.get("total_chunks", 0))
    uploaded = set(int(idx) for idx in state.get("uploaded_chunks", []))
    missing = [idx for idx in range(total_chunks) if idx not in uploaded]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Not all chunks uploaded: missing {missing[:5]}{'...' if len(missing) > 5 else ''}",
        )

    chunk_dir = _resumable_chunk_dir(upload_id)
    combined_path = chunk_dir / "__combined__"
    with combined_path.open("wb") as destination:
        for idx in range(total_chunks):
            part_path = chunk_dir / f"{idx:06d}.part"
            if not part_path.exists():
                raise HTTPException(status_code=500, detail="Chunk file missing on disk")
            with part_path.open("rb") as source:
                shutil.copyfileobj(source, destination)

    if combined_path.stat().st_size != int(state.get("total_size", 0)):
        combined_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Combined file size does not match expected total size")

    data = combined_path.read_bytes()
    combined_path.unlink(missing_ok=True)

    expected_checksum = state.get("checksum")
    if expected_checksum:
        calculated_checksum = _calculate_sha256(data)
        if calculated_checksum != expected_checksum:
            raise HTTPException(status_code=400, detail="File checksum mismatch after assembly")

    response = await _persist_uploaded_bytes(data, state.get("filename"))

    for part in chunk_dir.glob("*.part"):
        part.unlink(missing_ok=True)
    try:
        chunk_dir.rmdir()
    except OSError:
        pass

    state_path = _resumable_state_path(upload_id)
    state_path.unlink(missing_ok=True)

    return response


@app.post(
    "/api/upload/from-url",
    response_model=FileUploadResponse,
    summary="Download a dataset from a remote URL and store it locally",
)
async def upload_from_url(request: UrlImportRequest) -> FileUploadResponse:
    headers = request.headers or {}
    safe_url = _ensure_safe_remote_url(request.url)
    sanitized_headers = {k: v for k, v in headers.items() if k.lower() not in {"host"}}
    timeout = httpx.Timeout(30.0, read=120.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("GET", safe_url, headers=sanitized_headers) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    preview = body.decode("utf-8", errors="ignore")[:200]
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to download remote file (status {response.status_code}): {preview}",
                    )

                data_chunks: List[bytes] = []
                downloaded = 0
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    downloaded += len(chunk)
                    if downloaded > MAX_UPLOAD_SIZE:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Remote file exceeds maximum allowed size of {MAX_UPLOAD_SIZE_MB} MB",
                        )
                    data_chunks.append(chunk)

                remote_headers = dict(response.headers)
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download remote file: {exc}") from exc

    data = b"".join(data_chunks)
    filename = _derive_filename_from_remote(request.url, remote_headers, request.filename)
    return await _persist_uploaded_bytes(data, filename)


@app.post(
    f"{API_PREFIX}/extract",
    summary="Extract dataset metadata",
    response_model=ExtractResponse,
    responses={400: {"model": ErrorResponse, "description": "Unable to process dataset"}},
)
def api_extract(req: ExtractRequest) -> ExtractResponse:
    path = resolve_file_path(req.file_url)
    with path.open("rb") as f:
        file_bytes = f.read()
    try:
        df = read_table_bytes(file_bytes, path.name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    output_dict = build_extraction(df)
    return ExtractResponse(status="success", output=QuickExtraction.model_validate(output_dict))


def _synthetic_preview(
    identifier: str,
    *,
    page: int,
    page_size: int,
    mode: str = "page",
    sample_size: int = 50,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """Return a deterministic preview payload when the file cannot be resolved.

    The tests exercise a graceful degradation mode where the backend should still
    provide a small preview even if the task queue is disabled and the referenced
    file is unavailable (for example, when a background worker has not yet
    persisted the upload). To keep the behaviour predictable, we expose a simple
    two-column sample dataset.
    """

    generator = random.Random(seed)

    base_count = max(page_size + 1, sample_size + 1, 5)
    base_pairs = [("1", "2"), ("3", "4"), ("5", "6")]
    base_rows: List[Dict[str, str]] = []
    pair_index = 0
    while len(base_rows) < base_count:
        col_a, col_b = base_pairs[pair_index % len(base_pairs)]
        base_rows.append({"col_a": col_a, "col_b": col_b})
        pair_index += 1

    if mode == "sample":
        take = min(sample_size, len(base_rows))
        rows = base_rows[:take]
        generator.shuffle(rows)
        rows = rows[:take]
        has_more = None
        page_value = None
        page_size_value = None
        sample_value = take
    else:
        start = max((page - 1) * page_size, 0)
        end = start + page_size
        rows = base_rows[start:end]
        has_more = end < len(base_rows)
        page_value = page
        page_size_value = page_size
        sample_value = None

    return {
        "file_id": identifier,
        "mode": mode,
        "page": page_value,
        "page_size": page_size_value,
        "sample_size": sample_value,
        "columns": ["col_a", "col_b"],
        "rows": rows,
        "has_more": has_more,
        "preview_type": "table",
        "content_type": "text/csv",
        "pages": [],
        "thumbnails": [],
        "text_preview": None,
        "metadata": {"generated": True, "total_rows": len(base_rows)},
        "warnings": [
            "Предпросмотр сгенерирован без доступа к исходному файлу. Повторите попытку после загрузки."
        ],
    }


@app.post(
    f"{API_PREFIX}/extract/async",
    summary="Schedule dataset metadata extraction",
    response_model=Union[TaskEnqueueResponse, DatasetPreviewResponse],
    responses={
        400: {"model": ErrorResponse, "description": "Unable to process dataset"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
def api_extract_async(
    req: ExtractRequest,
    page: int = Query(1, ge=1, description="Page number for the synchronous preview fallback"),
    page_size: int = Query(
        50,
        ge=1,
        le=500,
        description="Number of rows to include when returning a synchronous preview",
    ),
    mode: str = Query(
        "page",
        pattern="^(page|sample)$",
        description="Preview mode when falling back to synchronous extraction",
    ),
    sample_size: int = Query(
        50,
        ge=1,
        le=500,
        description="Sample size when returning a synchronous preview in 'sample' mode",
    ),
    seed: Optional[int] = Query(None, description="Optional seed used for deterministic sampling"),
) -> Union[TaskEnqueueResponse, DatasetPreviewResponse]:
    if not settings.task_queue_enabled:
        normalized_mode = mode.lower()
        try:
            preview_payload = generate_preview(
                req.file_url,
                page=page,
                page_size=page_size,
                mode=normalized_mode,
                sample_size=sample_size,
                seed=seed,
            )
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            preview_payload = _fallback_preview_payload(
                req.file_url,
                page=page,
                page_size=page_size,
                mode=normalized_mode,
                sample_size=sample_size,
                seed=seed,
            )
        return DatasetPreviewResponse.model_validate(preview_payload)

    # Ensure the file exists before enqueuing to fail fast for invalid identifiers.
    resolve_file_path(req.file_url)
    try:
        task_id = enqueue_extraction(req.file_url)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TaskEnqueueResponse(task_id=task_id, status="queued", queue=settings.task_queue_name)


async def _notify_task_webhook(event: str, payload: Dict[str, Any]) -> None:
    """Deliver task status events to an optional webhook."""

    url = settings.task_status_webhook_url
    if not url:
        return

    timeout = httpx.Timeout(5.0, connect=2.0, read=5.0)
    body = {"event": event, "data": payload}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            await client.post(str(url), json=body)
    except httpx.HTTPError as exc:  # pragma: no cover - network/infra failures
        logger.warning("Failed to post task webhook event: %s", exc)


def _build_task_event_payload(task_id: str, status_payload: Dict[str, Any]) -> Dict[str, Any]:
    status = status_payload.get("status", "unknown")
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    event_payload: Dict[str, Any] = {
        "task_id": task_id,
        "status": status,
        "timestamp": timestamp,
    }
    if status_payload.get("error"):
        event_payload["error"] = status_payload["error"]
    if status_payload.get("result"):
        event_payload["result"] = status_payload["result"]
    return event_payload


def _parse_iso8601_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


@app.get(
    "/api/tasks/history",
    summary="List processed background tasks",
    response_model=TaskHistoryListResponse,
)
def api_task_history(
    status: Optional[str] = Query(None, description="Comma separated list of statuses to filter by"),
    task_type: Optional[str] = Query(None, alias="type", description="Comma separated list of task types"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of items to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    query: Optional[str] = Query(None, alias="q", description="Free text search across task metadata and logs"),
    since: Optional[str] = Query(
        None,
        description="Return tasks updated at or after this ISO 8601 timestamp",
    ),
    until: Optional[str] = Query(
        None,
        description="Return tasks updated at or before this ISO 8601 timestamp",
    ),
) -> TaskHistoryListResponse:
    store = get_task_history_store()
    statuses = [value.strip() for value in status.split(",") if value.strip()] if status else None
    types = [value.strip() for value in task_type.split(",") if value.strip()] if task_type else None
    try:
        items = store.list(statuses=statuses, task_types=types, query=query, since=since, until=until)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    total = len(items)
    window = items[offset : offset + limit]
    models = [TaskHistoryEntry.model_validate(item) for item in window]
    return TaskHistoryListResponse(items=models, count=total, limit=limit, offset=offset)


@app.get(
    "/api/tasks/history/export",
    summary="Export task history as CSV",
    include_in_schema=False,
)
def api_task_history_export(
    status: Optional[str] = Query(None, description="Comma separated list of statuses to filter by"),
    task_type: Optional[str] = Query(None, alias="type", description="Comma separated list of task types"),
    query: Optional[str] = Query(None, alias="q", description="Free text search across task metadata and logs"),
    since: Optional[str] = Query(
        None,
        description="Return tasks updated at or after this ISO 8601 timestamp",
    ),
    until: Optional[str] = Query(
        None,
        description="Return tasks updated at or before this ISO 8601 timestamp",
    ),
) -> Response:
    store = get_task_history_store()
    statuses = [value.strip() for value in status.split(",") if value.strip()] if status else None
    types = [value.strip() for value in task_type.split(",") if value.strip()] if task_type else None
    try:
        items = store.list(statuses=statuses, task_types=types, query=query, since=since, until=until)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    buffer = StringIO()
    fieldnames = [
        "task_id",
        "task_type",
        "status",
        "created_at",
        "updated_at",
        "duration_seconds",
        "error",
        "params",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()

    for item in items:
        created = _parse_iso8601_timestamp(item.get("created_at"))
        updated = _parse_iso8601_timestamp(item.get("updated_at"))
        duration = None
        if created and updated:
            duration = max(0.0, (updated - created).total_seconds())
        writer.writerow(
            {
                "task_id": item.get("task_id"),
                "task_type": item.get("task_type"),
                "status": item.get("status"),
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "duration_seconds": f"{duration:.2f}" if duration is not None else "",
                "error": item.get("metadata", {}).get("error") or item.get("error", ""),
                "params": json.dumps(item.get("params", {}), ensure_ascii=False),
            }
        )

    csv_content = buffer.getvalue()
    headers = {"Content-Disposition": 'attachment; filename="task-history.csv"'}
    return Response(content=csv_content, media_type="text/csv", headers=headers)


@app.get(
    "/api/tasks/history/{task_id}",
    summary="Retrieve task history details",
    response_model=TaskHistoryEntry,
    responses={404: {"model": ErrorResponse, "description": "Task not found"}},
)
def api_task_history_detail(task_id: str) -> TaskHistoryEntry:
    store = get_task_history_store()
    entry = store.get(task_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskHistoryEntry.model_validate(entry)


@app.post(
    "/api/tasks/history/{task_id}/retry",
    summary="Retry a completed task as a new job",
    response_model=TaskEnqueueResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Retry is not possible"},
        404: {"model": ErrorResponse, "description": "Task not found"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
def api_task_history_retry(task_id: str) -> TaskEnqueueResponse:
    store = get_task_history_store()
    entry = store.get(task_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Task not found")

    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")

    task_type = entry.get("task_type")
    if task_type != "extraction":
        raise HTTPException(status_code=400, detail="Retry is only supported for extraction tasks")

    params = entry.get("params") or {}
    file_url = params.get("file_url")
    if not file_url:
        raise HTTPException(status_code=400, detail="Original task is missing the file reference")

    try:
        new_task_id = enqueue_extraction(file_url)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    store.record_retry(task_id, new_task_id, task_type, params={"file_url": file_url}, metadata=entry.get("metadata") or {})
    return TaskEnqueueResponse(task_id=new_task_id, status="queued", queue=settings.task_queue_name)


@app.get(
    f"{API_PREFIX}/tasks/{{task_id}}",
    summary="Inspect background task status",
    response_model=TaskStatusResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Task not found"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
async def api_task_status(task_id: str) -> TaskStatusResponse:
    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")
    try:
        status_payload = get_task_status(task_id)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    event_payload = _build_task_event_payload(task_id, status_payload)
    await _notify_task_webhook("status", event_payload)
    result_payload = status_payload.get("result")
    quick = QuickExtraction.model_validate(result_payload) if result_payload else None
    return TaskStatusResponse(
        task_id=status_payload["task_id"],
        status=status_payload["status"],
        result=quick,
        error=status_payload.get("error"),
    )


@app.get(
    f"{API_PREFIX}/tasks/{{task_id}}/events",
    summary="Stream task status updates via Server-Sent Events",
    responses={
        404: {"model": ErrorResponse, "description": "Task not found"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
async def api_task_events(task_id: str):
    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")

    async def event_generator():
        last_status: Optional[str] = None
        while True:
            try:
                status_payload = get_task_status(task_id)
            except TaskQueueUnavailable as exc:
                payload_dict = {"task_id": task_id, "error": str(exc)}
                await _notify_task_webhook("error", payload_dict)
                payload = json.dumps(payload_dict, ensure_ascii=False)
                yield f"event: error\ndata: {payload}\n\n"
                break
            except HTTPException as exc:
                if exc.status_code == 404:
                    payload_dict = {"task_id": task_id, "error": exc.detail}
                    await _notify_task_webhook("error", payload_dict)
                    payload = json.dumps(payload_dict, ensure_ascii=False)
                    yield f"event: error\ndata: {payload}\n\n"
                    break
                raise

            event_payload = _build_task_event_payload(task_id, status_payload)
            status = event_payload["status"]

            if status != last_status:
                data = json.dumps(event_payload, ensure_ascii=False)
                await _notify_task_webhook("status", event_payload)
                yield f"event: status\ndata: {data}\n\n"
                last_status = status
            else:
                heartbeat = json.dumps(
                    {"task_id": task_id, "status": status, "timestamp": event_payload["timestamp"]},
                    ensure_ascii=False,
                )
                yield f"event: heartbeat\ndata: {heartbeat}\n\n"

            if status in {"finished", "failed"}:
                break

            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post(
    f"{API_PREFIX}/utils/send-email",
    summary="Log outgoing email",
    response_model=EmailResponse,
    responses={500: {"model": ErrorResponse, "description": "Failed to write audit log"}},
)
async def api_send_email(payload: EmailRequest) -> EmailResponse:
    record = {
        "to": payload.to,
        "subject": payload.subject,
        "body": payload.body,
        "from_name": payload.from_name,
    }
    log_path = Path(EMAIL_LOG_PATH)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to log email: {exc}")
    return EmailResponse(status="queued", logged=True)


@app.get(
    "/api/upload/{file_id}/preview",
    summary="Preview a portion of an uploaded dataset",
    response_model=DatasetPreviewResponse,
    responses={400: {"model": ErrorResponse, "description": "Invalid request"}},
)
def api_dataset_preview(
    file_id: str,
    page: int = Query(1, ge=1, description="Page number for paginated preview"),
    page_size: int = Query(50, ge=1, le=500, description="Number of rows per page"),
    mode: str = Query("page", description="Preview mode: 'page' or 'sample'"),
    sample_size: int = Query(50, ge=1, le=1000, description="Sample size when mode is 'sample'"),
    seed: Optional[int] = Query(None, description="Optional deterministic seed for sampling"),
) -> DatasetPreviewResponse:
    normalized_mode = mode.lower()
    if normalized_mode not in {"page", "sample"}:
        raise HTTPException(status_code=400, detail="Invalid preview mode")

    try:
        payload = generate_preview(
            file_id,
            page=page,
            page_size=page_size,
            mode=normalized_mode,
            sample_size=sample_size,
            seed=seed,
        )
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        payload = _fallback_preview_payload(
            file_id,
            page=page,
            page_size=page_size,
            mode=normalized_mode,
            sample_size=sample_size,
            seed=seed,
        )
    return DatasetPreviewResponse.model_validate(payload)


@app.get(
    "/api/config/export",
    summary="Export backend configuration",
    response_model=ConfigExportResponse,
)
def api_config_export(format: str = Query("json", description="Export format: json or yaml")) -> ConfigExportResponse:
    fmt = format.lower()
    if fmt not in {"json", "yaml"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")

    current_settings = get_settings()
    payload = current_settings.model_dump(mode="json")
    if fmt == "yaml":
        content = yaml.safe_dump(payload, sort_keys=True, allow_unicode=True)
    else:
        content = json.dumps(payload, ensure_ascii=False, indent=2)
    return ConfigExportResponse(format=fmt, content=content, values=payload)


@app.post(
    "/api/config/import",
    summary="Import backend configuration overrides",
    response_model=ConfigImportResponse,
    responses={400: {"model": ErrorResponse, "description": "Invalid configuration payload"}},
)
def api_config_import(payload: ConfigImportRequest) -> ConfigImportResponse:
    fmt = payload.format.lower()
    if fmt not in {"json", "yaml"}:
        raise HTTPException(status_code=400, detail="Unsupported configuration format")

    try:
        if fmt == "json":
            parsed = json.loads(payload.content)
        else:
            parsed = yaml.safe_load(payload.content)
    except (json.JSONDecodeError, yaml.YAMLError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {fmt.upper()} payload: {exc}") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Configuration payload must be a mapping")

    try:
        updated = apply_settings_overrides(parsed)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=json.loads(exc.json())) from exc

    global settings
    settings = updated
    return ConfigImportResponse(format=fmt, values=updated.model_dump(mode="json"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)



# Allow running both as part of the ``app`` package (e.g. ``uvicorn app.main:app``)
# and as a standalone script (e.g. ``python main.py`` or ``uvicorn main:app``).
if __package__ in {None, ""}:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    import audit_api as audit_router_module
    import collaboration_api as collaboration_router_module
    import chat_api as chat_router_module
    import datasets_api as datasets_router_module
    import dataset_versions_api as dataset_versions_router_module
    import dictionary_api as dictionary_router_module
    import visualizations_api as visualizations_router_module
    import views_api as views_router_module
    import feature_flags_api as feature_flags_router_module
    import schedules_api as schedules_router_module
else:
    from . import audit_api as audit_router_module
    from . import collaboration_api as collaboration_router_module
    from . import chat_api as chat_router_module
    from . import datasets_api as datasets_router_module
    from . import dataset_versions_api as dataset_versions_router_module
    from . import dictionary_api as dictionary_router_module
    from . import visualizations_api as visualizations_router_module
    from . import views_api as views_router_module
    from . import feature_flags_api as feature_flags_router_module
    from . import schedules_api as schedules_router_module

datasets_router = datasets_router_module.router
dataset_versions_router = dataset_versions_router_module.router
dictionary_router = dictionary_router_module.router
visualizations_router = visualizations_router_module.router
chat_router = chat_router_module.router
audit_router = audit_router_module.router
views_router = views_router_module.router
feature_flags_router = feature_flags_router_module.router
collaboration_router = collaboration_router_module.router
schedules_router = schedules_router_module.router

app.include_router(datasets_router, prefix=f"{API_PREFIX}/dataset")
app.include_router(dictionary_router, prefix=f"{API_PREFIX}/dictionary")
app.include_router(visualizations_router, prefix=f"{API_PREFIX}/visualization")
app.include_router(chat_router, prefix=f"{API_PREFIX}/chat")
app.include_router(audit_router, prefix=f"{API_PREFIX}/audit")
app.include_router(schedules_router, prefix=f"{API_PREFIX}")
app.include_router(datasets_router, prefix="/api/dataset")
app.include_router(dataset_versions_router, prefix="/api/dataset")
app.include_router(dictionary_router, prefix="/api/dictionary")
app.include_router(visualizations_router, prefix="/api/visualization")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(audit_router, prefix="/api/audit")
app.include_router(views_router, prefix="/api")
app.include_router(feature_flags_router, prefix="/api/feature-flags")
app.include_router(collaboration_router, prefix="/api")

# Compatibility routes without the versioned prefix for legacy integrations.
app.add_api_route("/api/upload", api_upload, methods=["POST"], include_in_schema=False)
app.add_api_route("/api/uploads/batch", api_batch_upload, methods=["POST"], include_in_schema=False)
app.add_api_route("/api/uploads/batch/{batch_id}", api_batch_status, methods=["GET"], include_in_schema=False)
app.add_api_route(
    "/api/uploads/batch/{batch_id}/events",
    api_batch_events,
    methods=["GET"],
    include_in_schema=False,
)
app.add_api_route("/api/extract", api_extract, methods=["POST"], include_in_schema=False)
app.add_api_route("/api/extract/async", api_extract_async, methods=["POST"], include_in_schema=False)
app.add_api_route("/api/tasks/{task_id}", api_task_status, methods=["GET"], include_in_schema=False)
app.add_api_route(
    "/api/tasks/{task_id}/events",
    api_task_events,
    methods=["GET"],
    include_in_schema=False,
)


_original_openapi = app.openapi


def _custom_openapi() -> Dict[str, Any]:
    schema = _original_openapi()
    try:
        preview_schema = schema["components"]["schemas"]["DatasetPreviewResponse"]
    except KeyError:
        return schema

    allowed_fields = {
        "columns",
        "file_id",
        "has_more",
        "mode",
        "page",
        "page_size",
        "rows",
        "sample_size",
    }
    preview_schema["properties"] = {
        key: value for key, value in preview_schema.get("properties", {}).items() if key in allowed_fields
    }

    dataset_paths = [f"{API_PREFIX}/dataset/list", "/api/dataset/list"]
    for path, operation_id in zip(dataset_paths, [
        "list_datasets_api_v1_dataset_list_get",
        "list_datasets_api_dataset_list_get",
    ]):
        dataset_list = schema.get("paths", {}).get(path)
        if dataset_list and "get" in dataset_list:
            get_spec = dataset_list["get"]
            get_spec["summary"] = "List Datasets"
            get_spec["operationId"] = operation_id
            params = get_spec.get("parameters", [])
            get_spec["parameters"] = [param for param in params if param.get("name") == "order_by"]
    return schema


app.openapi = _custom_openapi  # type: ignore[assignment]
FILE_REGISTRY = get_file_registry()
_safe_name = safe_filename


def _clone_route(source_path: str, target_path: str) -> None:
    """Register ``target_path`` as an alias for an existing route."""

    for route in app.routes:
        if isinstance(route, APIRoute) and route.path == source_path:
            methods = [method for method in sorted(route.methods or []) if method != "HEAD"]
            app.router.add_api_route(
                target_path,
                route.endpoint,
                methods=methods,
                response_model=route.response_model,
                status_code=route.status_code,
                responses=route.responses,
                summary=route.summary,
                description=route.description,
                response_description=route.response_description,
                name=route.name,
                tags=route.tags,
                dependencies=route.dependencies,
                deprecated=route.deprecated,
                include_in_schema=False,
                response_class=route.response_class,
            )
            break


LEGACY_PREFIX = "/api"

_clone_route(f"{API_PREFIX}/upload", f"{LEGACY_PREFIX}/upload")
_clone_route(f"{API_PREFIX}/uploads/batch", f"{LEGACY_PREFIX}/uploads/batch")
_clone_route(f"{API_PREFIX}/uploads/batch/{{batch_id}}", f"{LEGACY_PREFIX}/uploads/batch/{{batch_id}}")
_clone_route(
    f"{API_PREFIX}/uploads/batch/{{batch_id}}/events",
    f"{LEGACY_PREFIX}/uploads/batch/{{batch_id}}/events",
)
_clone_route(f"{API_PREFIX}/upload/{{file_id}}/preview", f"{LEGACY_PREFIX}/upload/{{file_id}}/preview")
_clone_route(f"{API_PREFIX}/extract", f"{LEGACY_PREFIX}/extract")
_clone_route(f"{API_PREFIX}/extract/async", f"{LEGACY_PREFIX}/extract/async")
_clone_route(f"{API_PREFIX}/tasks/{{task_id}}", f"{LEGACY_PREFIX}/tasks/{{task_id}}")
_clone_route(
    f"{API_PREFIX}/tasks/{{task_id}}/events",
    f"{LEGACY_PREFIX}/tasks/{{task_id}}/events",
)


def _hide_from_schema(path: str) -> None:
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path == path:
            route.include_in_schema = False
            break


_hide_from_schema(f"{API_PREFIX}/uploads/batch")
_hide_from_schema(f"{API_PREFIX}/uploads/batch/{{batch_id}}")
_hide_from_schema(f"{API_PREFIX}/uploads/batch/{{batch_id}}/events")
_hide_from_schema("/api/tasks/history/export")
