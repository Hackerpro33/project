"""Helpers for HTTP cache validation."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import Request, Response


def _serialize_payload(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compute_etag(payload: Any) -> str:
    """Return a strong ETag for the provided payload."""

    return hashlib.sha256(_serialize_payload(payload)).hexdigest()


def apply_cache_headers(response: Response, payload: Any, cache_seconds: int) -> str:
    """Attach Cache-Control and ETag headers for heavy responses."""

    etag = compute_etag(payload)
    response.headers["ETag"] = etag
    stale_seconds = max(cache_seconds // 2, 1)
    response.headers["Cache-Control"] = (
        f"public, max-age={cache_seconds}, stale-while-revalidate={stale_seconds}"
    )
    return etag


def should_return_not_modified(request: Request, etag: str) -> bool:
    """Check If-None-Match header to determine if response can be skipped."""

    if not etag:
        return False
    client_etag = request.headers.get("if-none-match")
    return client_etag == etag
