from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .services import materialized_views

router = APIRouter()


class MetricSnapshot(BaseModel):
    count: float = Field(0.0, description="Количество наблюдений")
    sum: float = Field(0.0, description="Сумма значений")
    avg: float = Field(0.0, description="Среднее значение")
    min: float = Field(0.0, description="Минимум")
    max: float = Field(0.0, description="Максимум")


class MaterializedViewRefreshEvent(BaseModel):
    version_id: Optional[str]
    version_number: Optional[int]
    refreshed_at: int
    refreshed_date: str
    row_count: int
    delta: Dict[str, MetricSnapshot]
    change_summary: Optional[Dict[str, Any]] = None


class MaterializedViewResponse(BaseModel):
    dataset_id: str
    baseline_version_id: Optional[str]
    baseline_version_number: Optional[int]
    last_version_id: Optional[str]
    last_version_number: Optional[int]
    last_refresh_at: int
    last_refresh_date: str
    row_count: int
    strategy: str
    refresh_count: int
    metrics: Dict[str, MetricSnapshot]
    delta: Dict[str, MetricSnapshot]
    baseline_metrics: Dict[str, MetricSnapshot]
    delta_from_baseline: Dict[str, MetricSnapshot]
    change_summary: Optional[Dict[str, Any]] = None
    previous_version_id: Optional[str] = None
    history: List[MaterializedViewRefreshEvent] = Field(default_factory=list)


@router.get("/materialized", response_model=List[MaterializedViewResponse])
def list_materialized() -> List[MaterializedViewResponse]:
    """Вернуть метаданные всех материализованных представлений."""

    return [MaterializedViewResponse(**item) for item in materialized_views.list_materialized_views()]


@router.get("/{dataset_id}/materialized", response_model=MaterializedViewResponse)
def get_materialized(dataset_id: str) -> MaterializedViewResponse:
    """Получить материализованное представление конкретного датасета."""

    entry = materialized_views.get_materialized_view(dataset_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Materialized view not found")
    return MaterializedViewResponse(**entry)


__all__ = [
    "router",
    "MaterializedViewResponse",
    "MaterializedViewRefreshEvent",
    "MetricSnapshot",
]
