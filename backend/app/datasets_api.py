"""Dataset CRUD endpoints backed by JSON storage with HTTP caching."""

from __future__ import annotations

import json
import logging
import os
import random
import re
import shutil
import tempfile
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from math import ceil, sqrt
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request, Response, params
from pydantic import BaseModel, Field

try:  # pragma: no cover - allow running as a standalone module
    from .schemas import (
        DatasetProfileColumn,
        DatasetProfileRequest,
        DatasetProfileResponse,
        DatasetValidationIssue,
        DatasetValidationRequest,
        DatasetValidationResponse,
        ValidationRule,
    )
    from .utils.files import load_dataframe_from_identifier
except ImportError:  # pragma: no cover
    from schemas import (  # type: ignore
        DatasetProfileColumn,
        DatasetProfileRequest,
        DatasetProfileResponse,
        DatasetValidationIssue,
        DatasetValidationRequest,
        DatasetValidationResponse,
        ValidationRule,
    )
    from utils.files import load_dataframe_from_identifier  # type: ignore

from .config import get_settings
from .services.notifications import WebhookDeliveryError, notify_dataset_refresh_failure
from .services.scheduler import (
    InvalidSchedule,
    ScheduleConfig,
    ScheduleNotFound,
    TaskScheduler,
)
from .utils.cache import apply_cache_headers, should_return_not_modified


router = APIRouter()
logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent
CANDIDATE_DIRS = [APP_DIR.parent / "data", APP_DIR / "data"]


def _ensure_store_dir() -> Path:
    for directory in CANDIDATE_DIRS:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            return directory
        except Exception:
            continue
    fallback = APP_DIR
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .config import get_settings
from .utils.cache import apply_cache_headers, should_return_not_modified

router = APIRouter()
settings = get_settings()

APP_DIR = Path(__file__).resolve().parent
_DATA_DIR = APP_DIR / "data"
_DEFAULT_STORE = _DATA_DIR / "datasets"
_ENV_STORE = Path(os.getenv("INSIGHT_DATASETS_DIR", _DEFAULT_STORE))

# The order matters: the first existing path will be used, otherwise the first item
# will be created lazily when saving data. Tests monkeypatch these constants.
CANDIDATE_DIRS: List[Path] = [_ENV_STORE, _DEFAULT_STORE, _DATA_DIR]


def _resolve_store_dir() -> Path:
    for candidate in CANDIDATE_DIRS:
        if candidate.exists():
            candidate.mkdir(parents=True, exist_ok=True)
            return candidate
    # Fall back to the first candidate and create it on demand.
    target = CANDIDATE_DIRS[0]
    target.mkdir(parents=True, exist_ok=True)
    return target


STORE_DIR = _resolve_store_dir()
DATASETS_JSON = STORE_DIR / "datasets.json"
DEFAULT_PAGE_SIZE = 20
REFRESH_SCHEDULES_JSON = STORE_DIR / "dataset_refresh_schedules.json"

_refresh_scheduler = TaskScheduler(REFRESH_SCHEDULES_JSON)

_ORDERABLE_FIELDS = {"created_at", "updated_at", "name", "row_count"}


class ColumnInfo(BaseModel):
    name: str
    type: str


class DatasetBase(BaseModel):
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    columns: List[ColumnInfo] = Field(default_factory=list)
    file_url: Optional[str] = None
    row_count: Optional[int] = None
    sample_data: Optional[List[Dict[str, Any]]] = None
    dataset_type: Optional[str] = Field(
        default="general",
        description="Категория/тип набора данных для фасетной навигации",
    )
    owners: List[str] = Field(
        default_factory=list,
        description="Ответственные команды или владельцы набора",
    )
    insights: Optional[List[str]] = None


class DatasetCreate(DatasetBase):
    name: str


class DatasetUpdate(DatasetBase):
    name: Optional[str] = None


def _load_all() -> List[Dict[str, Any]]:
    if not DATASETS_JSON.exists():
        return []
    with DATASETS_JSON.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
        if isinstance(payload, list):
            return [dict(item) for item in payload]
        raise ValueError("Dataset store must contain a JSON array")


def _atomic_write_json(target: Path, payload: Any) -> None:
    """Persist ``payload`` to ``target`` using a temporary file."""

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_suffix(target.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.flush()
        try:
            os.fsync(handle.fileno())
        except OSError:
            # Some environments (e.g. certain Docker volumes) may not support fsync.
            pass
    os.replace(tmp_path, target)


def _save_all(items: Iterable[Dict[str, Any]]) -> None:
    payload = list(items)
    _atomic_write_json(DATASETS_JSON, payload)


def _format_datetime(dt: datetime) -> str:
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    return iso


def _pythonize_value(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    return value


def _safe_row_index(label: Any) -> Optional[int]:
    try:
        return int(label)
    except (TypeError, ValueError):
        return None


def _normalize_missing_values(series: pd.Series) -> pd.Series:
    if pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series):
        return series.apply(
            lambda value: np.nan if isinstance(value, str) and value.strip() == "" else value
        )
    return series


def _build_column_profile(name: str, series: pd.Series, total_rows: int) -> DatasetProfileColumn:
    normalized = _normalize_missing_values(series)
    non_nulls = int(normalized.notna().sum())
    missing = max(total_rows - non_nulls, 0)
    missing_percent = round((missing / total_rows) * 100, 2) if total_rows else 0.0
    cardinality = int(normalized.nunique(dropna=True))
    sample_values = [_pythonize_value(value) for value in series.dropna().head(5).tolist()]

    stats: Optional[Dict[str, Any]] = None
    if pd.api.types.is_numeric_dtype(series):
        stats = {
            "min": _pythonize_value(series.min(skipna=True)),
            "max": _pythonize_value(series.max(skipna=True)),
            "mean": _pythonize_value(series.mean(skipna=True)),
        }
    elif pd.api.types.is_datetime64_any_dtype(series):
        stats = {
            "min": _pythonize_value(series.min(skipna=True)) if non_nulls else None,
            "max": _pythonize_value(series.max(skipna=True)) if non_nulls else None,
        }

    return DatasetProfileColumn(
        name=name,
        dtype=str(series.dtype),
        non_nulls=non_nulls,
        missing=missing,
        missing_percent=missing_percent,
        cardinality=cardinality,
        sample_values=sample_values,
        stats=stats,
    )


def _generate_profile(df: pd.DataFrame) -> Tuple[List[DatasetProfileColumn], List[str]]:
    total_rows = int(df.shape[0])
    warnings: List[str] = []
    columns: List[DatasetProfileColumn] = []

    for column_name in df.columns:
        series = df[column_name]
        profile = _build_column_profile(column_name, series, total_rows)
        columns.append(profile)

        if profile.missing_percent >= 30:
            warnings.append(
                f"Столбец '{column_name}' содержит {profile.missing_percent}% пропусков"
            )
        if total_rows >= 50 and profile.cardinality == total_rows:
            warnings.append(
                f"Столбец '{column_name}' имеет уникальные значения в каждой строке"
            )
        if total_rows >= 20 and profile.cardinality == 1:
            warnings.append(f"Столбец '{column_name}' имеет только одно уникальное значение")

    return columns, warnings


def _coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _coerce_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=False)


