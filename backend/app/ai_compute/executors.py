"""Worker pool implementation for CPU/GPU execution."""
from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import Awaitable, Callable, Dict, Iterable, List, Optional

from prometheus_client import Counter, Gauge, Histogram

from .models import JobContext
from .profiler import Profiler

logger = logging.getLogger(__name__)

_JOB_DURATION = Histogram(
    "ai_job_duration_seconds",
    "Execution time for AI jobs",
    ["device"],
)
_QUEUE_WAIT = Histogram(
    "ai_job_queue_wait_seconds",
    "Time a job spent waiting for execution",
    ["device"],
)
_JOB_FAILURES = Counter(
    "ai_job_failures_total",
    "Number of job failures",
    ["device", "model"],
)
_IN_FLIGHT = Gauge(
    "ai_jobs_in_progress",
    "Currently executing jobs",
    ["device"],
)


class ModelRegistry:
    """Simple in-memory registry of model handlers."""

    def __init__(self) -> None:
        self._handlers: Dict[str, Callable[[JobContext, str, Optional[str]], Awaitable[None]]] = {}

    def register(self, model: str, handler: Callable[[JobContext, str, Optional[str]], Awaitable[None]]) -> None:
        self._handlers[model] = handler

    def get(self, model: str) -> Callable[[JobContext, str, Optional[str]], Awaitable[None]]:
        if model in self._handlers:
            return self._handlers[model]

        async def _default(job: JobContext, device: str, profile_path: Optional[str]) -> None:
            sleep_time = max(0.1, min(5.0, job.estimated_duration_s / 10))
            await asyncio.sleep(sleep_time)

        return _default


class WorkerPool:
    """Runs jobs sequentially on a given device."""

    def __init__(
        self,
        name: str,
        device: str,
        concurrency: int,
        queue: "asyncio.Queue[JobContext]",
        registry: ModelRegistry,
        profiler: Profiler,
        on_start: Callable[[JobContext, str], Awaitable[None]],
        on_complete: Callable[[JobContext, str, bool, Optional[BaseException]], Awaitable[None]],
        nsight_enabled: bool = False,
    ) -> None:
        self._name = name
        self._device = device
        self._concurrency = max(1, concurrency)
        self._queue = queue
        self._registry = registry
        self._profiler = profiler
        self._on_start = on_start
        self._on_complete = on_complete
        self._nsight_enabled = nsight_enabled
        self._tasks: List[asyncio.Task[None]] = []
        self._shutdown = False

    def start(self) -> Iterable[asyncio.Task[None]]:
        for idx in range(self._concurrency):
            task = asyncio.create_task(self._worker_loop(idx), name=f"{self._name}-worker-{idx}")
            self._tasks.append(task)
        return self._tasks

    async def stop(self) -> None:
        self._shutdown = True
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _worker_loop(self, worker_id: int) -> None:
        while not self._shutdown:
            try:
                job = await asyncio.wait_for(self._queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            start_time = time.perf_counter()
            wait_time = start_time - job.enqueue_time
            await self._on_start(job, self._device)
            handler = self._registry.get(job.model)
            profile_path: Optional[str] = None
            async with self._profiler.profile_job(job.job_id) as maybe_path:
                if maybe_path is not None:
                    profile_path = str(maybe_path)
                IN_FLIGHT_LABELS = _IN_FLIGHT.labels(device=self._device)
                IN_FLIGHT_LABELS.inc()
                try:
                    await self._invoke_handler(handler, job, profile_path)
                    duration = time.perf_counter() - start_time
                    _JOB_DURATION.labels(device=self._device).observe(duration)
                    _QUEUE_WAIT.labels(device=self._device).observe(wait_time)
                    await self._on_complete(job, self._device, True, None)
                except Exception as exc:  # pragma: no cover - defensive guard
                    _JOB_FAILURES.labels(device=self._device, model=job.model).inc()
                    await self._on_complete(job, self._device, False, exc)
                finally:
                    IN_FLIGHT_LABELS.dec()
            self._queue.task_done()

    async def _invoke_handler(
        self,
        handler: Callable[[JobContext, str, Optional[str]], Awaitable[None]],
        job: JobContext,
        profile_path: Optional[str],
    ) -> None:
        result = handler(job, self._device, profile_path)
        if inspect.isawaitable(result):
            await result
        else:
            await asyncio.get_running_loop().run_in_executor(None, result)


__all__ = ["WorkerPool", "ModelRegistry"]
