"""Dataset CRUD endpoints backed by JSON storage with HTTP caching."""
from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .config import get_settings
from .utils.cache import apply_cache_headers, should_return_not_modified

router = APIRouter()
settings = get_settings()

_DATA_DIR = Path(__file__).resolve().parent / "data"
_DEFAULT_STORE = _DATA_DIR / "datasets"
_ENV_STORE = Path(os.getenv("INSIGHT_DATASETS_DIR", _DEFAULT_STORE))

# The order matters: the first existing path will be used, otherwise the first item
# will be created lazily when saving data. Tests monkeypatch these constants.
CANDIDATE_DIRS: List[Path] = [_ENV_STORE, _DEFAULT_STORE, _DATA_DIR]


def _resolve_store_dir() -> Path:
    for candidate in CANDIDATE_DIRS:
        if candidate.exists():
            candidate.mkdir(parents=True, exist_ok=True)
            return candidate
    # Fall back to the first candidate and create it on demand.
    target = CANDIDATE_DIRS[0]
    target.mkdir(parents=True, exist_ok=True)
    return target


STORE_DIR = _resolve_store_dir()
DATASETS_JSON = STORE_DIR / "datasets.json"

_ORDERABLE_FIELDS = {"created_at", "updated_at", "name", "row_count"}


class ColumnInfo(BaseModel):
    name: str
    type: str


class DatasetBase(BaseModel):
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    columns: List[ColumnInfo] = Field(default_factory=list)
    file_url: Optional[str] = None
    row_count: Optional[int] = None
    sample_data: Optional[List[Dict[str, Any]]] = None


class DatasetCreate(DatasetBase):
    name: str


class DatasetUpdate(DatasetBase):
    name: Optional[str] = None


def _load_all() -> List[Dict[str, Any]]:
    if not DATASETS_JSON.exists():
        return []
    with DATASETS_JSON.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
        if isinstance(payload, list):
            return [dict(item) for item in payload]
        raise ValueError("Dataset store must contain a JSON array")


