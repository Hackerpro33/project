"""Visualization CRUD endpoints backed by JSON storage."""
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
_DEFAULT_STORE = _DATA_DIR / "visualizations"
_ENV_STORE = Path(os.getenv("INSIGHT_VISUALIZATIONS_DIR", _DEFAULT_STORE))

CANDIDATE_DIRS: List[Path] = [_ENV_STORE, _DEFAULT_STORE, _DATA_DIR]


def _resolve_store_dir() -> Path:
    for candidate in CANDIDATE_DIRS:
        if candidate.exists():
            candidate.mkdir(parents=True, exist_ok=True)
            return candidate
    target = CANDIDATE_DIRS[0]
    target.mkdir(parents=True, exist_ok=True)
    return target


STORE_DIR = _resolve_store_dir()
VISUALIZATIONS_JSON = STORE_DIR / "visualizations.json"

_ORDERABLE_FIELDS = {"created_at", "updated_at", "title", "type"}


class VisualizationBase(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = Field(default="chart")
    dataset_id: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    summary: Optional[Dict[str, Any]] = None
    tags: List[str] = Field(default_factory=list)
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    z_axis: Optional[str] = None
    insights: Optional[List[str]] = None


class VisualizationCreate(VisualizationBase):
    title: str
    type: str = "chart"


class VisualizationUpdate(VisualizationBase):
    pass


class VisualizationFilterRequest(BaseModel):
    filters: Dict[str, Any] = Field(default_factory=dict)
    order_by: Optional[str] = "-created_at"


def _load_all() -> List[Dict[str, Any]]:
    if not VISUALIZATIONS_JSON.exists():
        return []
    with VISUALIZATIONS_JSON.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
        if isinstance(payload, list):
            return [dict(item) for item in payload]
        raise ValueError("Visualization store must contain a JSON array")


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
    _atomic_write_json(VISUALIZATIONS_JSON, payload)


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
    result.setdefault("tags", [])
    result.setdefault("insights", [])
    result.setdefault("config", {})
    return result


def _normalize_tags(tags: Iterable[str]) -> List[str]:
    return [str(tag) for tag in tags]


def _sort_items(items: List[Dict[str, Any]], order_by: Optional[str]) -> List[Dict[str, Any]]:
    field = order_by or "-created_at"
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


def _list_visualizations(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    items = [_ensure_dates(item) for item in _load_all()]
    return _sort_items(items, order_by)


def list_visualizations(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    return _list_visualizations(order_by=order_by)


@router.get("/list")
def list_visualizations_endpoint(
    order_by: Optional[str] = "-created_at",
    request: Request = None,  # type: ignore[assignment]
    response: Response = None,  # type: ignore[assignment]
) -> List[Dict[str, Any]]:
    items = _list_visualizations(order_by=order_by)

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


def create_visualization(payload: VisualizationCreate) -> Dict[str, Any]:
    visualization = {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "type": payload.type or "chart",
        "dataset_id": payload.dataset_id,
        "config": payload.config or {},
        "summary": payload.summary,
        "tags": _normalize_tags(payload.tags),
        "x_axis": payload.x_axis,
        "y_axis": payload.y_axis,
        "z_axis": payload.z_axis,
        "insights": payload.insights or [],
    }
    visualization = _ensure_dates(visualization)

    items = _load_all()
    items.append(visualization)
    _save_all(items)
    return {"status": "created", "id": visualization["id"], "visualization": visualization}


@router.post("/create")
def create_visualization_endpoint(payload: VisualizationCreate) -> Dict[str, Any]:
    return create_visualization(payload)


def _find_visualization(items: List[Dict[str, Any]], viz_id: str) -> Dict[str, Any]:
    for item in items:
        if item.get("id") == viz_id:
            return item
    raise HTTPException(status_code=404, detail="Visualization not found")


def get_visualization(viz_id: str) -> Dict[str, Any]:
    items = _load_all()
    visualization = _find_visualization(items, viz_id)
    return _ensure_dates(visualization)


@router.get("/{viz_id}")
def get_visualization_endpoint(viz_id: str) -> Dict[str, Any]:
    return get_visualization(viz_id)


def update_visualization(viz_id: str, payload: VisualizationUpdate) -> Dict[str, Any]:
    items = _load_all()
    visualization = _find_visualization(items, viz_id)

    update_payload = payload.model_dump(exclude_unset=True)
    if "tags" in update_payload:
        update_payload["tags"] = _normalize_tags(payload.tags)

    visualization.update(update_payload)
    visualization["updated_at"] = int(time.time())
    visualization = _ensure_dates(visualization)

    updated_items = [visualization if item.get("id") == viz_id else item for item in items]
    _save_all(updated_items)
    return {"status": "updated", "visualization": visualization}


@router.put("/{viz_id}")
def update_visualization_endpoint(viz_id: str, payload: VisualizationUpdate) -> Dict[str, Any]:
    return update_visualization(viz_id, payload)


def delete_visualization(viz_id: str) -> Dict[str, Any]:
    items = _load_all()
    visualization = _find_visualization(items, viz_id)
    remaining = [item for item in items if item.get("id") != viz_id]
    _save_all(remaining)
    return {"status": "deleted", "id": viz_id, "visualization": _ensure_dates(visualization)}


@router.delete("/{viz_id}")
def delete_visualization_endpoint(viz_id: str) -> Dict[str, Any]:
    return delete_visualization(viz_id)


def filter_visualizations(filter_request: VisualizationFilterRequest) -> List[Dict[str, Any]]:
    items = _list_visualizations(order_by=filter_request.order_by)
    filtered: List[Dict[str, Any]] = []
    for item in items:
        matches = True
        for field, expected in filter_request.filters.items():
            if item.get(field) != expected:
                matches = False
                break
        if matches:
            filtered.append(item)
    return filtered


@router.post("/filter")
def filter_visualizations_endpoint(
    filter_request: VisualizationFilterRequest,
    request: Request = None,  # type: ignore[assignment]
    response: Response = None,  # type: ignore[assignment]
) -> List[Dict[str, Any]]:
    items = filter_visualizations(filter_request)

    if response is not None:
        cache_payload = {
            "filters": filter_request.filters,
            "order_by": filter_request.order_by,
            "items": items,
        }
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


__all__ = [
    "CANDIDATE_DIRS",
    "STORE_DIR",
    "VISUALIZATIONS_JSON",
    "VisualizationCreate",
    "VisualizationUpdate",
    "VisualizationFilterRequest",
    "create_visualization",
    "delete_visualization",
    "filter_visualizations",
    "get_visualization",
    "list_visualizations",
    "update_visualization",
    "_ensure_dates",
    "_atomic_write_json",
    "_save_all",
]

