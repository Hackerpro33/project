"""Root-level shim to run the AI compute provider without changing directories."""
from __future__ import annotations

from . import _ensure_backend_on_path

_ensure_backend_on_path()

from backend.app.ai_compute.main import main as _service_main  # noqa: E402

__all__ = ["main"]


def main() -> None:
    _service_main()


if __name__ == "__main__":
    main()