def _atomic_write_json(target: Path, payload: Any) -> None:
    """Persist ``payload`` to ``target`` using a temporary file."""

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_suffix(target.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.flush()
        try:
            os.fsync(handle.fileno())
        except OSError:
            # Some environments (e.g. certain Docker volumes) may not support fsync.
            pass
    os.replace(tmp_path, target)


def _save_all(items: Iterable[Dict[str, Any]]) -> None:
    payload = list(items)
    _atomic_write_json(DATASETS_JSON, payload)


def _format_datetime(dt: datetime) -> str:
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    return iso


def _ensure_dates(item: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(item)
    now = int(time.time())
    created_at = int(result.get("created_at") or now)
    updated_at = int(result.get("updated_at") or created_at)
    result["created_at"] = created_at
    result["updated_at"] = updated_at
    created_dt = datetime.fromtimestamp(created_at, tz=timezone.utc)
    updated_dt = datetime.fromtimestamp(updated_at, tz=timezone.utc)
    result["created_date"] = _format_datetime(created_dt)
    result["updated_date"] = _format_datetime(updated_dt)
    # Fill optional list fields to avoid returning nulls.
    result.setdefault("tags", [])
    result.setdefault("columns", [])
    result.setdefault("sample_data", [])
    return result


def _normalize_columns(columns: Iterable[ColumnInfo]) -> List[Dict[str, Any]]:
    return [column.model_dump() for column in columns]


def _normalize_tags(tags: Iterable[str]) -> List[str]:
    return [str(tag) for tag in tags]


def _sort_items(items: List[Dict[str, Any]], order_by: Optional[str]) -> List[Dict[str, Any]]:
    field = (order_by or "-created_at")
    reverse = field.startswith("-")
    normalized_field = field.lstrip("-")
    if normalized_field not in _ORDERABLE_FIELDS:
        normalized_field = "created_at"
        reverse = True

    def _sort_key(item: Dict[str, Any]) -> Any:
        value = item.get(normalized_field)
        if isinstance(value, (int, float)):
            return value
        return str(value or "")

    return sorted(items, key=_sort_key, reverse=reverse)


def _list_datasets(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    items = [_ensure_dates(item) for item in _load_all()]
    return _sort_items(items, order_by)


def list_datasets(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    """Return datasets for direct invocation (e.g. in tests)."""

    return _list_datasets(order_by=order_by)


@router.get("/list")
def list_datasets_endpoint(
    order_by: Optional[str] = "-created_at",
    request: Request = None,  # type: ignore[assignment]
    response: Response = None,  # type: ignore[assignment]
) -> List[Dict[str, Any]]:
    # FastAPI injects ``Request``/``Response`` despite the default ``None`` which
    # keeps the function callable from tests without providing arguments.
    items = _list_datasets(order_by=order_by)

    if response is not None:
        cache_payload = {"order_by": order_by, "items": items}
        etag = apply_cache_headers(
            response,
            cache_payload,
            cache_seconds=settings.heavy_response_cache_seconds,
        )
        if request is not None and should_return_not_modified(request, etag):
            headers = {"ETag": etag}
            cache_control = response.headers.get("Cache-Control")
            if cache_control:
                headers["Cache-Control"] = cache_control
            return Response(status_code=304, headers=headers)  # type: ignore[return-value]

    return items


def create_dataset(payload: DatasetCreate) -> Dict[str, Any]:
    dataset = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "description": payload.description or "",
        "tags": _normalize_tags(payload.tags),
        "columns": _normalize_columns(payload.columns),
        "file_url": payload.file_url,
        "row_count": payload.row_count,
        "sample_data": payload.sample_data or [],
    }
    dataset = _ensure_dates(dataset)

    items = _load_all()
    items.append(dataset)
    _save_all(items)
    return {"status": "created", "id": dataset["id"], "dataset": dataset}


@router.post("/create")
def create_dataset_endpoint(payload: DatasetCreate) -> Dict[str, Any]:
    return create_dataset(payload)


def _find_dataset(datasets: List[Dict[str, Any]], dataset_id: str) -> Dict[str, Any]:
    for item in datasets:
        if item.get("id") == dataset_id:
            return item
    raise HTTPException(status_code=404, detail="Dataset not found")


def get_dataset(dataset_id: str) -> Dict[str, Any]:
    datasets = _load_all()
    dataset = _find_dataset(datasets, dataset_id)
    return _ensure_dates(dataset)


@router.get("/{dataset_id}")
def get_dataset_endpoint(dataset_id: str) -> Dict[str, Any]:
    return get_dataset(dataset_id)


def update_dataset(dataset_id: str, payload: DatasetUpdate) -> Dict[str, Any]:
    datasets = _load_all()
    dataset = _find_dataset(datasets, dataset_id)

    update_payload = payload.model_dump(exclude_unset=True)
    if "tags" in update_payload:
        update_payload["tags"] = _normalize_tags(payload.tags)
    if "columns" in update_payload:
        update_payload["columns"] = _normalize_columns(payload.columns)

    dataset.update(update_payload)
    dataset["updated_at"] = int(time.time())
    dataset = _ensure_dates(dataset)

    # Persist updates back to disk
    updated_items = [dataset if item.get("id") == dataset_id else item for item in datasets]
    _save_all(updated_items)
    return {"status": "updated", "dataset": dataset}


@router.put("/{dataset_id}")
def update_dataset_endpoint(dataset_id: str, payload: DatasetUpdate) -> Dict[str, Any]:
    return update_dataset(dataset_id, payload)


def delete_dataset(dataset_id: str) -> Dict[str, Any]:
    datasets = _load_all()
    dataset = _find_dataset(datasets, dataset_id)
    remaining = [item for item in datasets if item.get("id") != dataset_id]
    _save_all(remaining)
    return {"status": "deleted", "id": dataset_id, "dataset": _ensure_dates(dataset)}


@router.delete("/{dataset_id}")
def delete_dataset_endpoint(dataset_id: str) -> Dict[str, Any]:
    return delete_dataset(dataset_id)


__all__ = [
    "CANDIDATE_DIRS",
    "STORE_DIR",
    "DATASETS_JSON",
    "DatasetCreate",
    "DatasetUpdate",
    "create_dataset",
    "delete_dataset",
    "get_dataset",
    "list_datasets",
    "update_dataset",
    "_ensure_dates",
    "_atomic_write_json",
    "_save_all",
]

