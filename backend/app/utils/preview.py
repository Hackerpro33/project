"""Helpers for generating lightweight dataset previews without full ingestion."""
from __future__ import annotations

import csv
import random
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
from fastapi import HTTPException

from .files import resolve_file_path


def _sanitize_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):  # type: ignore[arg-type]
            return None
    except Exception:
        pass
    if isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return float(value)
    if isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def _sanitize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {str(key): _sanitize_value(value) for key, value in row.items()}


def _reservoir_sample(
    rows: Iterable[Dict[str, Any]],
    sample_size: int,
    *,
    seed: Optional[int] = None,
) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    reservoir: List[Dict[str, Any]] = []
    for index, row in enumerate(rows):
        if index < sample_size:
            reservoir.append(row)
        else:
            j = rng.randint(0, index)
            if j < sample_size:
                reservoir[j] = row
    return reservoir


def _preview_csv(
    path: Path,
    *,
    delimiter: str,
    page: int,
    page_size: int,
    mode: str,
    sample_size: int,
    seed: Optional[int],
) -> Tuple[List[str], List[Dict[str, Any]], Optional[bool]]:
    with path.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        headers = next(reader, [])
        if mode == "sample":
            dict_reader = (dict(zip(headers, row)) for row in reader)
            sample = _reservoir_sample(dict_reader, sample_size, seed=seed)
            return headers, [_sanitize_row(row) for row in sample], None

        start = max(0, (page - 1) * page_size)
        rows: List[List[str]] = []
        for index, row in enumerate(reader):
            if index < start:
                continue
            rows.append(row)
            if len(rows) >= page_size + 1:
                break
        has_more = len(rows) > page_size
        rows = rows[:page_size]
        dict_rows = [dict(zip(headers, row)) for row in rows]
        return headers, [_sanitize_row(row) for row in dict_rows], has_more


def _preview_excel(
    path: Path,
    *,
    page: int,
    page_size: int,
    mode: str,
    sample_size: int,
    seed: Optional[int],
) -> Tuple[List[str], List[Dict[str, Any]], Optional[bool]]:
    if mode == "sample":
        frame = pd.read_excel(path)
        if frame.empty:
            return [], [], None
        sample_count = min(sample_size, len(frame))
        sample = frame.sample(n=sample_count, random_state=seed) if sample_count < len(frame) else frame
        return [str(col) for col in frame.columns], [
            _sanitize_row(row) for row in sample.replace({pd.NA: None}).to_dict(orient="records")
        ], None

    skip_rows = max(0, (page - 1) * page_size)
    frame = pd.read_excel(path, skiprows=range(1, skip_rows + 1), nrows=page_size + 1)
    has_more = len(frame.index) > page_size
    frame = frame.head(page_size)
    return [str(col) for col in frame.columns], [
        _sanitize_row(row) for row in frame.replace({pd.NA: None}).to_dict(orient="records")
    ], has_more


def generate_preview(
    identifier: str,
    *,
    page: int = 1,
    page_size: int = 50,
    mode: str = "page",
    sample_size: int = 50,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    if page < 1:
        raise HTTPException(status_code=400, detail="Page number must be greater than zero")
    if page_size < 1 or page_size > 500:
        raise HTTPException(status_code=400, detail="Page size must be between 1 and 500")
    if sample_size < 1 or sample_size > 1000:
        raise HTTPException(status_code=400, detail="Sample size must be between 1 and 1000")

    mode = mode.lower()
    if mode not in {"page", "sample"}:
        raise HTTPException(status_code=400, detail="Mode must be either 'page' or 'sample'")

    path = resolve_file_path(identifier)
    suffix = path.suffix.lower()

    if suffix in {".csv", ".txt"}:
        headers, rows, has_more = _preview_csv(
            path,
            delimiter=",",
            page=page,
            page_size=page_size,
            mode=mode,
            sample_size=sample_size,
            seed=seed,
        )
    elif suffix == ".tsv":
        headers, rows, has_more = _preview_csv(
            path,
            delimiter="\t",
            page=page,
            page_size=page_size,
            mode=mode,
            sample_size=sample_size,
            seed=seed,
        )
    elif suffix in {".xlsx", ".xls"}:
        headers, rows, has_more = _preview_excel(
            path,
            page=page,
            page_size=page_size,
            mode=mode,
            sample_size=sample_size,
            seed=seed,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Preview is not supported for '{suffix}' files")

    return {
        "file_id": identifier,
        "mode": mode,
        "page": page if mode == "page" else None,
        "page_size": page_size if mode == "page" else None,
        "sample_size": sample_size if mode == "sample" else None,
        "columns": headers,
        "rows": rows,
        "has_more": has_more if mode == "page" else None,
    }


__all__ = ["generate_preview"]
