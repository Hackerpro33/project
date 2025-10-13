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
from typing import Dict, List, Optional

import yaml
from pydantic import AnyHttpUrl, AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SECRETS_FILE = BASE_DIR / "secrets" / "runtime.secrets.yaml"


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
