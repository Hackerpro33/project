from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
import json
import sys
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional

import yaml
import httpx
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, CollectorRegistry, generate_latest

from .config import apply_settings_overrides, get_settings
from .utils import files as files_utils
from .schemas import (
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
    TaskHistoryEntry,
    TaskHistoryListResponse,
    TaskEnqueueResponse,
    TaskStatusResponse,
)
from .utils.files import (
    DATA_DIR,
    UPLOAD_DIR,
    read_table_bytes,
    register_uploaded_file,
    resolve_file_path,
    safe_filename,
    get_file_registry,
)
from .services.extraction import build_extraction
from .tasks import TaskQueueUnavailable, enqueue_extraction, get_task_status
from .utils.preview import generate_preview
from .utils.task_history import get_task_history_store
from pydantic import ValidationError

settings = get_settings()


app = FastAPI(
    title="Insight Sphere Backend",
    version="0.1.0",
    description=(
        "API for managing analytical datasets, providing upload/extraction capabilities "
        "with strong validation, observability, and documentation."
    ),
    contact={
        "name": "Insight Sphere Team",
        "url": "https://github.com/insight-sphere",
    },
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

# --- CORS ---
allow_origins = {str(settings.frontend_origin), "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
allow_origins.update(settings.additional_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
app.add_middleware(SecurityHeadersMiddleware)

EMAIL_LOG_PATH = DATA_DIR / "email_log.jsonl"

FILE_REGISTRY = files_utils._FILE_REGISTRY
_safe_name = safe_filename

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
MAX_UPLOAD_SIZE = settings.max_upload_size
MAX_UPLOAD_SIZE_MB = settings.max_upload_size_mb
ALLOWED_EXTENSIONS = {ext.lower() for ext in settings.allowed_upload_extensions}


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
    "/api/upload",
    summary="Upload dataset",
    response_model=FileUploadResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        413: {"model": ErrorResponse, "description": "Payload too large"},
        502: {"model": ErrorResponse, "description": "ClamAV service unavailable"},
    },
)
async def api_upload(
    file: UploadFile = File(..., description="Dataset file to upload"),
    idempotency_key: Optional[str] = Header(None, convert_underscores=False, alias="Idempotency-Key"),
) -> FileUploadResponse:
    if idempotency_key and idempotency_key in _IDEMPOTENCY_CACHE:
        return FileUploadResponse(**_IDEMPOTENCY_CACHE[idempotency_key])

    _ensure_allowed_extension(file.filename)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed size is {settings.max_upload_size_mb} MB",
        )
    await _scan_for_malware(data)
    # save
    fid = str(uuid.uuid4())
    safe = safe_filename(file.filename or "file")
    upload_dir = Path(UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    path = upload_dir / f"{fid}_{safe}"
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
    payload = FileUploadResponse(status="success", file_url=fid, filename=file.filename, quick_extraction=quick)
    UPLOAD_COUNTER.inc()
    UPLOAD_SIZE.observe(len(data))
    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = payload.model_dump()
    return payload


@app.post(
    "/api/extract",
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


@app.post(
    "/api/extract/async",
    summary="Schedule dataset metadata extraction",
    response_model=TaskEnqueueResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Unable to process dataset"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
def api_extract_async(req: ExtractRequest) -> TaskEnqueueResponse:
    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")
    # Ensure the file exists before enqueuing to fail fast for invalid identifiers.
    resolve_file_path(req.file_url)
    try:
        task_id = enqueue_extraction(req.file_url)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TaskEnqueueResponse(task_id=task_id, status="queued", queue=settings.task_queue_name)


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
    "/api/tasks/{task_id}",
    summary="Inspect background task status",
    response_model=TaskStatusResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Task not found"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
def api_task_status(task_id: str) -> TaskStatusResponse:
    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")
    try:
        status_payload = get_task_status(task_id)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    result_payload = status_payload.get("result")
    quick = QuickExtraction.model_validate(result_payload) if result_payload else None
    return TaskStatusResponse(
        task_id=status_payload["task_id"],
        status=status_payload["status"],
        result=quick,
        error=status_payload.get("error"),
    )


@app.post(
    "/api/utils/send-email",
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
        with open(log_path, "a", encoding="utf-8") as log_file:
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
    payload = generate_preview(
        file_id,
        page=page,
        page_size=page_size,
        mode=mode,
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
    import chat_api as chat_router_module
    import datasets_api as datasets_router_module
    import dictionary_api as dictionary_router_module
    import visualizations_api as visualizations_router_module
else:
    from . import audit_api as audit_router_module
    from . import chat_api as chat_router_module
    from . import datasets_api as datasets_router_module
    from . import dictionary_api as dictionary_router_module
    from . import visualizations_api as visualizations_router_module

datasets_router = datasets_router_module.router
dictionary_router = dictionary_router_module.router
visualizations_router = visualizations_router_module.router
chat_router = chat_router_module.router
audit_router = audit_router_module.router

app.include_router(datasets_router, prefix="/api/dataset")
app.include_router(dictionary_router, prefix="/api/dictionary")
app.include_router(visualizations_router, prefix="/api/visualization")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(audit_router, prefix="/api/audit")
FILE_REGISTRY = get_file_registry()
_safe_name = safe_filename
