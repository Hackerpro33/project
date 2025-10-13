"""Visualization CRUD endpoints backed by JSON storage."""
from __future__ import annotations

import json

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timezone
from math import ceil
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Union

from fastapi import APIRouter, HTTPException, Query, Request, Response
from typing import Any, Dict, Iterable, List, Optional, Set

from fastapi import APIRouter, HTTPException, Query, Request, Response, params
from pydantic import BaseModel, Field

from .config import get_settings
from .utils.cache import apply_cache_headers, should_return_not_modified


router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

APP_DIR = Path(__file__).resolve().parent
_DATA_DIR = APP_DIR / "data"
_DEFAULT_STORE = _DATA_DIR / "visualizations"
_ENV_STORE = Path(os.environ.get("INSIGHT_VISUALIZATIONS_DIR") or _DEFAULT_STORE)
CANDIDATE_DIRS: List[Path] = [_ENV_STORE, _DEFAULT_STORE, _DATA_DIR]
DEFAULT_PAGE_SIZE = 20
_ORDERABLE_FIELDS = {"created_at", "updated_at", "title", "type"}


def _resolve_store_dir() -> Path:
    for candidate in CANDIDATE_DIRS:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
        except Exception:
            continue
        if candidate.exists():
            return candidate
    fallback = _DEFAULT_STORE
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


STORE_DIR = _resolve_store_dir()
VISUALIZATIONS_JSON = STORE_DIR / "visualizations.json"


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix="visualizations_",
        suffix=".json",
        dir=str(path.parent),
    )
    tmp_path = Path(tmp_name)
    try:
        os.close(fd)
    except OSError:
        pass

    try:
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        shutil.move(str(tmp_path), str(path))
    finally:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass
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
DEFAULT_PAGE_SIZE = 20

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
    try:
        with VISUALIZATIONS_JSON.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return []
    if isinstance(payload, list):
        return [dict(item) for item in payload]
    raise ValueError("Visualization store must contain a JSON array")


def _save_all(items: Iterable[Dict[str, Any]]) -> None:
    _atomic_write_json(VISUALIZATIONS_JSON, list(items))


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


def _normalize_tags(tags: Optional[Iterable[str]]) -> List[str]:
    if not tags:
        return []
    seen: Set[str] = set()
    normalized: List[str] = []
    for tag in tags:
        if tag is None:
            continue
        cleaned = str(tag).strip()
        if not cleaned:
            continue
        lower = cleaned.lower()
        if lower in seen:
            continue
        seen.add(lower)
        normalized.append(cleaned)
    return normalized


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
        if isinstance(value, str):
            return value.lower()
        return str(value or "")

    return sorted(items, key=_sort_key, reverse=reverse)


def _normalise_list(values: Optional[Iterable[str]]) -> Set[str]:
    if not values:
        return set()
    result: Set[str] = set()
    for value in values:
        if not value:
            continue
        result.add(str(value).strip().lower())
    return result


def _apply_filters(
    items: List[Dict[str, Any]],
    *,
    search: Optional[str],
    tags: Optional[Iterable[str]],
    types: Optional[Iterable[str]],
) -> List[Dict[str, Any]]:
    filtered = items

    if search:
        query = search.strip().lower()
        if query:
            def _matches(item: Dict[str, Any]) -> bool:
                haystacks = [
                    (item.get("title") or "").lower(),
                    (item.get("type") or "").lower(),
                ]
                haystacks.extend((tag or "").lower() for tag in item.get("tags", []))
                return any(query in hay for hay in haystacks if hay)

            filtered = [item for item in filtered if _matches(item)]

    tag_filter = _normalise_list(tags)
    if tag_filter:
        filtered = [
            item
            for item in filtered
            if tag_filter.issubset(_normalise_list(item.get("tags", [])))
        ]

    type_filter = _normalise_list(types)
    if type_filter:
        filtered = [
            item
            for item in filtered
            if (item.get("type") or "").strip().lower() in type_filter
        ]

    return filtered


def _list_visualizations_internal(
    *,
    order_by: Optional[str],
    search: Optional[str],
    tags: Optional[Iterable[str]],
    types: Optional[Iterable[str]],
) -> List[Dict[str, Any]]:
    items = [_ensure_dates(item) for item in _load_all()]
    items = _apply_filters(items, search=search, tags=tags, types=types)
    return _sort_items(items, order_by)


