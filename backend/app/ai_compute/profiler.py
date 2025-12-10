"""Profiling helpers for the compute provider."""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Optional

from .config import ProfilingConfig

logger = logging.getLogger(__name__)


class Profiler:
    """Decides when profiling should run and persists metadata."""

    def __init__(self, config: ProfilingConfig) -> None:
        self._config = config
        self._counter = 0
        self._config.output_dir.mkdir(parents=True, exist_ok=True)

    def should_profile(self) -> bool:
        rate = self._config.sample_rate
        if rate <= 0:
            return False
        self._counter += 1
        return self._counter % rate == 0

    @asynccontextmanager
    async def profile_job(self, job_id: str) -> AsyncIterator[Optional[Path]]:
        if not self.should_profile():
            yield None
            return
        path = self._config.output_dir / f"{job_id}.json"
        logger.info("Collecting lightweight profile for job %s", job_id)
        yield path
        metadata: Dict[str, Any] = {"job_id": job_id, "profiled": True}
        path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    def nsight_enabled(self) -> bool:
        return self._config.nsight_enabled


__all__ = ["Profiler"]
