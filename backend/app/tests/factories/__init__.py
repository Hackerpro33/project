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
    insights = Use(lambda: ["Insight generated in tests", "An additional datapoint"])
    sample_data = Use(
        lambda: [
            {"city": "Paris", "population": 2148327, "offense": "burglary"},
            {"city": "Berlin", "population": 3769495, "offense": "fraud"},
            {"city": "Madrid", "population": 3223334, "offense": "robbery"},
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
            {"city": "Paris", "population": 2148327},
            {"city": "Berlin", "population": 3769495},
            {"city": "Madrid", "population": 3223334},
        ]
    )


__all__ = [
    "ColumnPreviewFactory",
    "QuickExtractionFactory",
    "ColumnInfoFactory",
    "DatasetCreateFactory",
]
