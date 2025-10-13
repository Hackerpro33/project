"""SQLAlchemy models for primary domain entities."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Dataset(Base):
    """Dataset available for advanced analytics dashboards."""

    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    columns: Mapped[list[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_data: Mapped[list[Dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "tags": self.tags or [],
            "columns": self.columns or [],
            "file_url": self.file_url,
            "row_count": self.row_count,
            "sample_data": self.sample_data,
            "created_at": int(self.created_at.timestamp()) if self.created_at else None,
            "created_date": self.created_at.isoformat() if self.created_at else None,
            "updated_at": int(self.updated_at.timestamp()) if self.updated_at else None,
            "updated_date": self.updated_at.isoformat() if self.updated_at else None,
        }
        return payload


class Visualization(Base):
    """Saved visualization definitions bound to datasets."""

    __tablename__ = "visualizations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(64), default="chart", nullable=False)
    dataset_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True
    )
    config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    summary: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    x_axis: Mapped[str | None] = mapped_column(String(255), nullable=True)
    y_axis: Mapped[str | None] = mapped_column(String(255), nullable=True)
    z_axis: Mapped[str | None] = mapped_column(String(255), nullable=True)
    insights: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "type": self.type,
            "dataset_id": self.dataset_id,
            "config": self.config or {},
            "summary": self.summary,
            "tags": self.tags or [],
            "x_axis": self.x_axis,
            "y_axis": self.y_axis,
            "z_axis": self.z_axis,
            "insights": self.insights or [],
            "created_at": int(self.created_at.timestamp()) if self.created_at else None,
            "created_date": self.created_at.isoformat() if self.created_at else None,
            "updated_at": int(self.updated_at.timestamp()) if self.updated_at else None,
            "updated_date": self.updated_at.isoformat() if self.updated_at else None,
        }
        return payload
