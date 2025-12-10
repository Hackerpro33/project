"""Root-level shim to expose the FastAPI app for uvicorn imports."""
from __future__ import annotations

from . import _ensure_backend_on_path

_ensure_backend_on_path()

from backend.app.main import app  # noqa: E402

__all__ = ["app"]
