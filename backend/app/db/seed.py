"""Utility to seed development fixtures into the database."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from sqlalchemy import select

from .models import Dataset, Visualization
from .session import session_scope

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "data" / "fixtures"


def _load_fixture(path: Path) -> Iterable[dict]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
        if isinstance(payload, list):
            return payload
        raise ValueError(f"Fixture {path} must be a JSON array")


def seed(reset: bool = True) -> None:
    """Populate the database with deterministic development fixtures."""

    datasets_fixture = FIXTURES_DIR / "datasets.json"
    visualizations_fixture = FIXTURES_DIR / "visualizations.json"

    datasets = list(_load_fixture(datasets_fixture))
    visualizations = list(_load_fixture(visualizations_fixture))

    with session_scope() as session:
        if reset:
            session.query(Visualization).delete()
            session.query(Dataset).delete()
            session.flush()

        existing_dataset_ids = session.scalars(select(Dataset.id)).all()
        if existing_dataset_ids:
            # If data already exists and reset=False, do not duplicate fixtures.
            return

        dataset_mapping: dict[str, Dataset] = {}
        for payload in datasets:
            dataset = Dataset(
                name=payload.get("name", "Dataset"),
                description=payload.get("description", ""),
                tags=payload.get("tags", []),
                columns=payload.get("columns", []),
                file_url=payload.get("file_url"),
                row_count=payload.get("row_count"),
                sample_data=payload.get("sample_data"),
            )
            session.add(dataset)
            session.flush()
            dataset_mapping[dataset.name] = dataset

        for payload in visualizations:
            dataset_name = payload.get("dataset_name")
            dataset_id = None
            if dataset_name and dataset_name in dataset_mapping:
                dataset_id = dataset_mapping[dataset_name].id
            visualization = Visualization(
                title=payload.get("title", "Visualization"),
                type=payload.get("type", "chart"),
                dataset_id=dataset_id,
                config=payload.get("config", {}),
                summary=payload.get("summary"),
                tags=payload.get("tags", []),
                x_axis=payload.get("x_axis"),
                y_axis=payload.get("y_axis"),
                z_axis=payload.get("z_axis"),
                insights=payload.get("insights"),
            )
            session.add(visualization)


if __name__ == "__main__":  # pragma: no cover - manual utility
    seed(reset=True)
    print("Database seeded with development fixtures.")
