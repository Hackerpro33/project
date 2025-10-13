"""Helpers for generating lightweight dataset previews without full ingestion."""
from __future__ import annotations

import csv
import base64
import mimetypes
import random
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
from fastapi import HTTPException

from PIL import Image, UnidentifiedImageError

try:  # pragma: no cover - optional dependency handled in runtime tests
    import pdfplumber
except Exception:  # pragma: no cover - safety net for environments without pdfplumber
    pdfplumber = None

from ..config import get_settings
from .files import resolve_file_path

settings = get_settings()

MAX_ROWS = settings.preview_max_rows
MAX_PAGES = settings.preview_max_pages
MAX_IMAGE_PIXELS = settings.preview_image_max_pixels
TEXT_PREVIEW_LIMIT = 4000


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
    if page_size < 1 or page_size > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Page size must be between 1 and {MAX_ROWS}",
        )
    if sample_size < 1 or sample_size > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Sample size must be between 1 and {MAX_ROWS}",
        )

    mode = mode.lower()
    if mode not in {"page", "sample"}:
        raise HTTPException(status_code=400, detail="Mode must be either 'page' or 'sample'")

    path = resolve_file_path(identifier)
    suffix = path.suffix.lower()

    warnings: List[str] = []
    content_type, _ = mimetypes.guess_type(path.name)

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
        preview_type = "table"
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
        preview_type = "table"
    elif suffix in {".xlsx", ".xls"}:
        headers, rows, has_more = _preview_excel(
            path,
            page=page,
            page_size=page_size,
            mode=mode,
            sample_size=sample_size,
            seed=seed,
        )
        preview_type = "table"
    elif suffix == ".pdf":
        if pdfplumber is None:
            raise HTTPException(status_code=400, detail="PDF preview is not available in this deployment")
        try:
            with pdfplumber.open(path) as document:
                total_pages = len(document.pages)
                limit = min(total_pages, MAX_PAGES)
                page_payload: List[Dict[str, Any]] = []
                for index in range(limit):
                    page_obj = document.pages[index]
                    text = (page_obj.extract_text() or "").strip()
                    if len(text) > TEXT_PREVIEW_LIMIT:
                        warnings.append(
                            f"Страница {index + 1} сокращена до {TEXT_PREVIEW_LIMIT} символов для предпросмотра"
                        )
                        text = text[:TEXT_PREVIEW_LIMIT].rstrip()
                    page_payload.append({"page": index + 1, "text": text})
                has_more = total_pages > limit
                if has_more:
                    warnings.append(
                        f"Показаны первые {limit} страниц из {total_pages}. Загрузите файл для полного просмотра."
                    )
        except Exception as exc:  # pragma: no cover - pdf parsing edge cases
            raise HTTPException(status_code=400, detail=f"Не удалось построить предпросмотр PDF: {exc}") from exc

        headers, rows = [], []
        preview_type = "pdf"
        return {
            "file_id": identifier,
            "mode": "page",
            "page": 1,
            "page_size": None,
            "sample_size": None,
            "columns": headers,
            "rows": rows,
            "has_more": has_more,
            "preview_type": preview_type,
            "content_type": content_type or "application/pdf",
            "pages": page_payload,
            "thumbnails": [],
            "text_preview": None,
            "metadata": {"total_pages": total_pages},
            "warnings": warnings,
        }
    elif suffix in {".png", ".jpg", ".jpeg"}:
        try:
            with Image.open(path) as image:
                original_size = image.size
                thumbnail = image.copy()
                thumbnail.thumbnail((MAX_IMAGE_PIXELS, MAX_IMAGE_PIXELS))
                buffer = BytesIO()
                thumbnail.save(buffer, format="PNG")
                encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
                thumbnail_uri = f"data:image/png;base64,{encoded}"
                thumbnail_size = thumbnail.size
                if thumbnail_size != original_size:
                    warnings.append(
                        "Миниатюра уменьшена для быстрой загрузки. Загрузите файл, чтобы увидеть оригинал."
                    )
        except UnidentifiedImageError as exc:
            raise HTTPException(status_code=400, detail="Не удалось распознать изображение для предпросмотра") from exc

        headers, rows, has_more = [], [], None
        preview_type = "image"
        return {
            "file_id": identifier,
            "mode": "page",
            "page": 1,
            "page_size": None,
            "sample_size": None,
            "columns": headers,
            "rows": rows,
            "has_more": has_more,
            "preview_type": preview_type,
            "content_type": content_type or "image/png",
            "pages": [],
            "thumbnails": [thumbnail_uri],
            "text_preview": None,
            "metadata": {
                "original_width": original_size[0],
                "original_height": original_size[1],
                "thumbnail_width": thumbnail_size[0],
                "thumbnail_height": thumbnail_size[1],
            },
            "warnings": warnings,
        }
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
        "preview_type": preview_type,
        "content_type": content_type,
        "pages": [],
        "thumbnails": [],
        "text_preview": None,
        "metadata": {},
        "warnings": warnings,
    }


__all__ = ["generate_preview"]
