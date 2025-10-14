"""Weighted fair scheduler for GPU tasks."""
from __future__ import annotations

import heapq
import itertools
import time
from dataclasses import dataclass
from typing import List, Optional

from .models import ScheduledGpuJob


@dataclass(order=True, slots=True)
class _HeapItem:
    ready_at: float
    finish_time: float
    sequence: int
    job: ScheduledGpuJob


class GpuScheduler:
    """Weighted fair queue with exponential backoff."""

    def __init__(self, max_attempts: int = 3) -> None:
        self._max_attempts = max(1, max_attempts)
        self._heap: List[_HeapItem] = []
        self._virtual_time = 0.0
        self._sequence = itertools.count()

    def add(self, job: ScheduledGpuJob) -> None:
        sequence = next(self._sequence)
        now = time.monotonic()
        self._virtual_time = max(self._virtual_time, float(sequence))
        job.sequence = sequence
        job.finish_time = self._virtual_time + job.service_time / max(job.weight, 0.1)
        job.ready_at = now
        heapq.heappush(self._heap, _HeapItem(job.ready_at, job.finish_time, sequence, job))

    def pop_ready(self, now: Optional[float] = None) -> Optional[ScheduledGpuJob]:
        if not self._heap:
            return None
        current_time = time.monotonic() if now is None else now
        item = self._heap[0]
        if item.ready_at > current_time:
            return None
        heapq.heappop(self._heap)
        self._virtual_time = max(self._virtual_time, item.finish_time)
        return item.job

    def time_until_ready(self, now: Optional[float] = None) -> Optional[float]:
        if not self._heap:
            return None
        current_time = time.monotonic() if now is None else now
        head = self._heap[0]
        delta = head.ready_at - current_time
        return max(0.0, delta)

    def mark_retry(self, job: ScheduledGpuJob, now: Optional[float] = None) -> None:
        current_time = time.monotonic() if now is None else now
        job.attempt += 1
        backoff = min(60.0, float(2 ** job.attempt))
        job.ready_at = current_time + backoff
        heapq.heappush(self._heap, _HeapItem(job.ready_at, job.finish_time, job.sequence, job))

    def should_degrade(self, job: ScheduledGpuJob) -> bool:
        return job.attempt >= self._max_attempts

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self._heap)


__all__ = ["GpuScheduler"]