def _paginate_items(
    items: List[Dict[str, Any]],
    *,
    page: int,
    page_size: int,
    request: Optional[Request],
    search: Optional[str],
    tag_filter: Set[str],
    type_filter: Set[str],
) -> Dict[str, Any]:
    total = len(items)
    start = max(0, (page - 1) * page_size)
    end = start + page_size
    paginated = items[start:end]
    total_pages = ceil(total / page_size) if total else 0

    user_defined_page = request is not None and "page" in request.query_params
    user_defined_page_size = request is not None and "page_size" in request.query_params

    available_tags = sorted({tag for item in items for tag in item.get("tags", []) if tag})
    available_types = sorted({item.get("type") for item in items if item.get("type")})

    if (
        not user_defined_page
        and not user_defined_page_size
        and not search
        and not tag_filter
        and not type_filter
        and page == 1
        and page_size == DEFAULT_PAGE_SIZE
    ):
        paginated = items
        total_pages = 1 if total else 0

    return {
        "items": paginated,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_previous": page > 1,
        "available_filters": {
            "tags": available_tags,
            "types": available_types,
        },
    }


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


def list_visualizations(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    return _list_visualizations_internal(order_by=order_by, search=None, tags=None, types=None)


@router.get("/list", response_model=None)
def list_visualizations_endpoint(
    order_by: Optional[str] = "-created_at",
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=100, description="Количество элементов на странице"),
    search: Optional[str] = Query(None, description="Поиск по названию, описанию и тегам"),
    tags: Optional[List[str]] = Query(None, description="Фильтр по тегам"),
    types: Optional[List[str]] = Query(None, description="Фильтр по типу визуализации"),
    *,
    request: Request,
    response: Response,
) -> Union[List[Dict[str, Any]], Dict[str, Any]]:
    items = _list_visualizations_internal(
        order_by=order_by,
        search=search,
        tags=tags,
        types=types,
    )

    tag_filter = _normalise_list(tags)
    type_filter = _normalise_list(types)
    payload = _paginate_items(
        items,
        page=page,
        page_size=page_size,
        request=request,
        search=search,
        tag_filter=tag_filter,
        type_filter=type_filter,
    )

    explicit_paging = request is not None and any(
        key in request.query_params for key in ("page", "page_size")
    )
    return_full_list = (
        payload["page"] == 1
        and payload["page_size"] == DEFAULT_PAGE_SIZE
        and payload["total"] == len(items)
        and len(payload["items"]) == len(items)
        and not tag_filter
        and not type_filter
        and not search
        and not explicit_paging
    )

    cache_payload = {
        "order_by": order_by,
        "page": page,
        "page_size": page_size,
        "search": search,
        "tags": sorted(tag_filter),
        "types": sorted(type_filter),
        "payload": payload,
    }
    etag = apply_cache_headers(
        response,
        cache_payload,
        cache_seconds=settings.heavy_response_cache_seconds,
    )
    if should_return_not_modified(request, etag):
        headers = {"ETag": etag}
        cache_control = response.headers.get("Cache-Control")
        if cache_control:
            headers["Cache-Control"] = cache_control
        return Response(status_code=304, headers=headers)  # type: ignore[return-value]

    return payload["items"] if return_full_list else payload


def _find_visualization(items: List[Dict[str, Any]], viz_id: str) -> Dict[str, Any]:
    for item in items:
        if item.get("id") == viz_id:
            return item
    raise HTTPException(status_code=404, detail="Visualization not found")


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
        update_payload["tags"] = _normalize_tags(update_payload.get("tags"))

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
    items = _list_visualizations_internal(
        order_by=filter_request.order_by,
        search=None,
        tags=None,
        types=None,
    )
    filtered: List[Dict[str, Any]] = []
    for item in items:
        matches = True
        for field, expected in filter_request.filters.items():
            value = item.get(field)
            if isinstance(expected, (list, tuple, set)):
                if isinstance(value, (list, tuple, set)):
                    value_set = {str(v) for v in value}
                    expected_set = {str(v) for v in expected}
                    if not expected_set.issubset(value_set):
                        matches = False
                        break
                else:
                    if str(value) not in {str(v) for v in expected}:
                        matches = False
                        break
            else:
                if isinstance(value, list):
                    if str(expected) not in {str(v) for v in value}:
                        matches = False
                        break
                elif value != expected:
                    matches = False
                    break
        if matches:
            filtered.append(item)
    return filtered


@router.post("/filter", response_model=None)
def filter_visualizations_endpoint(
    filter_request: VisualizationFilterRequest,
    *,
    request: Request,
    response: Response,
) -> List[Dict[str, Any]]:
    items = filter_visualizations(filter_request)

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
    if should_return_not_modified(request, etag):
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
