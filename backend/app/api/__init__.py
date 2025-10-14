"""Helpers for wiring FastAPI routers into the application."""

from __future__ import annotations

from typing import Iterable, Tuple

from fastapi import APIRouter, FastAPI

from .routes import (
    audit,
    chat,
    collaboration,
    dataset_versions,
    datasets,
    dictionary,
    feature_flags,
    schedules,
    views,
    visualizations,
)

RouterRegistration = Tuple[APIRouter, str]


def _versioned_routes(prefix: str) -> Iterable[RouterRegistration]:
    yield datasets.router, f"{prefix}/dataset"
    yield dataset_versions.router, f"{prefix}/dataset"
    yield dictionary.router, f"{prefix}/dictionary"
    yield visualizations.router, f"{prefix}/visualization"
    yield chat.router, f"{prefix}/chat"
    yield audit.router, f"{prefix}/audit"
    yield schedules.router, prefix


def _legacy_routes() -> Iterable[RouterRegistration]:
    yield datasets.router, "/api/dataset"
    yield dataset_versions.router, "/api/dataset"
    yield dictionary.router, "/api/dictionary"
    yield visualizations.router, "/api/visualization"
    yield chat.router, "/api/chat"
    yield audit.router, "/api/audit"
    yield views.router, "/api"
    yield feature_flags.router, "/api/feature-flags"
    yield collaboration.router, "/api"


def register_routes(app: FastAPI, api_prefix: str) -> None:
    """Attach both versioned and legacy API routers to ``app``."""

    for router, prefix in _versioned_routes(api_prefix):
        app.include_router(router, prefix=prefix)
    for router, prefix in _legacy_routes():
        app.include_router(router, prefix=prefix)


__all__ = ["register_routes"]
