from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .datasets_api import _ensure_dates as ensure_dataset_dates
from .datasets_api import _load_all as load_all_datasets
from .datasets_api import _save_all as save_all_datasets

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
VERSIONS_JSON = STORE_DIR / "dataset_versions.json"
LIFECYCLE_JSON = STORE_DIR / "dataset_version_lifecycle.json"


def _atomic_write_json(path: Path, data: Any) -> None:
    fd, tmp_name = tempfile.mkstemp(prefix="dataset_versions_", suffix=".json", dir=str(path.parent))
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


def _load_versions() -> List[Dict[str, Any]]:
    if not VERSIONS_JSON.exists():
        return []
    try:
        with VERSIONS_JSON.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


def _save_versions(items: List[Dict[str, Any]]) -> None:
    _atomic_write_json(VERSIONS_JSON, items)


def _atomic_write_lifecycle(data: List[Dict[str, Any]]) -> None:
    _atomic_write_json(LIFECYCLE_JSON, data)


def _load_lifecycle() -> List[Dict[str, Any]]:
    if not LIFECYCLE_JSON.exists():
        return []
    try:
        with LIFECYCLE_JSON.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


def _save_lifecycle(items: List[Dict[str, Any]]) -> None:
    _atomic_write_lifecycle(items)


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _from_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class LifecycleStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class DatasetVersionLifecycleResponse(BaseModel):
    dataset_id: str
    version_id: str
    status: LifecycleStatus
    ttl_at: Optional[str] = None
    ttl_days: Optional[int] = None
    archived_at: Optional[str] = None
    restored_at: Optional[str] = None
    last_accessed_at: Optional[str] = None
    cold_since: Optional[str] = None
    cold_after_days: Optional[int] = None


def _default_lifecycle(dataset_id: str, version_id: str) -> Dict[str, Any]:
    now = _utcnow()
    return {
        "dataset_id": dataset_id,
        "version_id": version_id,
        "status": LifecycleStatus.ACTIVE.value,
        "ttl_at": None,
        "ttl_days": None,
        "archived_at": None,
        "restored_at": None,
        "last_accessed_at": _to_iso(now),
        "cold_since": None,
        "cold_after_days": None,
    }


def _ensure_lifecycle(dataset_id: str, version_id: str) -> Dict[str, Any]:
    records = _load_lifecycle()
    for record in records:
        if record.get("dataset_id") == dataset_id and record.get("version_id") == version_id:
            return record
    record = _default_lifecycle(dataset_id, version_id)
    records.append(record)
    _save_lifecycle(records)
    return record


def _persist_lifecycle(updated_record: Dict[str, Any]) -> Dict[str, Any]:
    records = _load_lifecycle()
    for index, record in enumerate(records):
        if record.get("dataset_id") == updated_record.get("dataset_id") and record.get("version_id") == updated_record.get("version_id"):
            records[index] = updated_record
            break
    else:
        records.append(updated_record)
    _save_lifecycle(records)
    return updated_record


def _serialize_lifecycle(record: Dict[str, Any]) -> DatasetVersionLifecycleResponse:
    normalized = record.copy()
    normalized.setdefault("status", LifecycleStatus.ACTIVE.value)
    return DatasetVersionLifecycleResponse(**normalized)


