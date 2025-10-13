"""Application configuration powered by environment variables."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import AnyHttpUrl, AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


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
    database_url: str = Field(
        "postgresql+psycopg://insight:insight@db:5432/insight",
        alias="DATABASE_URL",
        description="SQLAlchemy connection string for the primary PostgreSQL database.",
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
    frontend_static_dir: Optional[str] = Field(
        None,
        alias="FRONTEND_DIST_DIR",
        description="Optional path to pre-built frontend assets exposed as /static with CDN headers.",
    )
    cdn_cache_max_age: int = Field(
        60 * 60 * 24 * 365,
        alias="CDN_CACHE_MAX_AGE",
        description="Cache duration in seconds for immutable frontend assets served by the API container.",
    )
    heavy_response_cache_seconds: int = Field(
        60,
        alias="HEAVY_RESPONSE_CACHE_SECONDS",
        description="Cache duration applied to heavy API responses guarded by ETag headers.",
    )
    unleash_api_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="UNLEASH_API_URL",
        description="Base URL of the Unleash API (e.g. https://unleash.example.com/api)",
    )
    unleash_api_token: Optional[str] = Field(
        None,
        alias="UNLEASH_API_TOKEN",
        description="API token with client access to Unleash feature toggles.",
    )
    unleash_environment: str = Field(
        "development",
        alias="UNLEASH_ENVIRONMENT",
        description="Unleash environment name used when requesting feature toggles.",
    )
    feature_flag_cache_ttl_seconds: int = Field(
        30,
        alias="FEATURE_FLAG_CACHE_TTL",
        description="In-memory cache TTL for Unleash feature flags in seconds.",
    )

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
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

    return Settings()  # type: ignore[call-arg]