def _normalize_rule(rule: ValidationRule) -> ValidationRule:
    if rule.allowed_values is not None:
        rule.allowed_values = [value.strip() for value in rule.allowed_values]
    return rule


def _validate_series(series: pd.Series, rule: ValidationRule) -> List[DatasetValidationIssue]:
    issues: List[DatasetValidationIssue] = []
    clean_rule = _normalize_rule(rule)

    normalized_series = _normalize_missing_values(series)
    non_null_series = normalized_series.dropna()
    original_non_null = series.loc[non_null_series.index]
    missing_total = int(normalized_series.isna().sum())

    if clean_rule.required and missing_total:
        issues.append(
            DatasetValidationIssue(
                column=rule.column,
                row=None,
                severity="error",
                message=f"Обнаружено {missing_total} пропусков",
            )
        )

    if clean_rule.data_type in {"number", "integer", "boolean", "date"}:
        if clean_rule.data_type == "date":
            coerced = _coerce_datetime(non_null_series)
            invalid_mask = coerced.isna() & non_null_series.notna()
        elif clean_rule.data_type == "boolean":
            valid_values = {"true", "false", "1", "0", "yes", "no"}
            normalized = non_null_series.astype(str).str.lower()
            invalid_mask = ~normalized.isin(valid_values)
        else:
            coerced = _coerce_numeric(non_null_series)
            invalid_mask = coerced.isna()
            if clean_rule.data_type == "integer":
                integer_validity = coerced.dropna().apply(lambda value: float(value).is_integer())
                non_integer_index = integer_validity[~integer_validity].index
                non_integer_mask = pd.Series(False, index=non_null_series.index)
                non_integer_mask.loc[non_integer_index] = True
                invalid_mask = invalid_mask | non_integer_mask

        if clean_rule.data_type in {"number", "integer"} and not non_null_series.size and series.size:
            severity = "error" if clean_rule.required else "warning"
            issues.append(
                DatasetValidationIssue(
                    column=rule.column,
                    row=None,
                    severity=severity,
                    message="Колонка не содержит числовых значений для проверки",
                )
            )

        if clean_rule.data_type != "string":
            invalid_indices = invalid_mask[invalid_mask].index
            for idx in invalid_indices[:5]:
                row_idx = _safe_row_index(idx)
                issues.append(
                    DatasetValidationIssue(
                        column=rule.column,
                        row=row_idx,
                        severity="error",
                        message=f"Значение '{_pythonize_value(original_non_null.loc[idx])}' не соответствует типу {clean_rule.data_type}",
                    )
                )

    if clean_rule.min_value is not None or clean_rule.max_value is not None:
        coerced = _coerce_numeric(non_null_series)
        if clean_rule.min_value is not None:
            below = coerced < clean_rule.min_value
            for idx in coerced[below.fillna(False)].index[:5]:
                row_idx = _safe_row_index(idx)
                issues.append(
                    DatasetValidationIssue(
                        column=rule.column,
                        row=row_idx,
                        severity="error",
                        message=f"Значение {_pythonize_value(original_non_null.loc[idx])} меньше минимума {clean_rule.min_value}",
                    )
                )
        if clean_rule.max_value is not None:
            above = coerced > clean_rule.max_value
            for idx in coerced[above.fillna(False)].index[:5]:
                row_idx = _safe_row_index(idx)
                issues.append(
                    DatasetValidationIssue(
                        column=rule.column,
                        row=row_idx,
                        severity="error",
                        message=f"Значение {_pythonize_value(original_non_null.loc[idx])} больше максимума {clean_rule.max_value}",
                    )
                )

    if clean_rule.regex:
        pattern = re.compile(clean_rule.regex)
        regex_text = clean_rule.regex.strip()
        use_fullmatch = regex_text.startswith("^") or regex_text.endswith("$")

        def _matches_regex(value: Any) -> bool:
            text = str(value)
            if use_fullmatch:
                return bool(pattern.fullmatch(text))
            return bool(pattern.search(text))

        mask = ~non_null_series.astype(str).apply(_matches_regex)
        for idx in non_null_series[mask].index[:5]:
            row_idx = _safe_row_index(idx)
            issues.append(
                DatasetValidationIssue(
                    column=rule.column,
                    row=row_idx,
                    severity="error",
                    message="Значение не соответствует регулярному выражению",
                )
            )

    if clean_rule.allowed_values is not None:
        allowed = {value.lower() for value in clean_rule.allowed_values}
        mask = ~non_null_series.astype(str).str.lower().isin(allowed)
        for idx in non_null_series[mask].index[:5]:
            row_idx = _safe_row_index(idx)
            issues.append(
                DatasetValidationIssue(
                    column=rule.column,
                    row=row_idx,
                    severity="error",
                    message="Значение отсутствует в списке допустимых",
                )
            )

    if clean_rule.unique:
        duplicates = series[series.duplicated(keep=False)]
        for idx in duplicates.index[:5]:
            row_idx = _safe_row_index(idx)
            issues.append(
                DatasetValidationIssue(
                    column=rule.column,
                    row=row_idx,
                    severity="error",
                    message="Значение дублируется",
                )
            )

    return issues
