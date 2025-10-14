"""Application configuration powered by environment variables.

The service historically relied on a ``.env`` file checked out alongside the
source tree.  Secrets now live in an encrypted SOPS manifest instead.  During
application startup we opportunistically read a decrypted YAML file (usually
produced by ``sops -d`` as part of the deployment pipeline) and populate the
process environment before Pydantic evaluates settings.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Literal

import json
import yaml
from pydantic import AnyHttpUrl, AnyUrl, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .utils.files import DATA_DIR, export_json_atomic


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SECRETS_FILE = BASE_DIR / "secrets" / "runtime.secrets.yaml"
CONFIG_OVERRIDES_PATH = DATA_DIR / "config_overrides.json"


def _apply_sops_secrets() -> None:
    """Load decrypted SOPS secrets into ``os.environ`` if present.

    The SOPS manifest stores key/value pairs under the ``env`` key to avoid
    clashing with metadata fields (``sops`` stanza, rotation docs, etc.).  The
    loader only applies values that are currently missing so runtime overrides
    keep precedence over the decrypted file contents.
    """

    secrets_path = Path(os.getenv("INSIGHT_SECRETS_FILE", DEFAULT_SECRETS_FILE))
    if not secrets_path.exists():
        return

    try:
        with secrets_path.open("r", encoding="utf-8") as handle:
            payload: Dict[str, Dict[str, str]] = yaml.safe_load(handle) or {}
    except Exception as exc:  # pragma: no cover - defensive guardrail
        raise RuntimeError(f"Failed to parse secrets file {secrets_path}: {exc}")

    secrets = payload.get("env") if isinstance(payload, dict) else None
    if not isinstance(secrets, dict):
        return

    for key, value in secrets.items():
        if isinstance(key, str) and value is not None and key not in os.environ:
            os.environ[key] = str(value)


_apply_sops_secrets()


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
        default_factory=lambda: [
            ".csv",
            ".tsv",
            ".xlsx",
            ".xls",
            ".pdf",
            ".png",
            ".jpg",
            ".jpeg",
        ],
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
    task_status_webhook_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="TASK_STATUS_WEBHOOK_URL",
        description="Optional endpoint notified about task status transitions.",
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
    alert_webhook_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="ALERT_WEBHOOK_URL",
        description="Webhook endpoint for alert notifications.",
    )
    alert_webhook_retries: int = Field(
        2,
        alias="ALERT_WEBHOOK_RETRIES",
        description="Number of retry attempts for webhook delivery.",
        ge=0,
    )
    alert_webhook_timeout: float = Field(
        5.0,
        alias="ALERT_WEBHOOK_TIMEOUT",
        description="Timeout in seconds for webhook delivery attempts.",
        ge=0.1,
    )

    storage_backend: Literal["local", "s3"] = Field(
        "local",
        alias="STORAGE_BACKEND",
        description="Storage backend used for user uploads. Supports 'local' and 's3'.",
    )
    s3_bucket: Optional[str] = Field(
        None,
        alias="S3_BUCKET",
        description="Name of the S3 bucket used for persisted uploads when STORAGE_BACKEND=s3.",
    )
    s3_region_name: Optional[str] = Field(
        None,
        alias="S3_REGION_NAME",
        description="AWS region of the S3 bucket.",
    )
    s3_endpoint_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="S3_ENDPOINT_URL",
        description="Optional custom endpoint URL for S3 compatible storage (e.g. MinIO).",
    )
    s3_access_key_id: Optional[str] = Field(
        None,
        alias="S3_ACCESS_KEY_ID",
        description="Access key used when authenticating against S3 compatible storage.",
    )
    s3_secret_access_key: Optional[str] = Field(
        None,
        alias="S3_SECRET_ACCESS_KEY",
        description="Secret key used when authenticating against S3 compatible storage.",
    )
    s3_session_token: Optional[str] = Field(
        None,
        alias="S3_SESSION_TOKEN",
        description="Optional session token for temporary S3 credentials.",
    )
    s3_force_path_style: bool = Field(
        False,
        alias="S3_FORCE_PATH_STYLE",
        description="Force path-style addressing for S3 requests (useful for MinIO).",
    )
    s3_key_prefix: str = Field(
        "uploads",
        alias="S3_KEY_PREFIX",
        description="Prefix applied to every object key stored in S3.",
    )
    s3_upload_expiration_seconds: int = Field(
        900,
        alias="S3_UPLOAD_EXPIRATION_SECONDS",
        description="Expiration window for presigned multipart upload URLs in seconds.",
        ge=60,
    )

    @field_validator("storage_backend", mode="before")
    @classmethod
    def _normalise_backend(cls, value: Optional[str]) -> str:
        if value is None:
            return "local"
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized not in {"local", "s3"}:
                raise ValueError("STORAGE_BACKEND must be either 'local' or 's3'")
            return normalized
        raise ValueError("STORAGE_BACKEND must be a string")

    @field_validator("s3_key_prefix", mode="before")
    @classmethod
    def _normalise_s3_prefix(cls, value: Optional[str]) -> str:
        if not value:
            return "uploads"
        cleaned = str(value).strip().strip("/")
        return cleaned or "uploads"
    s3_download_expiration_seconds: int = Field(
        900,
        alias="S3_DOWNLOAD_EXPIRATION_SECONDS",
        description="Expiration window for presigned download URLs in seconds.",
        ge=60,
    )

    preview_max_rows: int = Field(
        500,
        alias="PREVIEW_MAX_ROWS",
        description="Maximum number of rows returned by tabular previews.",
        ge=1,
    )
    preview_max_pages: int = Field(
        5,
        alias="PREVIEW_MAX_PAGES",
        description="Maximum number of pages rendered when previewing paged documents like PDF.",
        ge=1,
    )
    preview_image_max_pixels: int = Field(
        512,
        alias="PREVIEW_IMAGE_MAX_PIXELS",
        description="Maximum size in pixels for the longest side of generated image thumbnails.",
        ge=32,
    )

    upload_rate_limit_requests: int = Field(
        120,
        alias="UPLOAD_RATE_LIMIT_REQUESTS",
        description="Maximum number of upload requests allowed within the rate window.",
    )
    upload_rate_limit_window_seconds: int = Field(
        60,
        alias="UPLOAD_RATE_LIMIT_WINDOW_SECONDS",
        description="Size of the upload rate limiting window in seconds.",
    )

    idempotency_cache_ttl_seconds: int = Field(
        900,
        alias="IDEMPOTENCY_CACHE_TTL_SECONDS",
        description="Lifetime in seconds for cached idempotent responses before reprocessing.",
    )
    idempotency_cache_max_entries: int = Field(
        1024,
        alias="IDEMPOTENCY_CACHE_MAX_ENTRIES",
        description="Maximum number of idempotent responses retained in memory.",
    )

    model_config = SettingsConfigDict(
        env_file=os.getenv("INSIGHT_ENV_FILE"),
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
