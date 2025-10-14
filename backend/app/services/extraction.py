"""Domain-specific dataset extraction helpers."""
from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd


CRIME_TREND_KEYWORDS = ("crime", "offense", "incident", "violence", "homicide")
POLICING_TREND_KEYWORDS = ("police", "patrol", "enforcement")
RISK_FACTOR_KEYWORDS = ("unemployment", "poverty", "alcohol", "drug", "gang", "homeless")


def detect_general_type(series: pd.Series) -> str:
    """Return a coarse-grained data type descriptor for ``series``."""

    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    return "string"


def _numeric_series(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.dropna()


def _generate_domain_insights(df: pd.DataFrame) -> List[str]:
    insights: List[str] = []

    for column in df.columns:
        original_name = str(column)
        lower_name = original_name.lower()

        matches_crime = any(keyword in lower_name for keyword in CRIME_TREND_KEYWORDS)
        matches_policing = any(keyword in lower_name for keyword in POLICING_TREND_KEYWORDS)
        matches_risk = any(keyword in lower_name for keyword in RISK_FACTOR_KEYWORDS)

        if not (matches_crime or matches_policing or matches_risk):
            continue

        numeric = _numeric_series(df[column])
        if numeric.empty:
            continue

        if matches_crime:
            change = float(numeric.iloc[-1] - numeric.iloc[0])
            if change > 0:
                insights.append(
                    f"Crime indicator '{original_name}' increased by {change:.2f} between the first and last records."
                )
            elif change < 0:
                insights.append(
                    f"Crime indicator '{original_name}' decreased by {abs(change):.2f} between the first and last records."
                )
            else:
                insights.append(
                    f"Crime indicator '{original_name}' remained stable across the observed period."
                )

        if matches_policing:
            change = float(numeric.iloc[-1] - numeric.iloc[0])
            if change > 0:
                insights.append(
                    f"Policing resource '{original_name}' increased by {change:.2f} between the first and last records."
                )
            elif change < 0:
                insights.append(
                    f"Policing resource '{original_name}' decreased by {abs(change):.2f} between the first and last records."
                )
            else:
                insights.append(
                    f"Policing resource '{original_name}' remained stable across the observed period."
                )

        if matches_risk:
            average = float(numeric.mean())
            insights.append(
                f"Risk factor '{original_name}' averages {average:.2f} across the dataset."
            )

    return insights


def build_extraction(df: pd.DataFrame, sample_rows: int = 100) -> Dict[str, Any]:
    """Construct a structured preview payload for ``df``."""

    cols = [{"name": str(c), "type": detect_general_type(df[c])} for c in df.columns]
    sample = df.head(sample_rows).replace({np.nan: ""}).astype(object)
    sample = sample.to_dict(orient="records")
    insights = _generate_domain_insights(df)
    return {
        "columns": cols,
        "row_count": int(len(df)),
        "sample_data": sample,
        "insights": insights,
    }


__all__ = [
    "build_extraction",
    "detect_general_type",
]
