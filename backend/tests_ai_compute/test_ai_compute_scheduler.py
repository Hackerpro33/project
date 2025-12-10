from __future__ import annotations

import time
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.ai_compute.models import JobContext, JobPriority, ScheduledGpuJob
from app.ai_compute.scheduler import GpuScheduler


def _make_job(job_id: str) -> JobContext:
    return JobContext(
        job_id=job_id,
        redis_id=f"0-{job_id}",
        model="demo",
        payload={"id": job_id},
        priority=JobPriority.GPU,
    )


def test_scheduler_orders_by_finish_time(monkeypatch) -> None:
    scheduler = GpuScheduler(max_attempts=3)
    base_time = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: base_time)
    fast_job = ScheduledGpuJob(job=_make_job("fast"), required_vram_mb=512, weight=1.0, service_time=10.0)
    slow_job = ScheduledGpuJob(job=_make_job("slow"), required_vram_mb=512, weight=2.0, service_time=40.0)
    scheduler.add(fast_job)
    scheduler.add(slow_job)
    picked = scheduler.pop_ready(base_time)
    assert picked is fast_job


def test_scheduler_backoff_and_degrade(monkeypatch) -> None:
    scheduler = GpuScheduler(max_attempts=3)
    base_time = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: base_time)
    job = ScheduledGpuJob(job=_make_job("retry"), required_vram_mb=1024, weight=1.0, service_time=30.0)
    scheduler.add(job)

    current = base_time
    for attempt in range(1, 4):
        picked = scheduler.pop_ready(current)
        assert picked is job
        scheduler.mark_retry(job, now=current)
        assert job.attempt == attempt
        current += min(60.0, 2 ** attempt)
        monkeypatch.setattr(time, "monotonic", lambda: current)

    assert scheduler.should_degrade(job) is True
