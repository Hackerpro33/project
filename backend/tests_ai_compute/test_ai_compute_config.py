from __future__ import annotations

from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.ai_compute.config import AiComputeConfig, load_config


def test_load_config_round_trip(tmp_path: Path) -> None:
    config_path = tmp_path / "ai_compute.toml"
    config_path.write_text(
        """
[general]
redis_url = "redis://example:6379/1"
stream_name = "ai:demo"
max_gpu_workers = 4
max_cpu_workers = 8
safety_factor = 1.25
metrics_port = 9005

[profiling]
sample_rate = 5
nsight_enabled = true
output_dir = "{output_dir}"

[models."demo-model"]
baseline_vram_mb = 512
peak_vram_mb = 1024
priority_weight = 1.5
estimated_duration_s = 12.5
cpu_variant = "demo-model-int8"
""".strip().format(output_dir=tmp_path / "profiles"),
        encoding="utf-8",
    )

    config = load_config(config_path)

    assert isinstance(config, AiComputeConfig)
    assert config.general.redis_url == "redis://example:6379/1"
    assert config.general.stream_name == "ai:demo"
    assert config.general.max_gpu_workers == 4
    assert config.general.max_cpu_workers == 8
    assert config.general.safety_factor == 1.25
    assert config.general.metrics_port == 9005
    assert config.profiling.sample_rate == 5
    assert config.profiling.nsight_enabled is True
    assert config.profiling.output_dir.exists()
    profile = config.models["demo-model"]
    assert profile.baseline_vram_mb == 512
    assert profile.peak_vram_mb == 1024
    assert profile.priority_weight == 1.5
    assert profile.estimated_duration_s == 12.5
    assert profile.cpu_variant == "demo-model-int8"
