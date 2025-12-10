"""Root-level shim to run the RQ worker without changing directories."""
from __future__ import annotations

from . import _ensure_backend_on_path

_ensure_backend_on_path()

from backend.app.worker import main as _worker_main  # noqa: E402

__all__ = ["main"]


def main() -> None:
    _worker_main()


if __name__ == "__main__":
    main()
