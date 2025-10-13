from collections import Counter
from datetime import datetime, timedelta, timezone
from math import sqrt
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import json
import os
import random
import re
import tempfile
import shutil
import time
import uuid


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
    name: str = Field(..., description="Название набора")


class DatasetUpdate(DatasetBase):
    pass


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
        items.sort(key=lambda x: x.get(key, 0), reverse=reverse)
    return items


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
    return {"status": "created", "id": dataset["id"], "dataset": _ensure_dates(dataset)}


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
            _prepare_dataset(updated)
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
