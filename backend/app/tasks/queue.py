"""Redis/RQ backed background tasks for long-running analytics."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException
from redis import Redis
from redis.exceptions import RedisError
from rq import Queue, get_current_job
from rq.exceptions import NoSuchJobError
from rq.job import Job

from app.core.config import get_settings
from app.services.extraction import build_extraction
from app.utils.files import load_dataframe_from_identifier
from app.utils.task_history import get_task_history_store


class TaskQueueUnavailable(RuntimeError):
    """Raised when the task queue cannot be reached or is disabled."""


def _ensure_queue() -> Queue:
    settings = get_settings()
    if not settings.task_queue_enabled:
        raise TaskQueueUnavailable("Task queue is disabled. Set TASK_QUEUE_ENABLED=1 to activate it.")

    try:
        connection = Redis.from_url(settings.redis_url, decode_responses=False)
    except RedisError as exc:  # pragma: no cover - connection construction issues
        raise TaskQueueUnavailable(f"Failed to create Redis connection: {exc}") from exc

    try:
        return Queue(
            settings.task_queue_name,
            connection=connection,
            default_timeout=settings.task_default_timeout,
        )
    except RedisError as exc:  # pragma: no cover - queue initialisation errors
        raise TaskQueueUnavailable(f"Failed to initialize task queue: {exc}") from exc


def process_extraction_job(file_url: str) -> Dict[str, Any]:
    """Worker-side execution for dataset extraction."""

    job = get_current_job()
    task_id = job.id if job else None
    history = get_task_history_store()
    if task_id:
        history.update_status(
            task_id,
            "running",
            message="Extraction started",
            task_type="extraction",
        )

    try:
        df = load_dataframe_from_identifier(file_url)
        result = build_extraction(df)
    except Exception as exc:  # pragma: no cover - safeguarding unexpected errors
        if task_id:
            history.update_status(
                task_id,
                "failed",
                message=f"Extraction failed: {exc}",
                level="error",
                task_type="extraction",
                extra={"error": str(exc)},
            )
        raise

    if task_id:
        history.update_status(
            task_id,
            "finished",
            message="Extraction completed",
            task_type="extraction",
            extra={
                "result_summary": {
                    "row_count": result.get("row_count"),
                    "column_count": len(result.get("columns", [])),
                }
            },
        )
    return result


def enqueue_extraction(file_url: str) -> str:
    """Schedule an asynchronous extraction job and return its task identifier."""

    queue = _ensure_queue()
    try:
        job = queue.enqueue(process_extraction_job, file_url)
    except RedisError as exc:  # pragma: no cover - network/infra failure
        raise TaskQueueUnavailable(f"Failed to enqueue task: {exc}") from exc
    history = get_task_history_store()
    history.record_enqueued(job.id, "extraction", params={"file_url": file_url})
    return job.id


def serialize_job(job: Job) -> Dict[str, Any]:
    """Convert an RQ job into an API friendly payload."""

    status = job.get_status(refresh=False)
    payload: Dict[str, Any] = {
        "task_id": job.id,
        "status": status,
    }
    if status == "finished" and job.result is not None:
        payload["result"] = job.result
    if status == "failed":
        payload["error"] = job.exc_info
    return payload


def get_task_status(task_id: str) -> Dict[str, Any]:
    """Fetch task status and optional results."""

    queue = _ensure_queue()
    try:
        job = Job.fetch(task_id, connection=queue.connection)
    except NoSuchJobError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
    except RedisError as exc:  # pragma: no cover - network/infra failure
        raise TaskQueueUnavailable(f"Failed to communicate with task queue: {exc}") from exc

    return serialize_job(job)


__all__ = [
    "enqueue_extraction",
    "get_task_status",
    "process_extraction_job",
    "serialize_job",
    "TaskQueueUnavailable",
]
