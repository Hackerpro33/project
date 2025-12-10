from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.routes.datasets import _ensure_dates as ensure_dataset_dates
from app.api.routes.datasets import _load_all as load_all_datasets
from app.api.routes.datasets import _save_all as save_all_datasets

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


class VersionDiffResponse(BaseModel):
    current_version: DatasetVersionResponse
    previous_version: DatasetVersionResponse
    added_rows: List[Dict[str, Any]]
    removed_rows: List[Dict[str, Any]]
    changed_rows: List[Dict[str, Any]]
    metrics_delta: Dict[str, Dict[str, float]]
    highlights: List[str]


def _serialize_version(raw: Dict[str, Any]) -> DatasetVersionResponse:
    return DatasetVersionResponse(**raw)


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

    versions = [item for item in _load_versions() if item.get("dataset_id") == dataset_id]
    version = next((item for item in versions if item.get("id") == version_id), None)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    rows = _normalize_rows(version.get("rows", []))
    _update_dataset_rows(dataset_id, rows)

    return _serialize_version(version)
