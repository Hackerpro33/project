"""Async service orchestrating job scheduling and execution."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import time
from typing import Dict, Optional

from prometheus_client import start_http_server
from redis import ResponseError
from redis.asyncio import Redis

from .config import AiComputeConfig, ModelProfile
from .executors import ModelRegistry, WorkerPool
from .gpu import GpuResourceManager
from .models import JobContext, JobPriority, ScheduledGpuJob, decode_priority
from .profiler import Profiler
from .scheduler import GpuScheduler

logger = logging.getLogger(__name__)


class AiComputeService:
    """Coordinates polling Redis, scheduling jobs and executing them."""

    def __init__(
        self,
        config: AiComputeConfig,
        redis: Optional[Redis] = None,
        registry: Optional[ModelRegistry] = None,
    ) -> None:
        self._config = config
        self._redis = redis or Redis.from_url(config.general.redis_url, decode_responses=False)
        self._consumer_group = config.general.consumer_group
        self._consumer_name = f"{socket.gethostname()}-{os.getpid()}"
        self._stream_name = config.general.stream_name
        self._events_stream = f"{self._stream_name}:events"
        self._cpu_queue: "asyncio.Queue[JobContext]" = asyncio.Queue()
        self._gpu_ready_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []
        self._shutdown_started = False
        self._registry = registry or ModelRegistry()
        self._profiler = Profiler(config.profiling)
        self._gpu_scheduler = GpuScheduler(config.general.max_gpu_retries)
        self._gpu_manager = GpuResourceManager(
            safety_factor=config.general.safety_factor,
            override_total_vram_mb=config.general.override_total_vram_mb,
        )
        self._cpu_pool = WorkerPool(
            name="cpu",
            device="cpu",
            concurrency=config.general.max_cpu_workers,
            queue=self._cpu_queue,
            registry=self._registry,
            profiler=self._profiler,
            on_start=self._on_job_start,
            on_complete=self._on_job_complete,
            nsight_enabled=False,
        )
        self._gpu_execution_queue: "asyncio.Queue[JobContext]" = asyncio.Queue()
        self._gpu_pool = WorkerPool(
            name="gpu",
            device="gpu",
            concurrency=config.general.max_gpu_workers,
            queue=self._gpu_execution_queue,
            registry=self._registry,
            profiler=self._profiler,
            on_start=self._on_job_start,
            on_complete=self._on_job_complete,
            nsight_enabled=self._profiler.nsight_enabled(),
        )

    async def run(self) -> None:
        start_http_server(self._config.general.metrics_port)
        await self._ensure_consumer_group()
        await self._gpu_manager.refresh()
        self._tasks.extend(self._cpu_pool.start())
        self._tasks.extend(self._gpu_pool.start())
        self._tasks.append(asyncio.create_task(self._consume_stream(), name="redis-consumer"))
        self._tasks.append(asyncio.create_task(self._gpu_scheduler_loop(), name="gpu-scheduler"))
        self._tasks.append(asyncio.create_task(self._gpu_poll_loop(), name="gpu-poller"))
        logger.info("AI compute provider started; metrics exposed on :%s", self._config.general.metrics_port)
        try:
            await self._stop_event.wait()
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            raise
        finally:
            await self.shutdown()

    async def shutdown(self) -> None:
        if self._shutdown_started:
            return
        self._shutdown_started = True
        if self._stop_event.is_set():
            logger.info("Shutting down AI compute provider")
        else:
            logger.info("Stopping AI compute provider")
            self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        await self._cpu_pool.stop()
        await self._gpu_pool.stop()
        await self._redis.close()
        logger.info("Compute provider stopped")

    def request_stop(self) -> None:
        self._stop_event.set()

    async def _ensure_consumer_group(self) -> None:
        try:
            await self._redis.xgroup_create(self._stream_name, self._consumer_group, mkstream=True)
        except ResponseError as exc:  # pragma: no cover - depends on Redis state
            if "BUSYGROUP" not in str(exc):
                raise

    async def _consume_stream(self) -> None:
        while not self._stop_event.is_set():
            try:
                response = await self._redis.xreadgroup(
                    groupname=self._consumer_group,
                    consumername=self._consumer_name,
                    streams={self._stream_name: ">"},
                    count=25,
                    block=5000,
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.exception("Failed to read from Redis: %s", exc)
                await asyncio.sleep(1)
                continue

            if not response:
                continue

            for _, messages in response:
                for redis_id, raw_payload in messages:
                    try:
                        job = self._decode_job(redis_id, raw_payload)
                    except Exception as exc:  # pragma: no cover - invalid payload guard
                        logger.exception("Failed to decode job %s: %s", redis_id, exc)
                        await self._redis.xack(self._stream_name, self._consumer_group, redis_id)
                        continue
                    await self._route_job(job)

    def _decode_job(self, redis_id: str, payload: Dict[bytes, bytes]) -> JobContext:
        decoded = {key.decode(): value.decode() for key, value in payload.items()}
        if "payload" in decoded:
            data = json.loads(decoded["payload"])
        else:
            data = decoded
        job_id = str(data.get("id"))
        if not job_id:
            raise ValueError("Job payload must include an 'id'")
        model = str(data.get("model", "unknown"))
        priority = decode_priority(data.get("priority"))
        expected_vram = data.get("expected_vram_mb")
        expected_vram_mb = int(expected_vram) if expected_vram is not None else None
        deadline = data.get("deadline_s")
        deadline_s = int(deadline) if deadline is not None else None
        job = JobContext(
            job_id=job_id,
            redis_id=redis_id,
            model=model,
            payload=data,
            priority=priority,
            expected_vram_mb=expected_vram_mb,
            deadline_s=deadline_s,
        )
        profile = self._config.models.get(model, ModelProfile())
        job.estimated_duration_s = profile.estimated_duration_s
        job.metadata["priority_weight"] = profile.priority_weight
        job.metadata["initial_enqueue_time"] = job.enqueue_time
        return job

    async def _route_job(self, job: JobContext) -> None:
        profile = self._config.models.get(job.model, ModelProfile())
        if job.priority == JobPriority.GPU and self._config.general.max_gpu_workers > 0:
            job.assign_device("gpu")
            required = self._gpu_manager.required_vram(profile.baseline_vram_mb, job.expected_vram_mb)
            scheduled = ScheduledGpuJob(
                job=job,
                required_vram_mb=required,
                weight=profile.priority_weight,
                service_time=profile.estimated_duration_s,
            )
            self._gpu_scheduler.add(scheduled)
            self._gpu_ready_event.set()
            await self._emit_event(job, "queued", {"device": "gpu"})
        else:
            job.assign_device("cpu")
            job.enqueue_time = time.monotonic()
            await self._cpu_queue.put(job)
            await self._emit_event(job, "queued", {"device": "cpu"})

    async def _gpu_scheduler_loop(self) -> None:
        while not self._stop_event.is_set():
            now = time.monotonic()
            scheduled = self._gpu_scheduler.pop_ready(now)
            if scheduled is None:
                wait_time = self._gpu_scheduler.time_until_ready(now)
                if wait_time is None:
                    try:
                        await asyncio.wait_for(
                            self._gpu_ready_event.wait(),
                            timeout=self._config.general.scheduler_tick_interval_s,
                        )
                    except asyncio.TimeoutError:
                        pass
                    self._gpu_ready_event.clear()
                    continue
                try:
                    await asyncio.wait_for(self._gpu_ready_event.wait(), timeout=wait_time)
                except asyncio.TimeoutError:
                    pass
                self._gpu_ready_event.clear()
                continue

            job = scheduled.job
            acquired = self._gpu_manager.try_reserve(job.job_id, scheduled.required_vram_mb)
            if not acquired:
                scheduled.job.attempt = scheduled.attempt
                if self._gpu_scheduler.should_degrade(scheduled):
                    job.assign_device("cpu", degraded=True)
                    job.metadata["degraded_from_gpu"] = True
                    job.enqueue_time = time.monotonic()
                    await self._cpu_queue.put(job)
                    await self._emit_event(
                        job,
                        "degraded",
                        {"reason": "vram_exhausted", "required_vram_mb": scheduled.required_vram_mb},
                    )
                    await self._emit_event(job, "queued", {"device": "cpu"})
                else:
                    self._gpu_scheduler.mark_retry(scheduled)
                    scheduled.job.attempt = scheduled.attempt
                    self._gpu_ready_event.set()
                    await self._emit_event(
                        job,
                        "waiting_gpu",
                        {
                            "attempt": scheduled.attempt,
                            "required_vram_mb": scheduled.required_vram_mb,
                            "available_vram_mb": self._gpu_manager.available_vram_mb,
                        },
                    )
                continue

            job.attempt = scheduled.attempt
            await self._gpu_execution_queue.put(job)

    async def _gpu_poll_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._gpu_manager.refresh()
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.warning("Failed to refresh GPU metrics: %s", exc)
            await asyncio.sleep(self._config.general.gpu_poll_interval_s)

    async def _on_job_start(self, job: JobContext, device: str) -> None:
        await self._emit_event(job, "running", {"device": device})

    async def _on_job_complete(
        self,
        job: JobContext,
        device: str,
        success: bool,
        error: Optional[BaseException],
    ) -> None:
        if device == "gpu":
            self._gpu_manager.release(job.job_id)
        status = "succeeded" if success else "failed"
        payload = {"device": device}
        if error:
            payload["error"] = str(error)
            logger.error("Job %s failed on %s: %s", job.job_id, device, error)
        else:
            logger.info("Job %s finished on %s", job.job_id, device)
        await self._emit_event(job, status, payload)
        await self._redis.xack(self._stream_name, self._consumer_group, job.redis_id)

    async def _emit_event(self, job: JobContext, status: str, extra: Optional[Dict[str, object]] = None) -> None:
        payload = {
            "job_id": job.job_id,
            "model": job.model,
            "status": status,
            "priority": job.priority.value,
        }
        if job.degraded:
            payload["degraded"] = True
        if extra:
            payload.update(extra)
        try:
            await self._redis.xadd(self._events_stream, {"payload": json.dumps(payload)})
        except Exception:  # pragma: no cover - metrics emission best effort
            logger.debug("Failed to emit job event for %s", job.job_id, exc_info=True)


__all__ = ["AiComputeService"]
