"""Async helpers tracking batch upload progress for real-time updates."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Set

from ..schemas import BatchUploadItem, BatchUploadProgressEvent, BatchUploadResponse


def _utc_now() -> str:
    """Return the current UTC timestamp formatted for JSON payloads."""

    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


class BatchProgressTracker:
    """In-memory tracker that records the lifecycle of multi-file uploads."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._batches: Dict[str, Dict[str, object]] = {}
        self._subscribers: Dict[str, Set[asyncio.Queue[BatchUploadProgressEvent]]] = defaultdict(set)

    async def start_batch(
        self,
        batch_id: str,
        items: Sequence[BatchUploadItem],
    ) -> BatchUploadResponse:
        """Initialise ``batch_id`` with ``items`` marked as queued."""

        timestamp = _utc_now()
        async with self._lock:
            state = {
                "batch_id": batch_id,
                "status": "processing",
                "created_at": timestamp,
                "updated_at": timestamp,
                "completed_at": None,
                "order": [item.upload_id for item in items],
                "items": {item.upload_id: item.model_dump() for item in items},
            }
            self._batches[batch_id] = state
            summary = self._build_snapshot(state)
            subscribers = list(self._subscribers.get(batch_id, set()))

        event = BatchUploadProgressEvent(
            batch_id=batch_id,
            event="batch-start",
            timestamp=timestamp,
            summary=summary,
        )
        await self._publish(subscribers, event)
        return summary

    async def update_item(
        self,
        batch_id: str,
        upload_id: str,
        *,
        status: str,
        filename: Optional[str] = None,
        file_url: Optional[str] = None,
        quick_extraction=None,
        error: Optional[str] = None,
    ) -> BatchUploadProgressEvent:
        """Update the state for ``upload_id`` within ``batch_id``."""

        timestamp = _utc_now()
        async with self._lock:
            state = self._batches.get(batch_id)
            if state is None:
                raise KeyError(batch_id)

            order: List[str] = state["order"]  # type: ignore[assignment]
            items: Dict[str, Dict[str, object]] = state["items"]  # type: ignore[assignment]

            item = items.get(upload_id)
            if item is None:
                item = {"upload_id": upload_id, "status": "queued"}
                items[upload_id] = item
                order.append(upload_id)

            if filename is not None:
                item["filename"] = filename
            if file_url is not None:
                item["file_url"] = file_url
            if quick_extraction is not None:
                item["quick_extraction"] = quick_extraction
            if status == "failed" and error is not None:
                item["error"] = error
            elif status == "success":
                item.pop("error", None)
            item["status"] = status

            state["updated_at"] = timestamp
            summary = self._build_snapshot(state)
            subscribers = list(self._subscribers.get(batch_id, set()))

        event_name = "item-progress" if status in {"queued", "processing"} else "item-complete"
        event = BatchUploadProgressEvent(
            batch_id=batch_id,
            event=event_name,
            timestamp=timestamp,
            item=BatchUploadItem.model_validate(items[upload_id]),
            summary=summary,
        )
        await self._publish(subscribers, event)
        return event

    async def finish_batch(
        self,
        batch_id: str,
        payload: BatchUploadResponse,
    ) -> BatchUploadResponse:
        """Persist the final ``payload`` and broadcast completion."""

        timestamp = _utc_now()
        async with self._lock:
            state = self._batches.setdefault(
                batch_id,
                {
                    "batch_id": batch_id,
                    "status": payload.status,
                    "created_at": timestamp,
                    "order": [],
                    "items": {},
                    "updated_at": timestamp,
                    "completed_at": timestamp,
                },
            )
            state["status"] = payload.status
            state["order"] = [item.upload_id for item in payload.items]
            state["items"] = {item.upload_id: item.model_dump() for item in payload.items}
            state["updated_at"] = timestamp
            state["completed_at"] = timestamp
            summary = self._build_snapshot(state)
            subscribers = list(self._subscribers.get(batch_id, set()))

        event = BatchUploadProgressEvent(
            batch_id=batch_id,
            event="batch-complete",
            timestamp=timestamp,
            summary=summary,
        )
        await self._publish(subscribers, event)
        return summary

    async def get_snapshot(self, batch_id: str) -> BatchUploadResponse:
        """Return the current snapshot for ``batch_id``."""

        async with self._lock:
            state = self._batches.get(batch_id)
            if state is None:
                raise KeyError(batch_id)
            return self._build_snapshot(state)

    async def stream(self, batch_id: str) -> Iterable[BatchUploadProgressEvent]:
        """Yield progress events for ``batch_id`` until the batch completes."""

        queue: asyncio.Queue[BatchUploadProgressEvent] = asyncio.Queue()
        async with self._lock:
            state = self._batches.get(batch_id)
            if state is None:
                raise KeyError(batch_id)
            self._subscribers[batch_id].add(queue)
            snapshot = self._build_snapshot(state)

        # Send an immediate snapshot so late subscribers catch up.
        await queue.put(
            BatchUploadProgressEvent(
                batch_id=batch_id,
                event="batch-snapshot",
                timestamp=_utc_now(),
                summary=snapshot,
            )
        )

        try:
            while True:
                event = await queue.get()
                yield event
                if event.event == "batch-complete":
                    break
        finally:
            async with self._lock:
                subscribers = self._subscribers.get(batch_id)
                if subscribers and queue in subscribers:
                    subscribers.remove(queue)
                    if not subscribers:
                        self._subscribers.pop(batch_id, None)

    async def _publish(
        self,
        subscribers: Sequence[asyncio.Queue[BatchUploadProgressEvent]],
        event: BatchUploadProgressEvent,
    ) -> None:
        for queue in subscribers:
            queue.put_nowait(event)

    def _build_snapshot(self, state: Dict[str, object]) -> BatchUploadResponse:
        order: List[str] = state.get("order", [])  # type: ignore[assignment]
        items: Dict[str, Dict[str, object]] = state.get("items", {})  # type: ignore[assignment]
        serialised = [BatchUploadItem.model_validate(items[item_id]) for item_id in order if item_id in items]
        return BatchUploadResponse(
            batch_id=state["batch_id"],
            status=state.get("status", "processing"),
            items=serialised,
        )


_tracker: Optional[BatchProgressTracker] = None


def get_batch_progress_tracker() -> BatchProgressTracker:
    """Return a singleton :class:`BatchProgressTracker`."""

    global _tracker
    if _tracker is None:
        _tracker = BatchProgressTracker()
    return _tracker


def set_batch_progress_tracker(tracker: BatchProgressTracker) -> None:
    """Override the global tracker (useful for tests)."""

    global _tracker
    _tracker = tracker


def reset_batch_progress_tracker() -> None:
    """Clear the global tracker forcing a fresh instance on next access."""

    global _tracker
    _tracker = None


__all__ = [
    "BatchProgressTracker",
    "get_batch_progress_tracker",
    "reset_batch_progress_tracker",
    "set_batch_progress_tracker",
]
