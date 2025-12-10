"""GPU resource management utilities."""
from __future__ import annotations

import asyncio
import logging
import re
import shutil
from dataclasses import dataclass, field
from typing import Dict, Optional

from prometheus_client import Gauge

logger = logging.getLogger(__name__)

_GPU_AVAILABLE_GAUGE = Gauge(
    "ai_gpu_available_vram_mb",
    "Available GPU VRAM reported by nvidia-smi",
)
_GPU_RESERVED_GAUGE = Gauge(
    "ai_gpu_reserved_vram_mb",
    "VRAM reserved by the scheduler",
)


@dataclass(slots=True)
class VramSnapshot:
    total_mb: int = 0
    used_mb: int = 0


@dataclass(slots=True)
class GpuResourceManager:
    """Tracks VRAM availability and reservations."""

    safety_factor: float
    override_total_vram_mb: Optional[int] = None
    _snapshot: VramSnapshot = field(default_factory=VramSnapshot)
    _reservations: Dict[str, int] = field(default_factory=dict)

    async def refresh(self) -> None:
        """Refresh VRAM totals by invoking ``nvidia-smi``."""

        if self.override_total_vram_mb is not None:
            total = max(0, int(self.override_total_vram_mb))
            used = min(total, self._snapshot.used_mb)
            self._snapshot = VramSnapshot(total, used)
            _GPU_AVAILABLE_GAUGE.set(max(0, total - used))
            return

        if not shutil.which("nvidia-smi"):
            logger.debug("nvidia-smi is not available on PATH; assuming no GPUs")
            self._snapshot = VramSnapshot(0, 0)
            _GPU_AVAILABLE_GAUGE.set(0)
            return

        proc = await asyncio.create_subprocess_exec(
            "nvidia-smi",
            "--query-gpu=memory.total,memory.used",
            "--format=csv,noheader",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning("nvidia-smi exited with %s: %s", proc.returncode, stderr.decode().strip())
            self._snapshot = VramSnapshot(0, 0)
            _GPU_AVAILABLE_GAUGE.set(0)
            return

        total = 0
        used = 0
        pattern = re.compile(r"(\d+) MiB,\s*(\d+) MiB")
        for line in stdout.decode().splitlines():
            match = pattern.search(line)
            if not match:
                continue
            total += int(match.group(1))
            used += int(match.group(2))
        self._snapshot = VramSnapshot(total_mb=total, used_mb=used)
        _GPU_AVAILABLE_GAUGE.set(max(0, total - used))

    @property
    def total_vram_mb(self) -> int:
        return self._snapshot.total_mb

    @property
    def used_vram_mb(self) -> int:
        return self._snapshot.used_mb + sum(self._reservations.values())

    @property
    def available_vram_mb(self) -> int:
        return max(0, self.total_vram_mb - self.used_vram_mb)

    def required_vram(self, baseline: int, expected: Optional[int]) -> int:
        candidate = max(baseline, expected or 0)
        return int(candidate * self.safety_factor)

    def try_reserve(self, job_id: str, amount_mb: int) -> bool:
        if amount_mb <= 0:
            return True
        if self.total_vram_mb <= 0:
            return False
        available = self.available_vram_mb
        if amount_mb > available:
            return False
        self._reservations[job_id] = amount_mb
        _GPU_RESERVED_GAUGE.set(sum(self._reservations.values()))
        return True

    def release(self, job_id: str) -> None:
        if job_id in self._reservations:
            self._reservations.pop(job_id, None)
            _GPU_RESERVED_GAUGE.set(sum(self._reservations.values()))


__all__ = ["GpuResourceManager", "VramSnapshot"]
