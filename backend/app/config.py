"""Application configuration powered by environment variables."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import AnyHttpUrl, AnyUrl, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .utils.files import DATA_DIR, export_json_atomic


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
CONFIG_OVERRIDES_PATH = DATA_DIR / "config_overrides.json"


class Settings(BaseSettings):
    """Runtime configuration for the Insight Sphere backend."""

    frontend_origin: AnyHttpUrl = Field(
        "http://localhost:5173",
        alias="FRONTEND_ORIGIN",
        description="Primary frontend origin allowed to communicate with the API.",
    )
    additional_cors_origins: str = Field(
        "",
        alias="ADDITIONAL_CORS_ORIGINS",
        description="Comma separated list of additional origins allowed by CORS.",
    )
    allowed_hosts: str = Field(
        "localhost,127.0.0.1",
        alias="ALLOWED_HOSTS",
        description="Comma separated list of hosts accepted by the TrustedHost middleware.",
    )
    max_upload_size_mb: int = Field(
        25,
        alias="MAX_UPLOAD_SIZE_MB",
        description="Maximum upload size in megabytes for dataset files.",
    )
    allowed_upload_extensions: List[str] = Field(
        default_factory=lambda: [".csv", ".tsv", ".xlsx", ".xls"],
        alias="ALLOWED_UPLOAD_EXTENSIONS",
        description="List of file extensions allowed for upload.",
    )
    clamav_scan_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="CLAMAV_SCAN_URL",
        description="Optional HTTP endpoint of a ClamAV scanning service.",
    )
    redis_url: AnyUrl = Field(
        "redis://redis:6379/0",
        alias="REDIS_URL",
        description="Connection URL for the Redis instance used by background workers and caching.",
    )
    task_queue_enabled: bool = Field(
        False,
        alias="TASK_QUEUE_ENABLED",
        description="Toggle for enabling Redis/RQ backed background processing.",
    )
    task_queue_name: str = Field(
        "insight-analytics",
        alias="TASK_QUEUE_NAME",
        description="Name of the Redis queue used for long-running analytics tasks.",
    )
    task_default_timeout: int = Field(
        600,
        alias="TASK_DEFAULT_TIMEOUT",
        description="Default timeout for background analytics tasks in seconds.",
    )

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
    )

    @field_validator("allowed_upload_extensions", mode="before")
    def _split_allowed_extensions(cls, value):
        if isinstance(value, str):
            return [ext.strip() for ext in value.split(",") if ext.strip()]
        return value

    @property
    def additional_origins(self) -> List[str]:
        return [origin.strip() for origin in self.additional_cors_origins.split(",") if origin.strip()]

    @property
    def allowed_host_list(self) -> List[str]:
        hosts = [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]
        hosts.extend(["127.0.0.1", "localhost"])
        # remove duplicates while preserving order
        seen = set()
        deduped = []
        for host in hosts:
            if host not in seen:
                seen.add(host)
                deduped.append(host)
        return deduped

    @property
    def max_upload_size(self) -> int:
        return int(self.max_upload_size_mb) * 1024 * 1024


@lru_cache()
def get_settings() -> Settings:
    """Return cached :class:`Settings` instance."""

    overrides: Dict[str, Any] = {}
    if CONFIG_OVERRIDES_PATH.exists():
        try:
            with CONFIG_OVERRIDES_PATH.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if isinstance(payload, dict):
                overrides = payload
        except json.JSONDecodeError:
            overrides = {}
    return Settings(**overrides)  # type: ignore[call-arg]


def apply_settings_overrides(payload: Dict[str, Any]) -> Settings:
    """Persist overrides to disk and refresh the cached settings instance."""

    try:
        settings = Settings(**payload)  # type: ignore[call-arg]
    except ValidationError as exc:  # pragma: no cover - validation handled by caller
        raise exc

    export_json_atomic(CONFIG_OVERRIDES_PATH, settings.model_dump(mode="json"))
    get_settings.cache_clear()
    refreshed = get_settings()
    return refreshed


__all__ = [
    "Settings",
    "get_settings",
    "apply_settings_overrides",
]
