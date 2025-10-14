"""Tests exercising large dataset handling and sampling logic."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import extraction  # noqa: E402


def test_build_extraction_handles_large_tabular_datasets():
    rows = 101_237
    columns = 320
    base_row = np.arange(columns, dtype=np.int16)
    data = np.tile(base_row, (rows, 1))
    df = pd.DataFrame(data, columns=[f"feature_{index}" for index in range(columns)])

    result = extraction.build_extraction(df, sample_rows=128)

    assert result["row_count"] == rows
    assert len(result["columns"]) == columns
    assert len(result["sample_data"]) == 128
    assert result["insights"] == []
    first_row = result["sample_data"][0]
    assert first_row["feature_0"] == 0
    assert first_row[f"feature_{columns - 1}"] == columns - 1
    assert all(len(row) == columns for row in result["sample_data"])


def test_generate_domain_insights_skips_non_matching_columns(monkeypatch):
    df = pd.DataFrame(
        {
            "crime_rate": [10, 20, 30],
            "police_units": [5, 3, 2],
            "poverty_index": [0.1, 0.2, 0.3],
            "general_column": [1, 1, 1],
            "misc": [0, 0, 0],
        }
    )

    captured = []
    real_numeric = extraction._numeric_series

    def tracking_numeric(series):
        captured.append(series.name)
        return real_numeric(series)

    monkeypatch.setattr(extraction, "_numeric_series", tracking_numeric)

    insights = extraction._generate_domain_insights(df)

    assert set(captured) == {"crime_rate", "police_units", "poverty_index"}
    assert any("Crime indicator" in text for text in insights)
    assert any("Policing resource" in text for text in insights)
    assert any("Risk factor" in text for text in insights)


def test_numeric_series_skips_conversion_for_numeric_dtype(monkeypatch):
    series = pd.Series([1, 2, 3], dtype=np.int64, name="crime_count")

    def fail_to_numeric(*args, **kwargs):
        raise AssertionError("pd.to_numeric should not be called for numeric series")

    monkeypatch.setattr(pd, "to_numeric", fail_to_numeric)

    result = extraction._numeric_series(series)

    assert result.tolist() == [1, 2, 3]
