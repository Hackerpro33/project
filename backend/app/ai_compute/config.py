"""Configuration helpers for the AI compute provider."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Mapping, MutableMapping, Optional

try:  # pragma: no cover - fallback for Python < 3.11
    import tomllib  # type: ignore[attr-defined]
except ModuleNotFoundError:  # pragma: no cover - fallback
    import tomli as tomllib  # type: ignore[no-redef]

from ..utils.files import DATA_DIR


@dataclass(slots=True)
class GeneralConfig:
    """Runtime toggles for the provider."""

    redis_url: str = "redis://redis:6379/0"
    stream_name: str = "ai:jobs"
    consumer_group: str = "ai-compute"
    safety_factor: float = 1.15
    max_gpu_workers: int = 1
    max_cpu_workers: int = 2
    metrics_port: int = 9001
    scheduler_tick_interval_s: float = 0.5
    gpu_poll_interval_s: float = 10.0
    max_gpu_retries: int = 3
    override_total_vram_mb: Optional[int] = None


@dataclass(slots=True)
class ProfilingConfig:
    """Controls sampling of profiling sessions."""

    sample_rate: int = 10
    nsight_enabled: bool = False
    output_dir: Path = field(default_factory=lambda: DATA_DIR / "uploads" / "profiler")


@dataclass(slots=True)
class ModelProfile:
    """Resource profile for an ML model."""

    baseline_vram_mb: int = 1024
    peak_vram_mb: Optional[int] = None
    cpu_variant: Optional[str] = None
    priority_weight: float = 1.0
    estimated_duration_s: float = 60.0


@dataclass(slots=True)
class AiComputeConfig:
    """Top level provider configuration."""

    general: GeneralConfig = field(default_factory=GeneralConfig)
    profiling: ProfilingConfig = field(default_factory=ProfilingConfig)
    models: Dict[str, ModelProfile] = field(default_factory=dict)


def _resolve_config_path(path: Optional[Path]) -> Path:
    if path:
        return Path(path)
    env_path = os.getenv("AI_COMPUTE_CONFIG")
    if env_path:
        return Path(env_path)
    return DATA_DIR / "ai_compute.toml"


def _load_toml(path: Path) -> Mapping[str, object]:
    if not path.exists():
        raise FileNotFoundError(f"AI compute configuration {path} does not exist")
    with path.open("rb") as handle:
        return tomllib.load(handle)


def _apply_general(section: Mapping[str, object], config: AiComputeConfig) -> None:
    general = config.general
    for key, value in section.items():
        if not hasattr(general, key):
            continue
        setattr(general, key, value)


def _apply_profiling(section: Mapping[str, object], config: AiComputeConfig) -> None:
    profiling = config.profiling
    for key, value in section.items():
        if not hasattr(profiling, key):
            continue
        if key == "output_dir":
            profiling.output_dir = Path(str(value))
        else:
            setattr(profiling, key, value)
    profiling.output_dir.mkdir(parents=True, exist_ok=True)


def _apply_model_profiles(section: Mapping[str, object], config: AiComputeConfig) -> None:
    models: Dict[str, ModelProfile] = {}
    for name, payload in section.items():
        if not isinstance(payload, MutableMapping):
            continue
        profile = ModelProfile()
        for key, value in payload.items():
            if not hasattr(profile, key):
                continue
            setattr(profile, key, value)
        models[name] = profile
    config.models = models


def load_config(path: Optional[Path] = None) -> AiComputeConfig:
    """Load configuration from ``ai_compute.toml``."""

    resolved = _resolve_config_path(path)
    payload = _load_toml(resolved)
    config = AiComputeConfig()

    if not isinstance(payload, Mapping):
        raise ValueError("ai_compute.toml must contain a mapping at the top level")

    if (general := payload.get("general")) and isinstance(general, Mapping):
        _apply_general(general, config)
    if (profiling := payload.get("profiling")) and isinstance(profiling, Mapping):
        _apply_profiling(profiling, config)
    if (models := payload.get("models")) and isinstance(models, Mapping):
        _apply_model_profiles(models, config)

    return config


__all__ = [
    "AiComputeConfig",
    "GeneralConfig",
    "ProfilingConfig",
    "ModelProfile",
    "load_config",
]
