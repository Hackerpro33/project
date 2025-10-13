"""Shared fixtures for backend tests."""
from __future__ import annotations

import math
from typing import Callable

import pytest

from .. import main


@pytest.fixture
def csv_bytes_factory() -> Callable[[int, int, int], bytes]:
    """Return a factory producing CSV payloads with controllable size."""

    def _build(rows: int = 100, columns: int = 10, cell_size: int = 16) -> bytes:
        header = ",".join(f"col_{i}" for i in range(columns))

        def _cell(idx: int) -> str:
            return f"value_{idx}".ljust(cell_size, "x")

        row_template = ",".join(_cell(i) for i in range(columns))
        body = "\n".join(row_template for _ in range(rows))
        csv_text = f"{header}\n{body}\n"
        return csv_text.encode("utf-8")

    return _build


@pytest.fixture
def oversized_csv_payload(csv_bytes_factory: Callable[[int, int, int], bytes]) -> bytes:
    """Produce a CSV payload that exceeds a 1 KB threshold."""

    payload = csv_bytes_factory(rows=256, columns=12, cell_size=24)
    # ensure fixture always produces data above 1 KB
    assert len(payload) > 1024
    return payload


@pytest.fixture
def limit_upload_size(monkeypatch) -> Callable[[int], None]:
    """Allow tests to override the maximum upload size in bytes."""

    def _apply(limit_bytes: int) -> None:
        monkeypatch.setattr(main, "MAX_UPLOAD_SIZE", limit_bytes)
        mb_limit = max(1, math.ceil(limit_bytes / (1024 * 1024)))
        monkeypatch.setattr(main, "MAX_UPLOAD_SIZE_MB", mb_limit)
        monkeypatch.setattr(main.settings, "max_upload_size_mb", mb_limit)

    return _apply
