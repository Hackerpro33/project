"""Lightweight Unleash feature flag client."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict

import httpx

from ..core.config import get_settings

settings = get_settings()
_cache: Dict[str, bool] = {}
_cache_expires_at: datetime | None = None


async def fetch_flags() -> Dict[str, bool]:
    """Retrieve feature toggles from Unleash with in-memory caching."""

    global _cache, _cache_expires_at

    if not settings.unleash_api_url or not settings.unleash_api_token:
        return {}

    now = datetime.utcnow()
    if _cache_expires_at and _cache_expires_at > now:
        return _cache

    url = f"{settings.unleash_api_url.rstrip('/')}/client/features"
    headers = {
        "Accept": "application/json",
        "Authorization": settings.unleash_api_token,
    }
    params = {"env": settings.unleash_environment}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        payload = response.json()

    toggles = {
        feature.get("name", ""): bool(feature.get("enabled", False))
        for feature in payload.get("features", [])
        if feature.get("name")
    }

    _cache = toggles
    _cache_expires_at = now + timedelta(seconds=settings.feature_flag_cache_ttl_seconds)
    return toggles


async def is_enabled(flag_name: str, default: bool = False) -> bool:
    flags = await fetch_flags()
    return flags.get(flag_name, default)
