"""Run the Insight Sphere backend with a stable asyncio event loop.

This helper avoids uvloop (uvicorn's default when available), which can
cause segmentation faults on some platforms. It also ensures the backend
package is importable regardless of the current working directory.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        loop="asyncio",
    )


if __name__ == "__main__":
    main()
