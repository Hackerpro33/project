"""Factories for generating synthetic payloads in tests."""
from __future__ import annotations

from polyfactory import Use
from polyfactory.factories.pydantic_factory import ModelFactory

from app.api.routes import datasets as datasets_api
from ...schemas.upload import ColumnPreview, QuickExtraction


class ColumnPreviewFactory(ModelFactory[ColumnPreview]):
    """Factory that generates :class:`ColumnPreview` objects."""

    __model__ = ColumnPreview
    __check_model__ = False


class QuickExtractionFactory(ModelFactory[QuickExtraction]):
    """Factory that produces realistic quick extraction payloads."""

    __model__ = QuickExtraction
    __check_model__ = False

    columns = Use(lambda: ColumnPreviewFactory.batch(3))
    insights = Use(lambda: ["Инсайт, сгенерированный в тестах", "Дополнительное наблюдение"])
    sample_data = Use(
        lambda: [
            {"city": "Москва", "population": 12615882, "offense": "кража"},
            {"city": "Санкт-Петербург", "population": 5383890, "offense": "мошенничество"},
            {"city": "Новосибирск", "population": 1620162, "offense": "грабёж"},
        ]
    )


class ColumnInfoFactory(ModelFactory[datasets_api.ColumnInfo]):
    """Factory for dataset column metadata used by dataset endpoints."""

    __model__ = datasets_api.ColumnInfo
    __check_model__ = False


class DatasetCreateFactory(ModelFactory[datasets_api.DatasetCreate]):
    """Factory that generates dataset creation payloads."""

    __model__ = datasets_api.DatasetCreate
    __check_model__ = False

    columns = Use(lambda: ColumnInfoFactory.batch(4))
    row_count = Use(lambda: 2)
    sample_data = Use(
        lambda: [
            {"city": "Москва", "population": 12615882},
            {"city": "Санкт-Петербург", "population": 5383890},
            {"city": "Новосибирск", "population": 1620162},
        ]
    )


__all__ = [
    "ColumnPreviewFactory",
    "QuickExtractionFactory",
    "ColumnInfoFactory",
    "DatasetCreateFactory",
]
