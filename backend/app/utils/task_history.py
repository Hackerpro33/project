"""Utilities for persisting background task history and logs."""
from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .files import DATA_DIR, export_json_atomic

DEFAULT_HISTORY_PATH = DATA_DIR / "task_history.json"


class TaskHistoryStore:
    """Small JSON backed store keeping track of task lifecycle events."""

    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path is not None else DEFAULT_HISTORY_PATH
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> List[Dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except json.JSONDecodeError:
            return []
        if not isinstance(payload, list):
            return []
        return payload

    def _save(self, items: List[Dict[str, Any]]) -> None:
        export_json_atomic(self.path, items)

    def _timestamp(self) -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def clear(self) -> None:
        """Remove all recorded tasks."""

        export_json_atomic(self.path, [])

    def _parse_timestamp(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text)
        except ValueError as exc:  # pragma: no cover - validation handled by caller
            raise ValueError(f"Invalid timestamp: {value}") from exc

    def _matches_query(self, item: Dict[str, Any], query: str) -> bool:
        haystacks: Iterable[str] = (
            str(item.get("task_id", "")),
            str(item.get("task_type", "")),
            json.dumps(item.get("params", {}), ensure_ascii=False),
            json.dumps(item.get("metadata", {}), ensure_ascii=False),
        )
        combined = " ".join(part.lower() for part in haystacks)
        logs = item.get("log", []) or []
        if logs:
            log_payload = " ".join(json.dumps(entry, ensure_ascii=False).lower() for entry in logs)
            combined = f"{combined} {log_payload}".strip()
        return query in combined

    def list(
        self,
        *,
        statuses: Optional[Sequence[str]] = None,
        task_types: Optional[Sequence[str]] = None,
        query: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        items = self._load()
        if statuses:
            allowed = {status.lower() for status in statuses}
            items = [item for item in items if str(item.get("status", "")).lower() in allowed]
        if task_types:
            allowed_types = {task_type.lower() for task_type in task_types}
            items = [item for item in items if str(item.get("task_type", "")).lower() in allowed_types]

        since_dt = self._parse_timestamp(since) if since else None
        until_dt = self._parse_timestamp(until) if until else None
        if since_dt and until_dt and since_dt > until_dt:
            raise ValueError("Start timestamp must be earlier than end timestamp")

        if since_dt or until_dt:
            filtered: List[Dict[str, Any]] = []
            for item in items:
                timestamp = item.get("updated_at") or item.get("created_at")
                try:
                    item_dt = self._parse_timestamp(timestamp)
                except ValueError:
                    item_dt = None
                if item_dt is None:
                    continue
                if since_dt and item_dt < since_dt:
                    continue
                if until_dt and item_dt > until_dt:
                    continue
                filtered.append(item)
            items = filtered

        if query:
            needle = query.strip().lower()
            if needle:
                items = [item for item in items if self._matches_query(item, needle)]

        items.sort(key=lambda entry: entry.get("updated_at", entry.get("created_at", "")), reverse=True)
        return [copy.deepcopy(item) for item in items]

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        for item in self._load():
            if item.get("task_id") == task_id:
                return copy.deepcopy(item)
        return None

    def _ensure_entry(
        self,
        task_id: str,
        task_type: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        items = self._load()
        for index, item in enumerate(items):
            if item.get("task_id") == task_id:
                return item
        entry = {
            "task_id": task_id,
            "task_type": task_type or "unknown",
            "status": "queued",
            "created_at": self._timestamp(),
            "updated_at": self._timestamp(),
            "params": params or {},
            "metadata": metadata or {},
            "log": [],
        }
        if metadata and metadata.get("retry_of"):
            entry["parent_task_id"] = metadata["retry_of"]
        items.append(entry)
        self._save(items)
        return entry

    def record_enqueued(
        self,
        task_id: str,
        task_type: str,
        params: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        params = params or {}
        metadata = metadata or {}
        items = self._load()
        now = self._timestamp()
        entry = {
            "task_id": task_id,
            "task_type": task_type,
            "status": "queued",
            "created_at": now,
            "updated_at": now,
            "params": params,
            "metadata": metadata,
            "log": [
                {
                    "timestamp": now,
                    "level": "info",
                    "message": "Task enqueued",
                    "details": {"params": params},
                }
            ],
        }
        if metadata.get("retry_of"):
            entry["parent_task_id"] = metadata["retry_of"]
        items = [item for item in items if item.get("task_id") != task_id]
        items.append(entry)
        self._save(items)
        return copy.deepcopy(entry)

    def append_log(
        self,
        task_id: str,
        message: str,
        *,
        level: str = "info",
        details: Optional[Dict[str, Any]] = None,
        task_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        items = self._load()
        for index, item in enumerate(items):
            if item.get("task_id") == task_id:
                entry = item
                break
        else:
            entry = self._ensure_entry(task_id, task_type=task_type)
            items = self._load()
            for index, item in enumerate(items):
                if item.get("task_id") == task_id:
                    entry = item
                    break
        now = self._timestamp()
        log_entry = {
            "timestamp": now,
            "level": level,
            "message": message,
            "details": details or {},
        }
        entry.setdefault("log", []).append(log_entry)
        entry["updated_at"] = now
        self._save(items)
        return copy.deepcopy(entry)

    def update_status(
        self,
        task_id: str,
        status: str,
        *,
        message: Optional[str] = None,
        level: str = "info",
        task_type: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        items = self._load()
        for index, item in enumerate(items):
            if item.get("task_id") == task_id:
                entry = item
                break
        else:
            entry = self._ensure_entry(task_id, task_type=task_type)
            items = self._load()
            for index, item in enumerate(items):
                if item.get("task_id") == task_id:
                    entry = item
                    break
        now = self._timestamp()
        entry["status"] = status
        entry["updated_at"] = now
        if task_type:
            entry.setdefault("task_type", task_type)
        if extra:
            entry.update(extra)
        if message:
            entry.setdefault("log", []).append(
                {
                    "timestamp": now,
                    "level": level,
                    "message": message,
                    "details": extra or {},
                }
            )
        self._save(items)
        return copy.deepcopy(entry)

    def record_retry(
        self,
        original_task_id: str,
        new_task_id: str,
        task_type: str,
        params: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        metadata = metadata or {}
        self.append_log(
            original_task_id,
            f"Retried as {new_task_id}",
            details={"new_task_id": new_task_id},
            task_type=task_type,
        )
        metadata = {**metadata, "retry_of": original_task_id}
        return self.record_enqueued(new_task_id, task_type, params=params, metadata=metadata)


_DEFAULT_STORE: Optional[TaskHistoryStore] = None


def get_task_history_store() -> TaskHistoryStore:
    global _DEFAULT_STORE
    if _DEFAULT_STORE is None:
        _DEFAULT_STORE = TaskHistoryStore()
    return _DEFAULT_STORE


def set_task_history_store(store: TaskHistoryStore) -> None:
    global _DEFAULT_STORE
    _DEFAULT_STORE = store


def reset_task_history_store() -> None:
    global _DEFAULT_STORE
    _DEFAULT_STORE = None


__all__ = [
    "TaskHistoryStore",
    "get_task_history_store",
    "set_task_history_store",
    "reset_task_history_store",
]
