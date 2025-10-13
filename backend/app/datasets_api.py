from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import json
import os
import re
import shutil
import tempfile
import time
import uuid

import numpy as np
import pandas as pd

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


router = APIRouter()

APP_DIR = Path(__file__).resolve().parent
CANDIDATE_DIRS = [APP_DIR.parent / "data", APP_DIR / "data"]


def _ensure_store_dir() -> Path:
    for directory in CANDIDATE_DIRS:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            return directory
        except Exception:
            continue
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


STORE_DIR = _ensure_store_dir()
DATASETS_JSON = STORE_DIR / "datasets.json"


def _atomic_write_json(path: Path, data: Any):
    fd, tmp_path = tempfile.mkstemp(prefix="datasets_", suffix=".json", dir=str(path.parent))
    tmp = Path(tmp_path)
    # close the descriptor immediately, we'll reopen via Path
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        shutil.move(str(tmp), str(path))
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def _load_all() -> List[Dict[str, Any]]:
    for directory in CANDIDATE_DIRS:
        candidate = directory / "datasets.json"
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
    return []


def _save_all(items: List[Dict[str, Any]]):
    _atomic_write_json(DATASETS_JSON, items)


class ColumnInfo(BaseModel):
    name: str
    type: str = "string"
    selected: Optional[bool] = True


class DatasetBase(BaseModel):
    name: Optional[str] = Field(None, description="Название набора")
    description: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    columns: List[ColumnInfo] = Field(default_factory=list)
    file_url: Optional[str] = None
    row_count: Optional[int] = None
    sample_data: Optional[List[Dict[str, Any]]] = None


class DatasetCreate(DatasetBase):
    name: str = Field(..., description="Название набора")


class DatasetUpdate(DatasetBase):
    pass


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
def _ensure_dates(item: Dict[str, Any]) -> Dict[str, Any]:
    created_at = item.get("created_at")
    if not created_at:
        created_date = item.get("created_date")
        if created_date:
            try:
                created_at = int(datetime.fromisoformat(created_date.replace("Z", "+00:00")).timestamp())
            except Exception:
                created_at = int(time.time())
        else:
            created_at = int(time.time())
    item["created_at"] = created_at
    if not item.get("created_date"):
        item["created_date"] = datetime.utcfromtimestamp(created_at).isoformat() + "Z"

    updated_at = item.get("updated_at")
    if updated_at and not item.get("updated_date"):
        item["updated_date"] = datetime.utcfromtimestamp(updated_at).isoformat() + "Z"
    return item


@router.get("/list")
def list_datasets(order_by: Optional[str] = "-created_at"):
    items = [_ensure_dates(item) for item in _load_all()]
    if order_by:
        reverse = order_by.startswith("-")
        key = order_by.lstrip("-")
        items.sort(key=lambda x: x.get(key, 0), reverse=reverse)
    return items


@router.post("/create")
def create_dataset(payload: DatasetCreate):
    items = _load_all()
    dataset = payload.model_dump()
    dataset["id"] = str(uuid.uuid4())
    dataset["created_at"] = int(time.time())
    dataset["created_date"] = datetime.utcfromtimestamp(dataset["created_at"]).isoformat() + "Z"
    items.append(dataset)
    _save_all(items)
    return {"status": "created", "id": dataset["id"], "dataset": _ensure_dates(dataset)}


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    for item in _load_all():
        if item.get("id") == dataset_id:
            return _ensure_dates(item)
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.put("/{dataset_id}")
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
            items[index] = updated
            _save_all(items)
            return {"status": "updated", "dataset": _ensure_dates(updated)}
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str):
    items = _load_all()
    remaining = [item for item in items if item.get("id") != dataset_id]
    if len(remaining) == len(items):
        raise HTTPException(status_code=404, detail="Dataset not found")
    _save_all(remaining)
    return {"status": "deleted", "id": dataset_id}


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
