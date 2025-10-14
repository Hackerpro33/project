"""API endpoints for managing dataset segmentation metadata."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from enum import Enum
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from . import dataset_versions_api
from . import datasets_api

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
SEGMENTS_JSON = STORE_DIR / "dataset_segments.json"


def _latest_version_record(dataset_id: str) -> Optional[Dict[str, Any]]:
    versions = [
        item for item in dataset_versions_api._load_versions() if item.get("dataset_id") == dataset_id
    ]
    if not versions:
        return None
    versions.sort(key=lambda item: item.get("version_number", 0), reverse=True)
    return versions[0]


def _atomic_write_json(path: Path, data: Any) -> None:
    fd, tmp_name = tempfile.mkstemp(prefix="dataset_segments_", suffix=".json", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
        shutil.move(str(tmp_path), str(path))
    finally:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass


def _load_segments() -> List[Dict[str, Any]]:
    if not SEGMENTS_JSON.exists():
        return []
    try:
        with SEGMENTS_JSON.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


def _save_segments(items: List[Dict[str, Any]]) -> None:
    _atomic_write_json(SEGMENTS_JSON, items)


def _now_ts() -> int:
    return int(time.time())


def _iso_now() -> str:
    return datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class SegmentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    ARCHIVED = "archived"


class SegmentRecord(BaseModel):
    id: str = Field(..., description="Идентификатор сегмента")
    dataset_id: str = Field(..., description="Идентификатор датасета")
    version_id: Optional[str] = Field(None, description="Версия датасета, к которой относится сегмент")
    index: int = Field(..., ge=0, description="Порядковый номер сегмента")
    status: SegmentStatus = Field(
        default=SegmentStatus.COMPLETED, description="Текущий статус обработки сегмента"
    )
    progress: int = Field(default=100, ge=0, le=100, description="Процент выполнения обработки сегмента")
    row_count: int = Field(..., ge=0, description="Количество строк в сегменте")
    checksum: Optional[str] = Field(None, description="Контрольная сумма содержимого сегмента")
    boundaries: Optional[Dict[str, Any]] = Field(None, description="Описание границ сегмента")
    created_at: int = Field(..., description="Метка времени создания сегмента")
    updated_at: int = Field(..., description="Метка времени последнего обновления")
    last_reprocess_at: Optional[str] = Field(None, description="ISO-время последнего запроса на переразбиение")


class SegmentListResponse(BaseModel):
    dataset_id: str
    version_id: Optional[str]
    total_segments: int
    total_rows: int
    segments: List[SegmentRecord]


class SegmentRule(BaseModel):
    rows_per_segment: int = Field(
        500,
        ge=1,
        le=50_000,
        description="Максимальное количество строк в одном сегменте",
    )
    key_columns: Optional[List[str]] = Field(
        default=None,
        description="Список колонок для сегментации по значениям ключа",
    )

    @field_validator("key_columns", mode="before")
    @classmethod
    def _normalize_columns(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        normalized = [column.strip() for column in value if column and column.strip()]
        return normalized or None


class SegmentRebuildRequest(BaseModel):
    version_id: Optional[str] = Field(
        None,
        description="Версия, для которой требуется построить сегменты. Если не указано — используется последняя версия",
    )
    rules: SegmentRule = Field(default_factory=SegmentRule)


class SegmentReprocessResponse(BaseModel):
    segment: SegmentRecord


def _resolve_version_id(dataset_id: str, explicit_version_id: Optional[str]) -> Optional[str]:
    if explicit_version_id:
        versions = [
            item for item in dataset_versions_api._load_versions() if item.get("dataset_id") == dataset_id
        ]
        if any(item.get("id") == explicit_version_id for item in versions):
            return explicit_version_id
        raise HTTPException(status_code=404, detail="Version not found")
    latest = _latest_version_record(dataset_id)
    if not latest:
        return None
    return latest.get("id")


def _segment_rows_by_keys(rows: Iterable[Dict[str, Any]], keys: List[str]) -> List[List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = tuple(row.get(column) for column in keys)
        grouped[json.dumps(key, ensure_ascii=False)].append(row)
    return list(grouped.values())


def _chunk_rows(rows: Iterable[Dict[str, Any]], size: int) -> List[List[Dict[str, Any]]]:
    chunk: List[Dict[str, Any]] = []
    result: List[List[Dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        chunk.append(row)
        if len(chunk) >= size:
            result.append(chunk)
            chunk = []
    if chunk:
        result.append(chunk)
    return result


def _calculate_checksum(rows: List[Dict[str, Any]]) -> str:
    payload = json.dumps(rows, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_boundaries(rows: List[Dict[str, Any]], keys: Optional[List[str]], index: int) -> Dict[str, Any]:
    if not rows:
        return {"index": index}
    if keys:
        first = rows[0]
        last = rows[-1]
        return {
            "index": index,
            "first_key": {key: first.get(key) for key in keys},
            "last_key": {key: last.get(key) for key in keys},
        }
    return {"index": index, "start_row": 0, "end_row": len(rows) - 1}


def _serialize(records: List[Dict[str, Any]], dataset_id: str, version_id: Optional[str]) -> SegmentListResponse:
    filtered = [item for item in records if item.get("dataset_id") == dataset_id and item.get("version_id") == version_id]
    segments = [
        SegmentRecord(**{**item, "status": SegmentStatus(item.get("status", SegmentStatus.COMPLETED.value))})
        for item in sorted(filtered, key=lambda item: item.get("index", 0))
    ]
    total_rows = sum(segment.row_count for segment in segments)
    return SegmentListResponse(
        dataset_id=dataset_id,
        version_id=version_id,
        total_segments=len(segments),
        total_rows=total_rows,
        segments=segments,
    )


@router.get("/{dataset_id}/segments", response_model=SegmentListResponse)
def list_segments(
    dataset_id: str,
    status: Optional[SegmentStatus] = Query(default=None),
    version_id: Optional[str] = Query(default=None, description="Версия, для которой требуется вернуть сегменты"),
) -> SegmentListResponse:
    dataset = datasets_api.get_dataset(dataset_id)
    resolved_version_id = _resolve_version_id(dataset_id, version_id)
    del dataset  # only used to raise 404 when отсутствует
    records = _load_segments()
    response = _serialize(records, dataset_id, resolved_version_id)
    if status:
        response.segments = [segment for segment in response.segments if segment.status == status]
        response.total_segments = len(response.segments)
        response.total_rows = sum(segment.row_count for segment in response.segments)
    return response


@router.post("/{dataset_id}/segments", response_model=SegmentListResponse)
def rebuild_segments(dataset_id: str, payload: SegmentRebuildRequest) -> SegmentListResponse:
    dataset = datasets_api.get_dataset(dataset_id)
    version_id = _resolve_version_id(dataset_id, payload.version_id)

    rows = dataset.get("sample_data") or []
    if version_id:
        version = dataset_versions_api._find_version(dataset_id, version_id)
        if version is not None:
            rows = version.get("rows", rows) or rows
    elif not rows:
        latest = _latest_version_record(dataset_id)
        if latest is not None:
            rows = latest.get("rows", rows) or rows
            version_id = latest.get("id")

    if payload.rules.key_columns:
        groups = _segment_rows_by_keys(rows, payload.rules.key_columns)
    else:
        groups = _chunk_rows(rows, payload.rules.rows_per_segment)

    timestamp = _now_ts()
    iso_now = _iso_now()
    new_segments: List[Dict[str, Any]] = []
    for index, segment_rows in enumerate(groups):
        record = {
            "id": str(uuid.uuid4()),
            "dataset_id": dataset_id,
            "version_id": version_id,
            "index": index,
            "status": SegmentStatus.COMPLETED.value,
            "progress": 100,
            "row_count": len(segment_rows),
            "checksum": _calculate_checksum(segment_rows) if segment_rows else None,
            "boundaries": _build_boundaries(segment_rows, payload.rules.key_columns, index),
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_reprocess_at": iso_now,
        }
        new_segments.append(record)

    all_segments = _load_segments()
    all_segments = [
        item
        for item in all_segments
        if not (item.get("dataset_id") == dataset_id and item.get("version_id") == version_id)
    ]
    all_segments.extend(new_segments)
    _save_segments(all_segments)

    return _serialize(all_segments, dataset_id, version_id)


@router.post("/{dataset_id}/segments/{segment_id}/reprocess", response_model=SegmentReprocessResponse)
def reprocess_segment(dataset_id: str, segment_id: str) -> SegmentReprocessResponse:
    dataset = datasets_api.get_dataset(dataset_id)
    del dataset
    records = _load_segments()
    updated = None
    now = _now_ts()
    iso_now = _iso_now()
    for index, record in enumerate(records):
        if record.get("id") == segment_id and record.get("dataset_id") == dataset_id:
            new_record = record.copy()
            new_record["status"] = SegmentStatus.PENDING.value
            new_record["progress"] = 0
            new_record["updated_at"] = now
            new_record["last_reprocess_at"] = iso_now
            records[index] = new_record
            updated = new_record
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Segment not found")
    _save_segments(records)
    return SegmentReprocessResponse(segment=SegmentRecord(**updated))


__all__ = [
    "router",
]
