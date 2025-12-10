"""Convenience shims to run backend modules from the repo root."""
from __future__ import annotations

from pathlib import Path
import sys


def _ensure_backend_on_path() -> None:
    """Prepend the backend directory to sys.path when missing.

    This lets `python -m app.<module>` work from the repository root without
    requiring callers to `cd backend` or set PYTHONPATH manually.
    """

    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    backend_path = str(backend_dir)
    if backend_dir.is_dir() and backend_path not in sys.path:
        sys.path.insert(0, backend_path)


_ensure_backend_on_path()

__all__ = ["_ensure_backend_on_path"]