def _require_version(dataset_id: str, version_id: str) -> Dict[str, Any]:
    version = _find_version(dataset_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


def _apply_cold_state(record: Dict[str, Any], now: datetime) -> bool:
    changed = False
    cold_after = record.get("cold_after_days")
    if cold_after is None:
        return changed
    try:
        cold_after_days = int(cold_after)
    except (TypeError, ValueError):
        return changed
    last_accessed = _from_iso(record.get("last_accessed_at")) or now
    cold_threshold = last_accessed + timedelta(days=cold_after_days)
    if now >= cold_threshold:
        if not record.get("cold_since"):
            record["cold_since"] = _to_iso(now)
            changed = True
    else:
        if record.get("cold_since") is not None:
            record["cold_since"] = None
            changed = True
    return changed


def _apply_ttl_transition(record: Dict[str, Any], now: datetime) -> bool:
    changed = False
    status = record.get("status", LifecycleStatus.ACTIVE.value)
    ttl_at = _from_iso(record.get("ttl_at"))
    if ttl_at and now >= ttl_at and status != LifecycleStatus.ARCHIVED.value:
        record["status"] = LifecycleStatus.ARCHIVED.value
        record["archived_at"] = _to_iso(now)
        changed = True
    return changed


def _evaluate_dataset_lifecycle(dataset_id: str, now: datetime) -> List[DatasetVersionLifecycleResponse]:
    records = _load_lifecycle()
    mutated = False
    for record in records:
        if record.get("dataset_id") != dataset_id:
            continue
        if _apply_cold_state(record, now):
            mutated = True
        if _apply_ttl_transition(record, now):
            mutated = True
    if mutated:
        _save_lifecycle(records)
    return [_serialize_lifecycle(record) for record in records if record.get("dataset_id") == dataset_id]


def _dataset_exists(dataset_id: str) -> bool:
    for dataset in load_all_datasets():
        if dataset.get("id") == dataset_id:
            return True
    return False


def _get_dataset(dataset_id: str) -> Optional[Dict[str, Any]]:
    for dataset in load_all_datasets():
        if dataset.get("id") == dataset_id:
            return ensure_dataset_dates(dataset)
    return None


def _find_version(dataset_id: str, version_id: str) -> Optional[Dict[str, Any]]:
    for item in _load_versions():
        if item.get("dataset_id") == dataset_id and item.get("id") == version_id:
            return item
    return None


def _update_dataset_rows(dataset_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    datasets = load_all_datasets()
    timestamp = int(time.time())
    updated_item: Optional[Dict[str, Any]] = None

    for index, item in enumerate(datasets):
        if item.get("id") == dataset_id:
            new_item = item.copy()
            new_item["sample_data"] = rows
            new_item["row_count"] = len(rows)
            new_item["updated_at"] = timestamp
            new_item["updated_date"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp))
            datasets[index] = new_item
            updated_item = new_item
            break

    if updated_item is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    save_all_datasets(datasets)
    return ensure_dataset_dates(updated_item)


def _calculate_metrics(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    numeric_accumulator: Dict[str, List[float]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            if isinstance(value, (int, float)):
                numeric_accumulator.setdefault(key, []).append(float(value))
    metrics: Dict[str, Dict[str, float]] = {}
    for column, values in numeric_accumulator.items():
        metrics[column] = {
            "count": float(len(values)),
            "sum": float(sum(values)),
            "avg": float(mean(values)) if values else 0.0,
            "min": float(min(values)) if values else 0.0,
            "max": float(max(values)) if values else 0.0,
        }
    return metrics


def _normalize_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for row in rows:
        if isinstance(row, dict):
            normalized.append(row)
    return normalized


def _row_key(row: Dict[str, Any]) -> str:
    return json.dumps(row, ensure_ascii=False, sort_keys=True)


def _compare_rows(current: List[Dict[str, Any]], previous: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Tuple[Dict[str, Any], Dict[str, Any]]]]:
    current_index = { _row_key(row): row for row in current }
    previous_index = { _row_key(row): row for row in previous }

    added = [row for key, row in current_index.items() if key not in previous_index]
    removed = [row for key, row in previous_index.items() if key not in current_index]

    common_keys = set(current_index.keys()) & set(previous_index.keys())
    changed: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    for key in common_keys:
        current_row = current_index[key]
        previous_row = previous_index[key]
        if current_row != previous_row:
            changed.append((previous_row, current_row))

    return added, removed, changed


def _metrics_delta(current: Dict[str, Dict[str, float]], previous: Dict[str, Dict[str, float]]) -> Dict[str, Dict[str, float]]:
    delta: Dict[str, Dict[str, float]] = {}
    for column in set(current.keys()) | set(previous.keys()):
        curr = current.get(column, {})
        prev = previous.get(column, {})
        delta[column] = {
            "count": curr.get("count", 0.0) - prev.get("count", 0.0),
            "sum": curr.get("sum", 0.0) - prev.get("sum", 0.0),
            "avg": curr.get("avg", 0.0) - prev.get("avg", 0.0),
            "min": curr.get("min", 0.0) - prev.get("min", 0.0),
            "max": curr.get("max", 0.0) - prev.get("max", 0.0),
        }
    return delta


class SnapshotRequest(BaseModel):
    rows: Optional[List[Dict[str, Any]]] = Field(default=None, description="Подготовленные строки данных для снимка")
    notes: Optional[str] = Field(default=None, description="Примечания версии")
    author: Optional[str] = Field(default=None, description="Автор снимка")


class DatasetVersionResponse(BaseModel):
    id: str
    dataset_id: str
    version_number: int
    created_at: int
    created_date: str
    row_count: int
    metrics: Dict[str, Dict[str, float]]
    notes: Optional[str]
    author: Optional[str]
    change_summary: Optional[Dict[str, Any]]
    lifecycle: Optional[DatasetVersionLifecycleResponse] = None


class VersionDiffResponse(BaseModel):
    current_version: DatasetVersionResponse
    previous_version: DatasetVersionResponse
    added_rows: List[Dict[str, Any]]
    removed_rows: List[Dict[str, Any]]
    changed_rows: List[Dict[str, Any]]
    metrics_delta: Dict[str, Dict[str, float]]
    highlights: List[str]


class LifecycleConfigureRequest(BaseModel):
    ttl_days: Optional[int] = Field(
        default=None, ge=0, description="Количество дней до архивирования версии"
    )
    cold_after_days: Optional[int] = Field(
        default=None,
        ge=0,
        description="Количество дней без обращений, после которых версия помечается как 'холодная'",
    )


class LifecycleEvaluateRequest(BaseModel):
    current_time: Optional[str] = Field(
        default=None,
        description="ISO-время, используемое для оценки TTL. Если не указано — используется текущее время",
    )


def _serialize_version(raw: Dict[str, Any]) -> DatasetVersionResponse:
    enriched = raw.copy()
    lifecycle = _ensure_lifecycle(raw.get("dataset_id"), raw.get("id"))
    enriched["lifecycle"] = _serialize_lifecycle(lifecycle)
    return DatasetVersionResponse(**enriched)


@router.get("/{dataset_id}/versions", response_model=List[DatasetVersionResponse])
def list_versions(dataset_id: str) -> List[DatasetVersionResponse]:
    if not _dataset_exists(dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found")
    versions = [
        item
        for item in _load_versions()
        if item.get("dataset_id") == dataset_id
    ]
    versions.sort(key=lambda item: item.get("version_number", 0), reverse=True)
    return [_serialize_version(item) for item in versions]


@router.post("/{dataset_id}/versions", response_model=DatasetVersionResponse)
def create_version(dataset_id: str, payload: SnapshotRequest) -> DatasetVersionResponse:
    dataset = _get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    all_versions = _load_versions()
    dataset_versions = [item for item in all_versions if item.get("dataset_id") == dataset_id]
    next_version_number = 1
    if dataset_versions:
        next_version_number = max(v.get("version_number", 0) for v in dataset_versions) + 1

    rows = payload.rows if payload.rows is not None else dataset.get("sample_data") or []
    normalized_rows = _normalize_rows(rows)
    metrics = _calculate_metrics(normalized_rows)

    change_summary = None
    if dataset_versions:
        previous = dataset_versions[-1]
        previous_rows = previous.get("rows", [])
        added, removed, changed = _compare_rows(normalized_rows, previous_rows)
        change_summary = {
            "rows_added": len(added),
            "rows_removed": len(removed),
            "rows_changed": len(changed),
        }
    else:
        change_summary = {
            "rows_added": len(normalized_rows),
            "rows_removed": 0,
            "rows_changed": 0,
        }

    timestamp = int(time.time())
    version_entry = {
        "id": str(uuid.uuid4()),
        "dataset_id": dataset_id,
        "version_number": next_version_number,
        "created_at": timestamp,
        "created_date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp)),
        "row_count": len(normalized_rows),
        "metrics": metrics,
        "rows": normalized_rows,
        "notes": payload.notes,
        "author": payload.author,
        "change_summary": change_summary,
    }

    all_versions.append(version_entry)
    _save_versions(all_versions)

    return _serialize_version(version_entry)


@router.get("/{dataset_id}/versions/{version_id}", response_model=DatasetVersionResponse)
def get_version(dataset_id: str, version_id: str) -> DatasetVersionResponse:
    versions = list_versions(dataset_id)
    for version in versions:
        if version.id == version_id:
            return version
    raise HTTPException(status_code=404, detail="Version not found")


def _build_highlights(change_summary: Dict[str, Any], metrics_delta: Dict[str, Dict[str, float]]) -> List[str]:
    highlights: List[str] = []
    rows_added = int(change_summary.get("rows_added", 0))
    rows_removed = int(change_summary.get("rows_removed", 0))
    rows_changed = int(change_summary.get("rows_changed", 0))

    if rows_added:
        highlights.append(f"Добавлено строк: {rows_added}")
    if rows_removed:
        highlights.append(f"Удалено строк: {rows_removed}")
    if rows_changed:
        highlights.append(f"Изменено строк: {rows_changed}")

    significant_metrics = [
        (column, delta)
        for column, delta in metrics_delta.items()
        if abs(delta.get("avg", 0.0)) > 0.01 or abs(delta.get("sum", 0.0)) > 0.01
    ]
    for column, delta in significant_metrics[:5]:
        avg_delta = delta.get("avg", 0.0)
        sum_delta = delta.get("sum", 0.0)
        if avg_delta:
            highlights.append(f"Среднее по '{column}' изменилось на {avg_delta:.2f}")
        if sum_delta:
            highlights.append(f"Сумма по '{column}' изменилась на {sum_delta:.2f}")

    if not highlights:
        highlights.append("Изменения в метриках незначительны")
    return highlights


@router.get("/{dataset_id}/versions/{current_id}/diff/{previous_id}", response_model=VersionDiffResponse)
def diff_versions(dataset_id: str, current_id: str, previous_id: str) -> VersionDiffResponse:
    versions = [item for item in _load_versions() if item.get("dataset_id") == dataset_id]
    current = next((item for item in versions if item.get("id") == current_id), None)
    previous = next((item for item in versions if item.get("id") == previous_id), None)

    if not current or not previous:
        raise HTTPException(status_code=404, detail="Version not found")

    current_rows = _normalize_rows(current.get("rows", []))
    previous_rows = _normalize_rows(previous.get("rows", []))

    added, removed, changed_pairs = _compare_rows(current_rows, previous_rows)
    changed_preview = []
    for before, after in changed_pairs[:10]:
        preview_row = before.copy()
        for key, value in after.items():
            if before.get(key) != value:
                preview_row[key] = {"before": before.get(key), "after": value}
        changed_preview.append(preview_row)

    metrics_delta = _metrics_delta(current.get("metrics", {}), previous.get("metrics", {}))

    change_summary = current.get("change_summary") or {
        "rows_added": len(added),
        "rows_removed": len(removed),
        "rows_changed": len(changed_pairs),
    }

    highlights = _build_highlights(change_summary, metrics_delta)

    response = VersionDiffResponse(
        current_version=_serialize_version(current),
        previous_version=_serialize_version(previous),
        added_rows=added[:10],
        removed_rows=removed[:10],
        changed_rows=changed_preview,
        metrics_delta=metrics_delta,
        highlights=highlights,
    )
    return response


@router.post("/{dataset_id}/versions/{version_id}/restore", response_model=DatasetVersionResponse)
def restore_version(dataset_id: str, version_id: str) -> DatasetVersionResponse:
    dataset = _get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    version = _require_version(dataset_id, version_id)

    rows = _normalize_rows(version.get("rows", []))
    _update_dataset_rows(dataset_id, rows)

    return _serialize_version(version)


@router.get("/{dataset_id}/versions/{version_id}/lifecycle", response_model=DatasetVersionLifecycleResponse)
def get_version_lifecycle(dataset_id: str, version_id: str) -> DatasetVersionLifecycleResponse:
    _require_version(dataset_id, version_id)
    record = _ensure_lifecycle(dataset_id, version_id)
    return _serialize_lifecycle(record)


@router.post(
    "/{dataset_id}/versions/{version_id}/lifecycle/configure",
    response_model=DatasetVersionLifecycleResponse,
)
def configure_version_lifecycle(
    dataset_id: str, version_id: str, payload: LifecycleConfigureRequest
) -> DatasetVersionLifecycleResponse:
    _require_version(dataset_id, version_id)
    record = _ensure_lifecycle(dataset_id, version_id).copy()
    now = _utcnow()

    if payload.ttl_days is not None:
        ttl_days = int(payload.ttl_days)
        record["ttl_days"] = ttl_days
        record["ttl_at"] = _to_iso(now + timedelta(days=ttl_days)) if ttl_days > 0 else _to_iso(now)

    if payload.cold_after_days is not None:
        cold_after_days = int(payload.cold_after_days)
        record["cold_after_days"] = cold_after_days
        if cold_after_days == 0:
            record["cold_since"] = _to_iso(now)
        else:
            record["cold_since"] = None

    _persist_lifecycle(record)
    return _serialize_lifecycle(record)


@router.post(
    "/{dataset_id}/versions/{version_id}/lifecycle/mark-access",
    response_model=DatasetVersionLifecycleResponse,
)
def mark_version_access(dataset_id: str, version_id: str) -> DatasetVersionLifecycleResponse:
    _require_version(dataset_id, version_id)
    record = _ensure_lifecycle(dataset_id, version_id).copy()
    now = _utcnow()
    record["last_accessed_at"] = _to_iso(now)
    record["cold_since"] = None
    _persist_lifecycle(record)
    return _serialize_lifecycle(record)


@router.post(
    "/{dataset_id}/versions/{version_id}/restore-from-archive",
    response_model=DatasetVersionLifecycleResponse,
)
def restore_from_archive(dataset_id: str, version_id: str) -> DatasetVersionLifecycleResponse:
    _require_version(dataset_id, version_id)
    record = _ensure_lifecycle(dataset_id, version_id).copy()
    status = record.get("status", LifecycleStatus.ACTIVE.value)
    if status != LifecycleStatus.ARCHIVED.value:
        raise HTTPException(status_code=400, detail="Version is not archived")

    now = _utcnow()
    record["status"] = LifecycleStatus.ACTIVE.value
    record["restored_at"] = _to_iso(now)
    record["last_accessed_at"] = record["restored_at"]
    record["cold_since"] = None
    _persist_lifecycle(record)
    return _serialize_lifecycle(record)


@router.post(
    "/{dataset_id}/versions/lifecycle/run-ttl",
    response_model=List[DatasetVersionLifecycleResponse],
)
def run_lifecycle_ttl(dataset_id: str, payload: LifecycleEvaluateRequest) -> List[DatasetVersionLifecycleResponse]:
    if not _dataset_exists(dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found")
    now = _utcnow()
    if payload.current_time:
        parsed = _from_iso(payload.current_time)
        if parsed:
            now = parsed
    return _evaluate_dataset_lifecycle(dataset_id, now)
