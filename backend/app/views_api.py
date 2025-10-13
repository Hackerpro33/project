"""Endpoints for persisting user saved views for dataset and visualization lists."""

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
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
VIEWS_JSON = STORE_DIR / "saved_views.json"
# Backwards compatibility for any external imports using the previous constant name.
VIEWS_PATH = VIEWS_JSON


def _atomic_write_json(path: Path, payload: Any) -> None:
    fd, tmp_name = tempfile.mkstemp(prefix="views_", suffix=".json", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        os.close(fd)
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        shutil.move(str(tmp_path), str(path))
    finally:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass


def _load_all() -> List[Dict[str, Any]]:
    for directory in CANDIDATE_DIRS:
        candidate = directory / "saved_views.json"
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as handle:
                    return json.load(handle)
            except Exception:
                return []
    return []


def _save_all(items: List[Dict[str, Any]]) -> None:
    _atomic_write_json(VIEWS_JSON, items)


class SavedViewBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Отображаемое имя представления")
    entity: Literal["dataset", "visualization"] = Field(..., description="Тип сущности, к которой относится представление")
    search: Optional[str] = Field(None, description="Поисковый запрос")
    filters: Dict[str, Any] = Field(default_factory=dict, description="Фильтры представления")
    order_by: Optional[str] = Field(None, description="Поле сортировки")
    page_size: Optional[int] = Field(
        None,
        ge=1,
        le=100,
        description="Размер страницы, если пользователь сохранил собственное значение",
    )


class SavedViewCreate(SavedViewBase):
    pass


class SavedViewUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    search: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    order_by: Optional[str] = None
    page_size: Optional[int] = Field(None, ge=1, le=100)


def _timestamp() -> int:
    return int(time.time())


def _enrich(view: Dict[str, Any]) -> Dict[str, Any]:
    view.setdefault("created_at", _timestamp())
    created_at = view["created_at"]
    view.setdefault("created_date", datetime.utcfromtimestamp(created_at).isoformat() + "Z")
    if view.get("updated_at") and not view.get("updated_date"):
        view["updated_date"] = datetime.utcfromtimestamp(view["updated_at"]).isoformat() + "Z"
    return view


@router.get("/views")
def list_views(entity: Optional[str] = Query(None, description="Фильтр по типу сущности")):
    views = [_enrich(item) for item in _load_all()]
    if entity:
        entity_normalised = entity.strip().lower()
        views = [view for view in views if view.get("entity") == entity_normalised]
    return views


@router.post("/views")
def create_view(payload: SavedViewCreate):
    items = _load_all()
    view = payload.model_dump()
    view["id"] = str(uuid.uuid4())
    view["created_at"] = _timestamp()
    view["created_date"] = datetime.utcfromtimestamp(view["created_at"]).isoformat() + "Z"
    items.append(view)
    _save_all(items)
    return {"status": "created", "view": _enrich(view)}


@router.get("/views/{view_id}")
def get_view(view_id: str):
    for view in _load_all():
        if view.get("id") == view_id:
            return _enrich(view)
    raise HTTPException(status_code=404, detail="Сохранённое представление не найдено")


@router.put("/views/{view_id}")
def update_view(view_id: str, payload: SavedViewUpdate):
    items = _load_all()
    for index, view in enumerate(items):
        if view.get("id") == view_id:
            updated = view.copy()
            update_payload = payload.model_dump(exclude_unset=True)
            updated.update(update_payload)
            updated["id"] = view_id
            updated["updated_at"] = _timestamp()
            updated["updated_date"] = datetime.utcfromtimestamp(updated["updated_at"]).isoformat() + "Z"
            items[index] = updated
            _save_all(items)
            return {"status": "updated", "view": _enrich(updated)}
    raise HTTPException(status_code=404, detail="Сохранённое представление не найдено")


@router.delete("/views/{view_id}")
def delete_view(view_id: str):
    items = _load_all()
    remaining = [view for view in items if view.get("id") != view_id]
    if len(remaining) == len(items):
        raise HTTPException(status_code=404, detail="Сохранённое представление не найдено")
    _save_all(remaining)
    return {"status": "deleted", "id": view_id}
