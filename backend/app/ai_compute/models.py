"""Dataclasses describing jobs handled by the provider."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class JobPriority(str, Enum):
    """Priority hint supplied by the API layer."""

    GPU = "gpu"
    CPU = "cpu"


@dataclass(slots=True)
class JobContext:
    """Runtime information tracked for a single job."""

    job_id: str
    redis_id: str
    model: str
    payload: Dict[str, Any]
    priority: JobPriority
    expected_vram_mb: Optional[int] = None
    deadline_s: Optional[int] = None
    enqueue_time: float = field(default_factory=time.monotonic)
    attempt: int = 0
    degraded: bool = False
    target_device: str = "gpu"
    metadata: Dict[str, Any] = field(default_factory=dict)
    estimated_duration_s: float = 60.0

    def assign_device(self, device: str, degraded: bool = False) -> None:
        self.target_device = device
        self.degraded = degraded


@dataclass(slots=True)
class ScheduledGpuJob:
    """Wrapper tracked by the weighted GPU scheduler."""

    job: JobContext
    required_vram_mb: int
    weight: float
    service_time: float
    attempt: int = 0
    ready_at: float = field(default_factory=time.monotonic)
    finish_time: float = 0.0
    sequence: int = 0


def decode_priority(value: Optional[str]) -> JobPriority:
    if not value:
        return JobPriority.CPU
    try:
        return JobPriority(value)
    except ValueError:
        return JobPriority.CPU
