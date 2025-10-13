from datetime import datetime
from math import ceil
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from fastapi import APIRouter, HTTPException, Query, params
from pydantic import BaseModel, Field

import json
import os
import shutil
import tempfile
import time
import uuid


router = APIRouter()

APP_DIR = Path(__file__).resolve().parent
CANDIDATE_DIRS = [APP_DIR.parent / "data", APP_DIR / "data"]


def _ensure_store_dir() -> Path:
    for directory in CANDIDATE_DIRS:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            return directory
        except Exception:
            continue
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


STORE_DIR = _ensure_store_dir()
DATASETS_JSON = STORE_DIR / "datasets.json"
DEFAULT_PAGE_SIZE = 20


def _atomic_write_json(path: Path, data: Any):
    fd, tmp_path = tempfile.mkstemp(prefix="datasets_", suffix=".json", dir=str(path.parent))
    tmp = Path(tmp_path)
    # close the descriptor immediately, we'll reopen via Path
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        shutil.move(str(tmp), str(path))
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def _load_all() -> List[Dict[str, Any]]:
    for directory in CANDIDATE_DIRS:
        candidate = directory / "datasets.json"
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
    return []


def _save_all(items: List[Dict[str, Any]]):
    _atomic_write_json(DATASETS_JSON, items)


class ColumnInfo(BaseModel):
    name: str
    type: str = "string"
    selected: Optional[bool] = True


class DatasetBase(BaseModel):
    name: Optional[str] = Field(None, description="Название набора")
    description: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    columns: List[ColumnInfo] = Field(default_factory=list)
    file_url: Optional[str] = None
    row_count: Optional[int] = None
    sample_data: Optional[List[Dict[str, Any]]] = None


class DatasetCreate(DatasetBase):
    name: str = Field(..., description="Название набора")


class DatasetUpdate(DatasetBase):
    pass


def _ensure_dates(item: Dict[str, Any]) -> Dict[str, Any]:
    created_at = item.get("created_at")
    if not created_at:
        created_date = item.get("created_date")
        if created_date:
            try:
                created_at = int(datetime.fromisoformat(created_date.replace("Z", "+00:00")).timestamp())
            except Exception:
                created_at = int(time.time())
        else:
            created_at = int(time.time())
    item["created_at"] = created_at
    if not item.get("created_date"):
        item["created_date"] = datetime.utcfromtimestamp(created_at).isoformat() + "Z"

    updated_at = item.get("updated_at")
    if updated_at and not item.get("updated_date"):
        item["updated_date"] = datetime.utcfromtimestamp(updated_at).isoformat() + "Z"
    return item


def _normalise_tags(tags: Optional[Iterable[str]]) -> Set[str]:
    if not tags:
        return set()
    normalised: Set[str] = set()
    for tag in tags:
        if not tag:
            continue
        normalised.add(tag.strip().lower())
    return normalised


def _resolve_param(value):
    if isinstance(value, params.Param):
        return value.default
    return value


@router.get("/list")
def list_datasets(
    order_by: Optional[str] = "-created_at",
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(20, ge=1, le=100, description="Количество элементов на странице"),
    search: Optional[str] = Query(None, description="Поисковый запрос по названиям, описанию и тегам"),
    tags: Optional[List[str]] = Query(None, description="Фильтр по тегам"),
):
    raw_page = page
    raw_page_size = page_size

    page = _resolve_param(page) or 1
    page_size = _resolve_param(page_size) or DEFAULT_PAGE_SIZE
    search = _resolve_param(search)
    tags = _resolve_param(tags)
    if isinstance(tags, str):
        tags = [tags]

    items = [_ensure_dates(item) for item in _load_all()]

    available_tags = sorted({tag for item in items for tag in item.get("tags", []) if tag})

    filtered = items
    if search:
        query = search.strip().lower()
        if query:
            def _matches(item: Dict[str, Any]) -> bool:
                haystacks = [
                    (item.get("name") or "").lower(),
                    (item.get("description") or "").lower(),
                ]
                haystacks.extend((tag or "").lower() for tag in item.get("tags", []))
                for column in item.get("columns", []) or []:
                    haystacks.append((column.get("name") or "").lower())
                return any(query in hay for hay in haystacks if hay)

            filtered = [item for item in filtered if _matches(item)]

    tag_filter = _normalise_tags(tags)
    if tag_filter:
        def _has_tags(item: Dict[str, Any]) -> bool:
            item_tags = _normalise_tags(item.get("tags", []))
            return tag_filter.issubset(item_tags)

        filtered = [item for item in filtered if _has_tags(item)]

    if order_by:
        reverse = order_by.startswith("-")
        key = order_by.lstrip("-")
        filtered.sort(key=lambda x: x.get(key, 0), reverse=reverse)

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = filtered[start:end]
    total_pages = ceil(total / page_size) if total else 0

    compatibility_plain = (
        (isinstance(raw_page, params.Param) or page == 1)
        and (isinstance(raw_page_size, params.Param) or page_size == DEFAULT_PAGE_SIZE)
        and not search
        and not tag_filter
    )

    if compatibility_plain:
        return filtered

    return {
        "items": paginated,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_previous": page > 1,
        "available_filters": {"tags": available_tags},
    }


@router.post("/create")
def create_dataset(payload: DatasetCreate):
    items = _load_all()
    dataset = payload.model_dump()
    dataset["id"] = str(uuid.uuid4())
    dataset["created_at"] = int(time.time())
    dataset["created_date"] = datetime.utcfromtimestamp(dataset["created_at"]).isoformat() + "Z"
    items.append(dataset)
    _save_all(items)
    return {"status": "created", "id": dataset["id"], "dataset": _ensure_dates(dataset)}


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    for item in _load_all():
        if item.get("id") == dataset_id:
            return _ensure_dates(item)
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.put("/{dataset_id}")
def update_dataset(dataset_id: str, payload: DatasetUpdate):
    items = _load_all()
    for index, item in enumerate(items):
        if item.get("id") == dataset_id:
            updated = item.copy()
            updated.update(payload.model_dump(exclude_unset=True))
            updated["id"] = dataset_id
            updated["updated_at"] = int(time.time())
            updated["updated_date"] = datetime.utcfromtimestamp(updated["updated_at"]).isoformat() + "Z"
            if not updated.get("created_at"):
                updated["created_at"] = int(time.time())
            updated["created_date"] = updated.get("created_date") or datetime.utcfromtimestamp(updated["created_at"]).isoformat() + "Z"
            items[index] = updated
            _save_all(items)
            return {"status": "updated", "dataset": _ensure_dates(updated)}
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str):
    items = _load_all()
    remaining = [item for item in items if item.get("id") != dataset_id]
    if len(remaining) == len(items):
        raise HTTPException(status_code=404, detail="Dataset not found")
    _save_all(remaining)
    return {"status": "deleted", "id": dataset_id}


if os.getenv("ENABLE_DATASET_DEBUG_ENDPOINT") == "1":
    @router.get("/debug/paths")
    def debug_paths():
        return {
            "APP_DIR": str(APP_DIR),
            "STORE_DIR": str(STORE_DIR),
            "DATASETS_JSON": str(DATASETS_JSON),
            "exists": DATASETS_JSON.exists(),
            "size": DATASETS_JSON.stat().st_size if DATASETS_JSON.exists() else 0,
        }