class RefreshScheduleRequest(BaseModel):
    dataset_id: str = Field(..., description="Identifier of the dataset to refresh")
    cron: str = Field(
        ...,
        description="Cron expression that defines when the refresh should run",
        examples=["0 * * * *"],
    )
    sla_seconds: int = Field(
        300,
        ge=60,
        le=86_400,
        description="SLA window in seconds before a refresh is considered stale",
    )
    max_retries: int = Field(
        3,
        ge=0,
        le=10,
        description="Maximum number of retry attempts after a failed refresh",
    )
    name: Optional[str] = Field(
        None,
        description="Optional human friendly name that will be used for the schedule",
    )


class RefreshFailureReport(BaseModel):
    error: str = Field(..., description="Description of the failure cause")


def _ensure_dates(item: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(item)
    now = int(time.time())
    created_at = int(result.get("created_at") or now)
    updated_at = int(result.get("updated_at") or created_at)
    result["created_at"] = created_at
    result["updated_at"] = updated_at
    created_dt = datetime.fromtimestamp(created_at, tz=timezone.utc)
    updated_dt = datetime.fromtimestamp(updated_at, tz=timezone.utc)
    result["created_date"] = _format_datetime(created_dt)
    result["updated_date"] = _format_datetime(updated_dt)
    # Fill optional list fields to avoid returning nulls.
    result.setdefault("tags", [])
    result.setdefault("columns", [])
    result.setdefault("sample_data", [])
    return result


def _normalize_columns(columns: Iterable[ColumnInfo]) -> List[Dict[str, Any]]:
    return [column.model_dump() for column in columns]


def _normalize_tags(tags: Iterable[str]) -> List[str]:
    return [str(tag) for tag in tags]


def _sort_items(items: List[Dict[str, Any]], order_by: Optional[str]) -> List[Dict[str, Any]]:
    field = (order_by or "-created_at")
    reverse = field.startswith("-")
    normalized_field = field.lstrip("-")
    if normalized_field not in _ORDERABLE_FIELDS:
        normalized_field = "created_at"
        reverse = True

    def _sort_key(item: Dict[str, Any]) -> Any:
        value = item.get(normalized_field)
        if isinstance(value, (int, float)):
            return value
        return str(value or "")

    return sorted(items, key=_sort_key, reverse=reverse)


def _list_datasets(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    items = [_ensure_dates(item) for item in _load_all()]
    return _sort_items(items, order_by)


def list_datasets(order_by: Optional[str] = "-created_at") -> List[Dict[str, Any]]:
    """Return datasets for direct invocation (e.g. in tests)."""

    return _list_datasets(order_by=order_by)


@router.get("/list")
def list_datasets_endpoint(
    order_by: Optional[str] = "-created_at",
    request: Request = None,  # type: ignore[assignment]
    response: Response = None,  # type: ignore[assignment]
) -> List[Dict[str, Any]]:
    # FastAPI injects ``Request``/``Response`` despite the default ``None`` which
    # keeps the function callable from tests without providing arguments.
    items = _list_datasets(order_by=order_by)

    if response is not None:
        cache_payload = {"order_by": order_by, "items": items}
        etag = apply_cache_headers(
            response,
            cache_payload,
            cache_seconds=settings.heavy_response_cache_seconds,
        )
        if request is not None and should_return_not_modified(request, etag):
            headers = {"ETag": etag}
            cache_control = response.headers.get("Cache-Control")
            if cache_control:
                headers["Cache-Control"] = cache_control
            return Response(status_code=304, headers=headers)  # type: ignore[return-value]

    return items


def create_dataset(payload: DatasetCreate) -> Dict[str, Any]:
    dataset = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "description": payload.description or "",
        "tags": _normalize_tags(payload.tags),
        "columns": _normalize_columns(payload.columns),
        "file_url": payload.file_url,
        "row_count": payload.row_count,
        "sample_data": payload.sample_data or [],
    }
    dataset = _ensure_dates(dataset)

    items = _load_all()
def _normalize_tags(tags: Optional[Iterable[str]]) -> List[str]:
    if not tags:
        return []
    normalized = []
    seen = set()
    for tag in tags:
        if not tag:
            continue
        value = str(tag).strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(value)
    return normalized


def _normalize_owners(owners: Optional[Iterable[Any]]) -> List[str]:
    if owners is None:
        return []
    if isinstance(owners, (str, bytes)):
        owners = [owners]
    normalized = []
    seen = set()
    for owner in owners:
        if owner is None:
            continue
        value = str(owner).strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(value)
    return normalized


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    return [token for token in re.findall(r"[\w\-]+", text.lower()) if len(token) > 1]


def _build_embedding(payload: Dict[str, Any]) -> Counter:
    tokens: List[str] = []
    tokens.extend(_tokenize(payload.get("name") or ""))
    tokens.extend(_tokenize(payload.get("description") or ""))
    tokens.extend(_tokenize(payload.get("dataset_type") or ""))
    for tag in payload.get("tags", []) or []:
        tokens.extend(_tokenize(tag))
    for owner in payload.get("owners", []) or []:
        tokens.extend(_tokenize(owner))
    for column in payload.get("columns", []) or []:
        if isinstance(column, dict):
            tokens.extend(_tokenize(column.get("name") or ""))
            tokens.extend(_tokenize(column.get("type") or ""))
    if payload.get("insights"):
        for insight in payload.get("insights", []):
            tokens.extend(_tokenize(str(insight)))
    return Counter(tokens)


def _cosine_similarity(left: Counter, right: Counter) -> float:
    if not left or not right:
        return 0.0
    dot = sum(left[token] * right.get(token, 0) for token in left)
    if dot == 0:
        return 0.0
    left_norm = sqrt(sum(value * value for value in left.values()))
    right_norm = sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def _generate_summary(dataset: Dict[str, Any]) -> str:
    name = dataset.get("name") or "Набор данных"
    row_count = dataset.get("row_count")
    column_count = len(dataset.get("columns") or [])
    dataset_type = dataset.get("dataset_type")
    owners = dataset.get("owners") or []
    tags = dataset.get("tags") or []
    insights = dataset.get("insights") or []

    parts: List[str] = []
    if row_count is not None:
        if column_count:
            parts.append(f"{name} содержит {row_count} строк и {column_count} полей.")
        else:
            parts.append(f"{name} содержит {row_count} строк.")
    elif column_count:
        parts.append(f"{name} включает {column_count} полей.")
    else:
        parts.append(f"{name} пока не содержит описанных полей.")

    if column_count:
        column_names = [col.get("name") for col in dataset.get("columns", []) if col.get("name")]
        if column_names:
            sample = ", ".join(column_names[:3])
            if len(column_names) > 3:
                sample += f" и ещё {len(column_names) - 3}"
            parts.append(f"Структура включает поля {sample}.")
        else:
            parts.append("Структура набора описана, но названия столбцов отсутствуют.")
    else:
        parts.append("Столбцы пока не определены.")

    if dataset_type and dataset_type != "general":
        parts.append(f"Тип: {dataset_type}.")

    if owners:
        owners_label = ", ".join(owners[:3])
        parts.append(f"Ответственные: {owners_label}.")

    if tags:
        tags_preview = ", ".join(tags[:4])
        parts.append(f"Ключевые теги: {tags_preview}.")

    if insights:
        first_insight = str(insights[0])
        parts.append(first_insight)

    freshness_source = _parse_datetime(dataset.get("updated_date") or dataset.get("updated_at") or dataset.get("created_date") or dataset.get("created_at"))
    if freshness_source:
        now = datetime.now(timezone.utc)
        delta = now - freshness_source
        days = max(delta.days, 0)
        if days <= 14:
            freshness = "Данные актуальны."
        elif days <= 60:
            freshness = "Проверьте свежесть данных — последнее обновление было несколько недель назад."
        else:
            freshness = "Данные устарели, требуется обновление."
        parts.append(freshness)

    if not parts:
        return "Метаданные набора пока не заполнены."

    return " ".join(parts)


def _ensure_summary(item: Dict[str, Any]) -> Dict[str, Any]:
    if not item.get("auto_summary"):
        item["auto_summary"] = _generate_summary(item)
    return item


def _normalise_tags(tags: Optional[Iterable[str]]) -> Set[str]:
    if not tags:
        return set()
    normalised: Set[str] = set()
    for tag in tags:
        if not tag:
            continue
        normalised.add(tag.strip().lower())
    return normalised


def _resolve_param(value):
    if isinstance(value, params.Param):
        return value.default
    return value


@router.get("/list")
def list_datasets(
    order_by: Optional[str] = "-created_at",
    page: int = Query(1, ge=1, description="Номер страницы"),
    page_size: int = Query(20, ge=1, le=100, description="Количество элементов на странице"),
    search: Optional[str] = Query(None, description="Поисковый запрос по названиям, описанию и тегам"),
    tags: Optional[List[str]] = Query(None, description="Фильтр по тегам"),
):
    raw_page = page
    raw_page_size = page_size

    page = _resolve_param(page) or 1
    page_size = _resolve_param(page_size) or DEFAULT_PAGE_SIZE
    search = _resolve_param(search)
    tags = _resolve_param(tags)
    if isinstance(tags, str):
        tags = [tags]

    items = [_ensure_dates(item) for item in _load_all()]

    available_tags = sorted({tag for item in items for tag in item.get("tags", []) if tag})

    filtered = items
    if search:
        query = search.strip().lower()
        if query:
            def _matches(item: Dict[str, Any]) -> bool:
                haystacks = [
                    (item.get("name") or "").lower(),
                    (item.get("description") or "").lower(),
                ]
                haystacks.extend((tag or "").lower() for tag in item.get("tags", []))
                for column in item.get("columns", []) or []:
                    haystacks.append((column.get("name") or "").lower())
                return any(query in hay for hay in haystacks if hay)

            filtered = [item for item in filtered if _matches(item)]

    tag_filter = _normalise_tags(tags)
    if tag_filter:
        def _has_tags(item: Dict[str, Any]) -> bool:
            item_tags = _normalise_tags(item.get("tags", []))
            return tag_filter.issubset(item_tags)

        filtered = [item for item in filtered if _has_tags(item)]

def _prepare_dataset(dataset: Dict[str, Any]) -> Dict[str, Any]:
    dataset["tags"] = _normalize_tags(dataset.get("tags"))
    dataset["owners"] = _normalize_owners(dataset.get("owners"))
    dataset.setdefault("dataset_type", "general")
    _ensure_summary(dataset)
    return dataset


def _collect_facets(items: Sequence[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    counters = {
        "tags": Counter(),
        "types": Counter(),
        "owners": Counter(),
    }
    for item in items:
        for tag in item.get("tags", []) or []:
            counters["tags"][tag] += 1
        dataset_type = item.get("dataset_type")
        if dataset_type:
            counters["types"][dataset_type] += 1
        for owner in item.get("owners", []) or []:
            counters["owners"][owner] += 1

    def _format(counter: Counter) -> List[Dict[str, Any]]:
        return [
            {"value": key, "count": counter[key]}
            for key in sorted(counter, key=lambda value: (-counter[value], value.lower()))
        ]

    return {facet: _format(counter) for facet, counter in counters.items()}


def _matches_facets(item: Dict[str, Any], tags: List[str], types: List[str], owners: List[str]) -> bool:
    if tags:
        item_tags = {tag.lower() for tag in item.get("tags", []) or []}
        if not set(tag.lower() for tag in tags).issubset(item_tags):
            return False
    if types:
        dataset_type = (item.get("dataset_type") or "").lower()
        if dataset_type not in {value.lower() for value in types}:
            return False
    if owners:
        item_owners = {owner.lower() for owner in item.get("owners", []) or []}
        if not set(owner.lower() for owner in owners).intersection(item_owners):
            return False
    return True


def _sort_value_for_field(value: Any, *, reverse: bool) -> Any:
    if value is None:
        return float("-inf") if reverse else float("inf")
    if isinstance(value, str):
        return value.lower()
    return value


def _search_items(
    items: Sequence[Dict[str, Any]],
    query: Optional[str],
    tags: List[str],
    types: List[str],
    owners: List[str],
    order_by: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    normalized_query = (query or "").strip().lower()
    query_tokens = Counter(_tokenize(normalized_query)) if normalized_query else Counter()

    matched: List[Tuple[float, Dict[str, Any]]] = []
    for item in items:
        if not _matches_facets(item, tags, types, owners):
            continue

        metadata = item.copy()
        text_blob = " ".join(
            filter(
                None,
                [
                    metadata.get("name"),
                    metadata.get("description"),
                    metadata.get("dataset_type"),
                    " ".join(metadata.get("tags", [])),
                    " ".join(metadata.get("owners", [])),
                ],
            )
        ).lower()

        score = 0.0
        match_reasons: List[str] = []

        if normalized_query:
            if normalized_query in text_blob:
                score += 1.0
                match_reasons.append("Совпадение по ключевой фразе")
            embedding = _build_embedding(metadata)
            similarity = _cosine_similarity(query_tokens, embedding)
            if similarity > 0:
                score += similarity
                match_reasons.append("Семантическое совпадение по описанию")
        else:
            score = 1.0

        if tags:
            match_reasons.append("Отфильтровано по тегам")
        if types:
            match_reasons.append("Фильтр по типу")
        if owners:
            match_reasons.append("Уточнение по владельцам")

        if score > 0:
            annotated = metadata.copy()
            annotated["match_score"] = round(score, 4)
            annotated["match_reasons"] = match_reasons
            matched.append((score, annotated))

    if order_by:
        reverse = order_by.startswith("-")
        field = order_by.lstrip("-")

        def ordering_key(payload: Tuple[float, Dict[str, Any]]):
            _, annotated = payload
            return _sort_value_for_field(annotated.get(field), reverse=reverse)

        matched.sort(key=ordering_key, reverse=reverse)

    if normalized_query or not order_by:
        matched.sort(key=lambda payload: payload[0], reverse=True)

    return [item for _, item in matched], {
        "query": query,
        "tags": tags,
        "types": types,
        "owners": owners,
        "order_by": order_by,
    }


def _similar_items(dataset: Dict[str, Any], others: Sequence[Dict[str, Any]], limit: int = 5):
    base_embedding = _build_embedding(dataset)
    matches: List[Tuple[float, Dict[str, Any]]] = []
    for item in others:
        if item.get("id") == dataset.get("id"):
            continue
        embedding = _build_embedding(item)
        similarity = _cosine_similarity(base_embedding, embedding)
        if similarity <= 0:
            continue
        overlap_tags = sorted(set(dataset.get("tags", []) or []).intersection(item.get("tags", []) or []))
        result = item.copy()
        result["similarity"] = round(similarity, 4)
        if overlap_tags:
            result["overlap_tags"] = overlap_tags
        matches.append((similarity, result))

    matches.sort(key=lambda payload: payload[0], reverse=True)
    return [item for _, item in matches[:limit]]


class MetricPoint(BaseModel):
    timestamp: str
    value: float


class MetricSeriesInput(BaseModel):
    metric: str
    series: Optional[List[MetricPoint]] = None


class MetricsMonitorRequest(BaseModel):
    dataset_id: Optional[str] = None
    metrics: List[MetricSeriesInput] = Field(default_factory=list)
    sensitivity: float = Field(
        default=2.5,
        ge=0.1,
        le=10.0,
        description="Множитель для определения выбросов (по стандартному отклонению)",
    )
    min_points: int = Field(default=5, ge=3, le=200)


def _generate_series_from_dataset(dataset: Dict[str, Any], metric: str, points: int = 12) -> List[MetricPoint]:
    base_value = max(int(dataset.get("row_count") or 50), 10)
    seed = f"{dataset.get('id', '')}:{metric}"
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)
    series: List[MetricPoint] = []
    trend_factor = rng.uniform(-0.12, 0.18)
    for index in range(points):
        timestamp = (now - timedelta(days=(points - index) * 7)).isoformat()
        noise = rng.uniform(-0.08, 0.09)
        trend = trend_factor * (index / max(points - 1, 1))
        value = max(0.0, base_value * (1 + noise + trend))
        series.append(MetricPoint(timestamp=timestamp, value=round(value, 2)))
    if rng.random() > 0.6:
        spike_index = rng.randrange(points)
        spike_multiplier = rng.uniform(1.2, 1.6)
        series[spike_index] = MetricPoint(
            timestamp=series[spike_index].timestamp,
            value=round(series[spike_index].value * spike_multiplier, 2),
        )
    return series


def _prepare_series(series: Optional[Sequence[MetricPoint]], min_points: int) -> List[MetricPoint]:
    cleaned: List[MetricPoint] = []
    if series:
        for point in series:
            try:
                value = float(point.value)
            except (TypeError, ValueError):
                continue
            cleaned.append(MetricPoint(timestamp=str(point.timestamp), value=value))
    if len(cleaned) < min_points:
        raise HTTPException(status_code=400, detail="Недостаточно точек для анализа метрики")
    cleaned.sort(key=lambda point: point.timestamp)
    return cleaned


def _detect_anomalies(series: Sequence[MetricPoint], sensitivity: float) -> Tuple[List[Dict[str, Any]], float]:
    values = [point.value for point in series]
    baseline = mean(values)
    try:
        deviation = pstdev(values)
    except Exception:
        deviation = 0.0
    threshold = deviation * sensitivity if deviation else 0.0

    anomalies: List[Dict[str, Any]] = []
    for point in series:
        delta = abs(point.value - baseline)
        if deviation == 0:
            continue
        z_score = delta / deviation if deviation else 0.0
        if z_score >= sensitivity:
            severity = "critical" if z_score >= sensitivity * 1.5 else "warning"
            anomalies.append(
                {
                    "timestamp": point.timestamp,
                    "value": point.value,
                    "deviation": round(delta, 2),
                    "z_score": round(z_score, 2),
                    "severity": severity,
                    "message": "Значение отклоняется от среднего уровня",
                }
            )
    return anomalies, threshold


def _calculate_trend(series: Sequence[MetricPoint]) -> Dict[str, Any]:
    n = len(series)
    if n < 2:
        return {"direction": "stable", "slope": 0.0, "change_percent": 0.0}

    xs = list(range(n))
    ys = [point.value for point in series]
    x_mean = mean(xs)
    y_mean = mean(ys)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    denominator = sum((x - x_mean) ** 2 for x in xs) or 1.0
    slope = numerator / denominator

    change_percent = 0.0
    if ys[0]:
        change_percent = ((ys[-1] - ys[0]) / abs(ys[0])) * 100

    direction = "stable"
    if slope > 0.1:
        direction = "growing"
    elif slope < -0.1:
        direction = "declining"

    return {
        "direction": direction,
        "slope": round(slope, 4),
        "change_percent": round(change_percent, 2),
    }


def _evaluate_metric(metric: str, series: Sequence[MetricPoint], sensitivity: float) -> Dict[str, Any]:
    anomalies, threshold = _detect_anomalies(series, sensitivity)
    trend = _calculate_trend(series)
    status = "ok"
    if anomalies:
        status = "critical" if any(item["severity"] == "critical" for item in anomalies) else "warning"

    last_value = series[-1].value if series else None
    baseline = mean(point.value for point in series)

    recommendations = []
    if status != "ok":
        if trend["direction"] == "growing":
            recommendations.append("Проверьте процессы загрузки данных — наблюдается рост показателя.")
        elif trend["direction"] == "declining":
            recommendations.append("Выясните причины падения метрики и запланируйте корректирующие действия.")
        else:
            recommendations.append("Оцените источники скачка и пересчитайте метрику при необходимости.")
    else:
        recommendations.append("Метрика в норме, дополнительных действий не требуется.")

    return {
        "metric": metric,
        "status": status,
        "anomalies": anomalies,
        "trend": trend,
        "latest_value": round(last_value, 2) if last_value is not None else None,
        "baseline": round(baseline, 2),
        "threshold": round(threshold, 2),
        "recommendations": recommendations,
        "series": [point.model_dump() for point in series],
    }


@router.get("/list")
def list_datasets(order_by: Optional[str] = "-created_at"):
    items = [_ensure_summary(_ensure_dates(item)) for item in _load_all()]
    if order_by:
        reverse = order_by.startswith("-")
        key = order_by.lstrip("-")
        filtered.sort(key=lambda x: x.get(key, 0), reverse=reverse)

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = filtered[start:end]
    total_pages = ceil(total / page_size) if total else 0

    compatibility_plain = (
        (isinstance(raw_page, params.Param) or page == 1)
        and (isinstance(raw_page_size, params.Param) or page_size == DEFAULT_PAGE_SIZE)
        and not search
        and not tag_filter
    )

    if compatibility_plain:
        return filtered

    return {
        "items": paginated,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_previous": page > 1,
        "available_filters": {"tags": available_tags},
    }


@router.get("/refresh/schedules")
def list_refresh_schedules() -> Dict[str, Any]:
    schedules = _refresh_scheduler.list_schedules()
    return {"items": schedules, "count": len(schedules)}


@router.get("/refresh/schedules/due")
def list_due_refresh_schedules() -> Dict[str, Any]:
    schedules = _refresh_scheduler.get_due_jobs()
    return {"items": schedules, "count": len(schedules)}


@router.post("/refresh/schedules")
def create_refresh_schedule(payload: RefreshScheduleRequest):
    dataset = next((item for item in _load_all() if item.get("id") == payload.dataset_id), None)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    schedule_name = payload.name or dataset.get("name") or payload.dataset_id
    config = ScheduleConfig(
        name=f"refresh:{schedule_name}",
        task="refresh_dataset",
        cron=payload.cron,
        sla_seconds=payload.sla_seconds,
        max_retries=payload.max_retries,
        payload={"dataset_id": payload.dataset_id},
    )
    try:
        schedule = _refresh_scheduler.register_job(config)
    except InvalidSchedule as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "scheduled", "schedule": schedule}


@router.post("/refresh/schedules/{schedule_id}/start")
def start_refresh_schedule(schedule_id: str):
    try:
        schedule = _refresh_scheduler.mark_running(schedule_id)
    except ScheduleNotFound as exc:
        raise HTTPException(status_code=404, detail="Schedule not found") from exc
    return {"status": "running", "schedule": schedule}


@router.post("/refresh/schedules/{schedule_id}/success")
def complete_refresh_schedule(schedule_id: str):
    try:
        schedule = _refresh_scheduler.mark_completed(schedule_id)
    except ScheduleNotFound as exc:
        raise HTTPException(status_code=404, detail="Schedule not found") from exc
    return {"status": "completed", "schedule": schedule}


@router.post("/refresh/schedules/{schedule_id}/failure")
def register_refresh_failure(schedule_id: str, payload: RefreshFailureReport):
    try:
        schedule = _refresh_scheduler.mark_failed(schedule_id, payload.error)
    except ScheduleNotFound as exc:
        raise HTTPException(status_code=404, detail="Schedule not found") from exc
    try:
        notify_dataset_refresh_failure(schedule, reason=payload.error)
    except WebhookDeliveryError as exc:  # pragma: no cover - logging branch
        logger.warning(
            "Failed to dispatch dataset refresh webhook: %s",
            exc,
            extra={"schedule_id": schedule_id},
        )
    return {"status": schedule.get("status"), "schedule": schedule}


@router.delete("/refresh/schedules/{schedule_id}")
def delete_refresh_schedule(schedule_id: str):
    try:
        _refresh_scheduler.delete_schedule(schedule_id)
    except ScheduleNotFound as exc:
        raise HTTPException(status_code=404, detail="Schedule not found") from exc
    return {"status": "deleted", "id": schedule_id}


@router.post("/refresh/schedules/enforce-sla")
def enforce_refresh_sla() -> Dict[str, Any]:
    impacted = _refresh_scheduler.enforce_sla()
    for schedule in impacted:
        try:
            notify_dataset_refresh_failure(
                schedule,
                reason=schedule.get("last_error") or "SLA exceeded",
            )
        except WebhookDeliveryError as exc:  # pragma: no cover - logging branch
            logger.warning(
                "Failed to dispatch dataset SLA webhook: %s",
                exc,
                extra={"schedule_id": schedule.get("id")},
            )
    return {"status": "ok", "count": len(impacted), "items": impacted}


@router.post("/create")
def create_dataset(payload: DatasetCreate):
    items = _load_all()
    dataset = payload.model_dump()
    dataset["id"] = str(uuid.uuid4())
    dataset["created_at"] = int(time.time())
    dataset["created_date"] = datetime.utcfromtimestamp(dataset["created_at"]).isoformat() + "Z"
    _prepare_dataset(dataset)
    items.append(dataset)
    _save_all(items)
    return {"status": "created", "id": dataset["id"], "dataset": dataset}


@router.post("/create")
def create_dataset_endpoint(payload: DatasetCreate) -> Dict[str, Any]:
    return create_dataset(payload)


def _find_dataset(datasets: List[Dict[str, Any]], dataset_id: str) -> Dict[str, Any]:
    for item in datasets:
        if item.get("id") == dataset_id:
            return item
@router.get("/search")
def search_datasets(
    query: Optional[str] = None,
    tags: Optional[List[str]] = Query(default=None),
    types: Optional[List[str]] = Query(default=None, alias="dataset_types"),
    owners: Optional[List[str]] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    order_by: Optional[str] = Query(default=None, alias="order_by"),
):
    tags = _normalize_tags(tags)
    types = _normalize_tags(types)
    owners = _normalize_owners(owners)

    items = [_ensure_summary(_ensure_dates(item)) for item in _load_all()]
    results, applied_filters = _search_items(items, query, tags, types, owners, order_by)
    facets = _collect_facets(items)

    payload = {
        "items": results[:limit],
        "total": len(results),
        "facets": facets,
        "applied_filters": applied_filters,
    }
    if query:
        payload["query_embedding_size"] = sum(_build_embedding({"description": query}).values())
    return payload


@router.get("/{dataset_id}/similar")
def get_similar_datasets(dataset_id: str, limit: int = Query(default=5, ge=1, le=20)):
    items = [_ensure_summary(_ensure_dates(item)) for item in _load_all()]
    for item in items:
        if item.get("id") == dataset_id:
            similar = _similar_items(item, items, limit=limit)
            return {"dataset_id": dataset_id, "similar": similar}
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.post("/{dataset_id}/auto-summary")
def regenerate_summary(dataset_id: str):
    items = _load_all()
    for index, item in enumerate(items):
        if item.get("id") == dataset_id:
            _prepare_dataset(item)
            _save_all(items)
            return {"dataset_id": dataset_id, "auto_summary": item.get("auto_summary")}
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.post("/monitor")
def monitor_metrics(payload: MetricsMonitorRequest):
    items = {_ensure_summary(_ensure_dates(item))["id"]: _ensure_summary(_ensure_dates(item)) for item in _load_all()}
    dataset = items.get(payload.dataset_id) if payload.dataset_id else None

    metrics = payload.metrics or []
    if not metrics:
        metrics = [
            MetricSeriesInput(metric="row_count"),
            MetricSeriesInput(metric="ingestion_latency"),
        ]

    results = []
    for metric_input in metrics:
        series = metric_input.series
        if series is None:
            if not dataset:
                raise HTTPException(status_code=400, detail="Для генерации метрик требуется dataset_id")
            series = _generate_series_from_dataset(dataset, metric_input.metric)
        series = _prepare_series(series, payload.min_points)
        results.append(_evaluate_metric(metric_input.metric, series, payload.sensitivity))

    alerts = []
    for result in results:
        for anomaly in result["anomalies"]:
            alerts.append(
                {
                    "metric": result["metric"],
                    "severity": anomaly["severity"],
                    "timestamp": anomaly["timestamp"],
                    "message": anomaly["message"],
                    "value": anomaly["value"],
                }
            )

    status = "ok"
    if any(alert["severity"] == "critical" for alert in alerts):
        status = "critical"
    elif any(alerts):
        status = "warning"

    return {
        "dataset_id": payload.dataset_id,
        "status": status,
        "results": results,
        "alerts": alerts,
    }


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    for item in _load_all():
        if item.get("id") == dataset_id:
            return _ensure_summary(_ensure_dates(item))
    raise HTTPException(status_code=404, detail="Dataset not found")


def get_dataset(dataset_id: str) -> Dict[str, Any]:
    datasets = _load_all()
    dataset = _find_dataset(datasets, dataset_id)
    return _ensure_dates(dataset)


@router.get("/{dataset_id}")
def get_dataset_endpoint(dataset_id: str) -> Dict[str, Any]:
    return get_dataset(dataset_id)


def update_dataset(dataset_id: str, payload: DatasetUpdate) -> Dict[str, Any]:
    datasets = _load_all()
    dataset = _find_dataset(datasets, dataset_id)

    update_payload = payload.model_dump(exclude_unset=True)
    if "tags" in update_payload:
        update_payload["tags"] = _normalize_tags(payload.tags)
    if "columns" in update_payload:
        update_payload["columns"] = _normalize_columns(payload.columns)

    dataset.update(update_payload)
    dataset["updated_at"] = int(time.time())
    dataset = _ensure_dates(dataset)

    # Persist updates back to disk
    updated_items = [dataset if item.get("id") == dataset_id else item for item in datasets]
    _save_all(updated_items)
    return {"status": "updated", "dataset": dataset}


@router.put("/{dataset_id}")
def update_dataset_endpoint(dataset_id: str, payload: DatasetUpdate) -> Dict[str, Any]:
    return update_dataset(dataset_id, payload)
def update_dataset(dataset_id: str, payload: DatasetUpdate):
    items = _load_all()
    for index, item in enumerate(items):
        if item.get("id") == dataset_id:
            updated = item.copy()
            updated.update(payload.model_dump(exclude_unset=True))
            updated["id"] = dataset_id
            updated["updated_at"] = int(time.time())
            updated["updated_date"] = datetime.utcfromtimestamp(updated["updated_at"]).isoformat() + "Z"
            if not updated.get("created_at"):
                updated["created_at"] = int(time.time())
            updated["created_date"] = updated.get("created_date") or datetime.utcfromtimestamp(updated["created_at"]).isoformat() + "Z"
            _prepare_dataset(updated)
            items[index] = updated
            _save_all(items)
            return {"status": "updated", "dataset": _ensure_dates(updated)}
    raise HTTPException(status_code=404, detail="Dataset not found")


def delete_dataset(dataset_id: str) -> Dict[str, Any]:
    datasets = _load_all()
    dataset = _find_dataset(datasets, dataset_id)
    remaining = [item for item in datasets if item.get("id") != dataset_id]
    _save_all(remaining)
    return {"status": "deleted", "id": dataset_id, "dataset": _ensure_dates(dataset)}


@router.delete("/{dataset_id}")
def delete_dataset_endpoint(dataset_id: str) -> Dict[str, Any]:
    return delete_dataset(dataset_id)


__all__ = [
    "CANDIDATE_DIRS",
    "STORE_DIR",
    "DATASETS_JSON",
    "DatasetCreate",
    "DatasetUpdate",
    "create_dataset",
    "delete_dataset",
    "get_dataset",
    "list_datasets",
    "update_dataset",
    "_ensure_dates",
    "_atomic_write_json",
    "_save_all",
]


@router.post("/profile", response_model=DatasetProfileResponse)
def profile_dataset(payload: DatasetProfileRequest) -> DatasetProfileResponse:
    try:
        dataframe = load_dataframe_from_identifier(payload.file_url)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive branch
        raise HTTPException(status_code=400, detail=f"Не удалось загрузить файл: {exc}") from exc

    columns, warnings = _generate_profile(dataframe)
    return DatasetProfileResponse(
        row_count=int(dataframe.shape[0]),
        column_count=int(dataframe.shape[1]),
        columns=columns,
        warnings=warnings,
    )


@router.post("/validate", response_model=DatasetValidationResponse)
def validate_dataset(payload: DatasetValidationRequest) -> DatasetValidationResponse:
    try:
        dataframe = load_dataframe_from_identifier(payload.file_url)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive branch
        raise HTTPException(status_code=400, detail=f"Не удалось загрузить файл: {exc}") from exc

    issues: List[DatasetValidationIssue] = []

    for rule in payload.rules:
        if rule.column not in dataframe.columns:
            issues.append(
                DatasetValidationIssue(
                    column=rule.column,
                    row=None,
                    severity="error",
                    message="Столбец отсутствует в наборе данных",
                )
            )
            continue

        series = dataframe[rule.column]
        issues.extend(_validate_series(series, rule))

    error_count = sum(1 for issue in issues if issue.severity == "error")
    warning_count = sum(1 for issue in issues if issue.severity == "warning")

    summary = {
        "checked_columns": len(payload.rules),
        "error_count": error_count,
        "warning_count": warning_count,
        "row_count": int(dataframe.shape[0]),
    }

    status = "passed" if error_count == 0 else "failed"
    return DatasetValidationResponse(status=status, issues=issues, summary=summary)


if os.getenv("ENABLE_DATASET_DEBUG_ENDPOINT") == "1":
    @router.get("/debug/paths")
    def debug_paths():
        return {
            "APP_DIR": str(APP_DIR),
            "STORE_DIR": str(STORE_DIR),
            "DATASETS_JSON": str(DATASETS_JSON),
            "exists": DATASETS_JSON.exists(),
            "size": DATASETS_JSON.stat().st_size if DATASETS_JSON.exists() else 0,
        }
