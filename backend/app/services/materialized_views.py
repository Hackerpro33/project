"""Helpers to maintain incremental aggregates in materialized view snapshots."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

APP_DIR = Path(__file__).resolve().parent.parent
CANDIDATE_DIRS = [APP_DIR / "data", APP_DIR.parent / "data", APP_DIR]

METRIC_FIELDS = ("count", "sum", "avg", "min", "max")
DEFAULT_HISTORY_LIMIT = 20


def _ensure_store_dir() -> Path:
    for directory in CANDIDATE_DIRS:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            return directory
        except Exception:
            continue
    fallback = APP_DIR
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


STORE_DIR = _ensure_store_dir()
MATERIALIZED_VIEWS_JSON = STORE_DIR / "materialized_views.json"


def _atomic_write_json(path: Path, data: Any) -> None:
    fd, tmp_name = tempfile.mkstemp(
        prefix="materialized_view_", suffix=".json", dir=str(path.parent)
    )
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


def _load_store() -> List[Dict[str, Any]]:
    if not MATERIALIZED_VIEWS_JSON.exists():
        return []
    try:
        with MATERIALIZED_VIEWS_JSON.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
            if isinstance(payload, list):
                return payload
    except Exception:
        pass
    return []


def _save_store(items: List[Dict[str, Any]]) -> None:
    _atomic_write_json(MATERIALIZED_VIEWS_JSON, items)


def _find_entry(items: List[Dict[str, Any]], dataset_id: str) -> Tuple[int, Optional[Dict[str, Any]]]:
    for index, entry in enumerate(items):
        if entry.get("dataset_id") == dataset_id:
            return index, entry
    return -1, None


def compute_metrics_delta(
    current: Dict[str, Dict[str, float]],
    previous: Optional[Dict[str, Dict[str, float]]] = None,
) -> Dict[str, Dict[str, float]]:
    """Calculate the delta between two metric snapshots."""

    baseline = previous or {}
    delta: Dict[str, Dict[str, float]] = {}
    for column in set(current.keys()) | set(baseline.keys()):
        curr = current.get(column, {})
        prev = baseline.get(column, {})
        delta[column] = {
            field: float(curr.get(field, 0.0)) - float(prev.get(field, 0.0))
            for field in METRIC_FIELDS
        }
    return delta


def _ensure_history(event_log: List[Dict[str, Any]], limit: int = DEFAULT_HISTORY_LIMIT) -> List[Dict[str, Any]]:
    if len(event_log) <= limit:
        return event_log
    return event_log[-limit:]


def update_materialized_view(
    dataset_id: str,
    version_entry: Dict[str, Any],
    metrics_delta: Dict[str, Dict[str, float]],
    strategy: str = "incremental",
) -> Dict[str, Any]:
    """Persist an incremental refresh result for a dataset."""

    store = _load_store()
    index, existing = _find_entry(store, dataset_id)

    metrics: Dict[str, Dict[str, float]] = version_entry.get("metrics", {}) or {}

    refresh_at = int(version_entry.get("created_at", time.time()))
    refresh_date = version_entry.get("created_date")
    if not refresh_date:
        refresh_date = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(refresh_at))

    if existing:
        baseline_metrics = existing.get("baseline_metrics") or existing.get("metrics", {})
        baseline_version_id = existing.get("baseline_version_id")
        baseline_version_number = existing.get("baseline_version_number")
        previous_version_id = existing.get("last_version_id")
        refresh_count = int(existing.get("refresh_count", 0)) + 1
        history = list(existing.get("history", []))
    else:
        baseline_metrics = metrics
        baseline_version_id = version_entry.get("id")
        baseline_version_number = version_entry.get("version_number")
        previous_version_id = None
        refresh_count = 1
        history = []

    delta_from_baseline = compute_metrics_delta(metrics, baseline_metrics)

    history.append(
        {
            "version_id": version_entry.get("id"),
            "version_number": version_entry.get("version_number"),
            "refreshed_at": refresh_at,
            "refreshed_date": refresh_date,
            "row_count": int(version_entry.get("row_count", 0)),
            "delta": metrics_delta,
            "change_summary": version_entry.get("change_summary"),
        }
    )
    history = _ensure_history(history)

    entry = {
        "dataset_id": dataset_id,
        "baseline_version_id": baseline_version_id,
        "baseline_version_number": baseline_version_number,
        "baseline_metrics": baseline_metrics,
        "last_version_id": version_entry.get("id"),
        "last_version_number": version_entry.get("version_number"),
        "last_refresh_at": refresh_at,
        "last_refresh_date": refresh_date,
        "row_count": int(version_entry.get("row_count", 0)),
        "strategy": strategy,
        "refresh_count": refresh_count,
        "metrics": metrics,
        "delta": metrics_delta,
        "delta_from_baseline": delta_from_baseline,
        "change_summary": version_entry.get("change_summary"),
        "previous_version_id": previous_version_id,
        "history": history,
    }

    if index >= 0:
        store[index] = entry
    else:
        store.append(entry)

    _save_store(store)
    return entry


def get_materialized_view(dataset_id: str) -> Optional[Dict[str, Any]]:
    """Return the stored materialized view metadata for a dataset if it exists."""

    _, existing = _find_entry(_load_store(), dataset_id)
    return existing


def list_materialized_views() -> List[Dict[str, Any]]:
    """Return all stored materialized view entries sorted by dataset identifier."""

    entries = _load_store()
    entries.sort(key=lambda item: item.get("dataset_id", ""))
    return entries


__all__ = [
    "compute_metrics_delta",
    "get_materialized_view",
    "list_materialized_views",
    "update_materialized_view",
]
