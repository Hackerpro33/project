"""HTTP interface for managing recurring task schedules."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

try:  # pragma: no cover - allow running module as script
    from .services.scheduler import (
        InvalidSchedule,
        ScheduleConfig,
        ScheduleNotFound,
        TaskScheduler,
    )
except ImportError:  # pragma: no cover
    from services.scheduler import (  # type: ignore
        InvalidSchedule,
        ScheduleConfig,
        ScheduleNotFound,
        TaskScheduler,
    )


router = APIRouter(prefix="", tags=["schedules"])
_scheduler = TaskScheduler()


class ScheduleCreateRequest(BaseModel):
    """Payload for registering a new schedule."""

    name: str = Field(..., min_length=1)
    task: str = Field(..., min_length=1)
    cron: str = Field(..., min_length=1)
    sla_seconds: int = Field(300, ge=1)
    max_retries: int = Field(3, ge=0)
    payload: Dict[str, Any] = Field(default_factory=dict)


class ScheduleUpdateRequest(BaseModel):
    """Subset of fields that may be updated on an existing schedule."""

    name: Optional[str] = Field(None, min_length=1)
    task: Optional[str] = Field(None, min_length=1)
    cron: Optional[str] = Field(None, min_length=1)
    sla_seconds: Optional[int] = Field(None, ge=1)
    max_retries: Optional[int] = Field(None, ge=0)
    payload: Optional[Dict[str, Any]] = None


def _as_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ScheduleNotFound):
        return HTTPException(status_code=404, detail="Schedule not found")
    if isinstance(exc, InvalidSchedule):
        return HTTPException(status_code=400, detail=str(exc))
    raise exc


@router.get("/schedules")
def list_schedules() -> Dict[str, Any]:
    """Return all configured schedules."""

    schedules = _scheduler.list_schedules()
    return {"items": schedules, "count": len(schedules)}


@router.get("/schedules/due")
def list_due_schedules() -> Dict[str, Any]:
    """Return schedules that should execute immediately."""

    schedules = _scheduler.get_due_jobs()
    return {"items": schedules, "count": len(schedules)}


@router.get("/schedules/{schedule_id}")
def get_schedule(schedule_id: str) -> Dict[str, Any]:
    """Return a single schedule."""

    try:
        return _scheduler.get_schedule(schedule_id)
    except ScheduleNotFound as exc:  # pragma: no cover - exercised via API tests
        raise HTTPException(status_code=404, detail="Schedule not found") from exc


@router.post("/schedules", status_code=201)
def create_schedule(payload: ScheduleCreateRequest) -> Dict[str, Any]:
    """Register a new recurring task."""

    config = ScheduleConfig(**payload.model_dump())
    try:
        schedule = _scheduler.register_job(config)
    except InvalidSchedule as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "scheduled", "schedule": schedule}


@router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: str, payload: ScheduleUpdateRequest) -> Dict[str, Any]:
    """Update schedule attributes."""

    updates = payload.model_dump(exclude_unset=True)
    try:
        schedule = _scheduler.update_schedule(schedule_id, **updates)
    except (ScheduleNotFound, InvalidSchedule) as exc:
        raise _as_http_error(exc) from exc
    return {"status": "updated", "schedule": schedule}


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: str) -> Dict[str, Any]:
    """Delete a stored schedule."""

    try:
        _scheduler.delete_schedule(schedule_id)
    except ScheduleNotFound as exc:
        raise HTTPException(status_code=404, detail="Schedule not found") from exc
    return {"status": "deleted", "id": schedule_id}


@router.post("/schedules/{schedule_id}/pause")
def pause_schedule(schedule_id: str) -> Dict[str, Any]:
    """Pause future executions for the schedule."""

    try:
        schedule = _scheduler.pause_schedule(schedule_id)
    except (ScheduleNotFound, InvalidSchedule) as exc:
        raise _as_http_error(exc) from exc
    return {"status": "paused", "schedule": schedule}


@router.post("/schedules/{schedule_id}/resume")
def resume_schedule(schedule_id: str) -> Dict[str, Any]:
    """Resume a paused or failed schedule."""

    try:
        schedule = _scheduler.resume_schedule(schedule_id)
    except (ScheduleNotFound, InvalidSchedule) as exc:
        raise _as_http_error(exc) from exc
    return {"status": "resumed", "schedule": schedule}


@router.get("/schedules/{schedule_id}/preview")
def preview_schedule(
    schedule_id: str,
    count: int = Query(5, ge=1, le=50, description="Number of upcoming runs to preview"),
) -> Dict[str, Any]:
    """Return future execution timestamps for UI preview."""

    try:
        runs = _scheduler.preview_runs(schedule_id, count=count)
    except (ScheduleNotFound, InvalidSchedule) as exc:
        raise _as_http_error(exc) from exc
    return {"items": runs, "count": len(runs)}

