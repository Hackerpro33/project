"""Cron-based task scheduler with SLA enforcement and retry support."""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from croniter import croniter

from ..utils.files import DATA_DIR, export_json_atomic

logger = logging.getLogger(__name__)


class InvalidSchedule(ValueError):
    """Raised when a schedule definition fails validation."""


class ScheduleNotFound(KeyError):
    """Raised when attempting to mutate an unknown schedule."""


@dataclass(slots=True)
class ScheduleConfig:
    """Configuration payload for registering a scheduled task."""

    name: str
    task: str
    cron: str
    sla_seconds: int = 300
    max_retries: int = 3
    payload: Dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        if not self.name:
            raise InvalidSchedule("Schedule name is required")
        if not self.task:
            raise InvalidSchedule("Task identifier is required")
        if not croniter.is_valid(self.cron):
            raise InvalidSchedule(f"Invalid cron expression: {self.cron}")
        if self.sla_seconds <= 0:
            raise InvalidSchedule("SLA must be a positive number of seconds")
        if self.max_retries < 0:
            raise InvalidSchedule("max_retries must be >= 0")
        if not isinstance(self.payload, dict):
            raise InvalidSchedule("payload must be a dictionary")


class TaskScheduler:
    """Persisted cron scheduler aware of SLA breaches and retries."""

    def __init__(self, storage_path: Optional[Path] = None) -> None:
        self._path = storage_path or (DATA_DIR / "task_schedules.json")
        self._path.parent.mkdir(parents=True, exist_ok=True)

    # -- public API -------------------------------------------------
    def register_job(self, config: ScheduleConfig, now: Optional[datetime] = None) -> Dict[str, Any]:
        """Persist a new scheduled job."""

        config.validate()
        current_time = _ensure_utc(now)
        next_run = _next_run(config.cron, current_time)
        schedule = {
            "id": str(uuid.uuid4()),
            "name": config.name,
            "task": config.task,
            "cron": config.cron,
            "sla_seconds": int(config.sla_seconds),
            "max_retries": int(config.max_retries),
            "payload": config.payload,
            "created_at": _to_iso(current_time),
            "updated_at": _to_iso(current_time),
            "last_run_at": None,
            "last_run_started": None,
            "next_run_due": _to_iso(next_run),
            "status": "pending",
            "retry_count": 0,
            "last_error": None,
        }
        schedules = self._load()
        schedules.append(schedule)
        self._save(schedules)
        logger.debug("Registered new schedule", extra={"schedule_id": schedule["id"]})
        return schedule

    def list_schedules(self) -> List[Dict[str, Any]]:
        """Return all schedules ordered by next due date."""

        schedules = self._load()
        schedules.sort(key=lambda item: item.get("next_run_due") or "")
        return schedules

    def get_schedule(self, schedule_id: str) -> Dict[str, Any]:
        """Return a single schedule by identifier."""

        for schedule in self._load():
            if schedule.get("id") == schedule_id:
                return schedule
        raise ScheduleNotFound(schedule_id)

    def delete_schedule(self, schedule_id: str) -> None:
        """Remove schedule from storage."""

        schedules = self._load()
        filtered = [item for item in schedules if item.get("id") != schedule_id]
        if len(filtered) == len(schedules):
            raise ScheduleNotFound(schedule_id)
        self._save(filtered)
        logger.debug("Deleted schedule", extra={"schedule_id": schedule_id})

    def update_schedule(
        self,
        schedule_id: str,
        *,
        name: Optional[str] = None,
        cron: Optional[str] = None,
        task: Optional[str] = None,
        sla_seconds: Optional[int] = None,
        max_retries: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Mutate persisted schedule attributes."""

        def _apply_updates(schedule: Dict[str, Any]) -> Dict[str, Any]:
            current_time = _ensure_utc(now)
            if name is not None:
                if not name:
                    raise InvalidSchedule("Schedule name is required")
                schedule["name"] = name
            if task is not None:
                if not task:
                    raise InvalidSchedule("Task identifier is required")
                schedule["task"] = task
            if cron is not None:
                if not croniter.is_valid(cron):
                    raise InvalidSchedule(f"Invalid cron expression: {cron}")
                schedule["cron"] = cron
            if sla_seconds is not None:
                if sla_seconds <= 0:
                    raise InvalidSchedule("SLA must be a positive number of seconds")
                schedule["sla_seconds"] = int(sla_seconds)
            if max_retries is not None:
                if max_retries < 0:
                    raise InvalidSchedule("max_retries must be >= 0")
                schedule["max_retries"] = int(max_retries)
            if payload is not None:
                if not isinstance(payload, dict):
                    raise InvalidSchedule("payload must be a dictionary")
                schedule["payload"] = payload

            previous_status = schedule.get("status")
            schedule["updated_at"] = _to_iso(current_time)
            if previous_status != "paused":
                schedule["next_run_due"] = _to_iso(_next_run(schedule["cron"], current_time))
            schedule.setdefault("retry_count", 0)
            if previous_status == "failed" and schedule.get("next_run_due"):
                schedule["status"] = "pending"
                schedule["retry_count"] = 0
                schedule["last_error"] = None
            return schedule

        return self._mutate(schedule_id, _apply_updates)

    def get_due_jobs(self, reference_time: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Return schedules that should run at ``reference_time``."""

        now = _ensure_utc(reference_time)
        self.enforce_sla(now)
        due: List[Dict[str, Any]] = []
        for schedule in self._load():
            if schedule.get("status") not in {"pending", "idle"}:
                continue
            next_run_due = schedule.get("next_run_due")
            if not next_run_due:
                continue
            if _from_iso(next_run_due) <= now:
                due.append(schedule)
        due.sort(key=lambda item: item.get("next_run_due") or "")
        return due

    def mark_running(self, schedule_id: str, started_at: Optional[datetime] = None) -> Dict[str, Any]:
        """Mark the schedule as currently running."""

        return self._mutate(schedule_id, lambda schedule: self._set_running(schedule, started_at))

    def mark_completed(self, schedule_id: str, completed_at: Optional[datetime] = None) -> Dict[str, Any]:
        """Mark successful completion and schedule the next run."""

        return self._mutate(schedule_id, lambda schedule: self._set_completed(schedule, completed_at))

    def mark_failed(
        self,
        schedule_id: str,
        error: str,
        failed_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Register a failed run and manage retries."""

        return self._mutate(schedule_id, lambda schedule: self._set_failed(schedule, error, failed_at))

    def pause_schedule(
        self, schedule_id: str, paused_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Temporarily disable schedule execution."""

        return self._mutate(schedule_id, lambda schedule: self._set_paused(schedule, paused_at))

    def resume_schedule(
        self, schedule_id: str, resumed_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Re-activate a previously paused or failed schedule."""

        return self._mutate(schedule_id, lambda schedule: self._set_resumed(schedule, resumed_at))

    def preview_runs(
        self,
        schedule_id: str,
        *,
        count: int = 5,
        reference_time: Optional[datetime] = None,
    ) -> List[str]:
        """Return the next ``count`` scheduled run timestamps."""

        if count <= 0:
            return []
        schedule = self.get_schedule(schedule_id)
        reference = _ensure_utc(reference_time)
        runs: List[str] = []

        next_due = schedule.get("next_run_due")
        base = reference
        if next_due:
            next_due_dt = _from_iso(next_due)
            if next_due_dt >= reference:
                runs.append(_to_iso(next_due_dt))
                base = next_due_dt
            else:
                base = reference

        remaining = max(count - len(runs), 0)
        iterator = croniter(schedule["cron"], base)
        for _ in range(remaining):
            runs.append(_to_iso(iterator.get_next(datetime)))
        return runs[:count]

    def enforce_sla(self, reference_time: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Ensure running jobs obey their SLA and trigger retries if exceeded."""

        now = _ensure_utc(reference_time)
        mutated: List[Dict[str, Any]] = []
        schedules = self._load()
        updated = False
        for index, schedule in enumerate(schedules):
            if schedule.get("status") != "running":
                continue
            started_at = schedule.get("last_run_started")
            if not started_at:
                continue
            elapsed = now - _from_iso(started_at)
            sla = timedelta(seconds=int(schedule.get("sla_seconds", 0)))
            if elapsed > sla:
                logger.warning(
                    "SLA breach detected",
                    extra={"schedule_id": schedule.get("id"), "elapsed": elapsed.total_seconds()},
                )
                schedule = self._set_failed(schedule, "SLA exceeded", now)
                schedules[index] = schedule
                mutated.append(schedule)
                updated = True
        if updated:
            self._save(schedules)
        return mutated

    # -- internal helpers ------------------------------------------
    def _mutate(self, schedule_id: str, mutator: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
        schedules = self._load()
        for index, schedule in enumerate(schedules):
            if schedule.get("id") == schedule_id:
                new_schedule = mutator(schedule.copy())
                schedules[index] = new_schedule
                self._save(schedules)
                return new_schedule
        raise ScheduleNotFound(schedule_id)

    def _set_running(self, schedule: Dict[str, Any], started_at: Optional[datetime]) -> Dict[str, Any]:
        now = _ensure_utc(started_at)
        schedule.update(
            {
                "status": "running",
                "last_run_started": _to_iso(now),
                "updated_at": _to_iso(now),
                "last_error": None,
            }
        )
        return schedule

    def _set_completed(self, schedule: Dict[str, Any], completed_at: Optional[datetime]) -> Dict[str, Any]:
        now = _ensure_utc(completed_at)
        schedule.update(
            {
                "status": "idle",
                "last_run_at": _to_iso(now),
                "last_run_started": None,
                "retry_count": 0,
                "last_error": None,
                "updated_at": _to_iso(now),
                "next_run_due": _to_iso(_next_run(schedule["cron"], now)),
            }
        )
        return schedule

    def _set_failed(
        self,
        schedule: Dict[str, Any],
        error: str,
        failed_at: Optional[datetime],
    ) -> Dict[str, Any]:
        now = _ensure_utc(failed_at)
        retry_count = int(schedule.get("retry_count", 0)) + 1
        schedule.update(
            {
                "status": "pending",
                "last_run_started": None,
                "last_error": error,
                "retry_count": retry_count,
                "updated_at": _to_iso(now),
                "next_run_due": _to_iso(now),
            }
        )
        if retry_count > int(schedule.get("max_retries", 0)):
            schedule["status"] = "failed"
            schedule["next_run_due"] = None
        return schedule

    def _set_paused(self, schedule: Dict[str, Any], paused_at: Optional[datetime]) -> Dict[str, Any]:
        if schedule.get("status") == "running":
            raise InvalidSchedule("Cannot pause a running schedule")
        now = _ensure_utc(paused_at)
        schedule.update(
            {
                "status": "paused",
                "updated_at": _to_iso(now),
                "next_run_due": None,
            }
        )
        return schedule

    def _set_resumed(self, schedule: Dict[str, Any], resumed_at: Optional[datetime]) -> Dict[str, Any]:
        now = _ensure_utc(resumed_at)
        previous_status = schedule.get("status")
        if previous_status == "running":
            raise InvalidSchedule("Cannot resume a running schedule")
        schedule.update(
            {
                "status": "pending",
                "updated_at": _to_iso(now),
                "next_run_due": _to_iso(_next_run(schedule["cron"], now)),
            }
        )
        if previous_status == "failed":
            schedule["retry_count"] = 0
            schedule["last_error"] = None
        return schedule

    def _load(self) -> List[Dict[str, Any]]:
        if not self._path.exists():
            return []
        try:
            with self._path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return []
        if isinstance(payload, list):
            return payload
        return []

    def _save(self, schedules: List[Dict[str, Any]]) -> None:
        export_json_atomic(self._path, schedules)


# -- utility helpers -----------------------------------------------------

def _ensure_utc(value: Optional[datetime]) -> datetime:
    if value is None:
        value = datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _next_run(cron_expr: str, reference: datetime) -> datetime:
    try:
        iterator = croniter(cron_expr, reference)
        return iterator.get_next(datetime)
    except (ValueError, KeyError) as exc:  # pragma: no cover - validated earlier
        raise InvalidSchedule(f"Invalid cron expression: {cron_expr}") from exc


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


__all__ = [
    "InvalidSchedule",
    "ScheduleConfig",
    "ScheduleNotFound",
    "TaskScheduler",
]
