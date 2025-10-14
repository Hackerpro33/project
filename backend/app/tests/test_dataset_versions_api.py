import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import datasets_api, dataset_segments_api, dataset_versions_api
from app.main import app

HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def override_storage(tmp_path, monkeypatch):
    store_dir = tmp_path / "store"
    store_dir.mkdir()

    datasets_path = store_dir / "datasets.json"
    versions_path = store_dir / "dataset_versions.json"
    segments_path = store_dir / "dataset_segments.json"
    lifecycle_path = store_dir / "dataset_version_lifecycle.json"

    monkeypatch.setattr(datasets_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(datasets_api, "DATASETS_JSON", datasets_path)
    monkeypatch.setattr(datasets_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(dataset_versions_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(dataset_versions_api, "VERSIONS_JSON", versions_path)
    monkeypatch.setattr(dataset_versions_api, "LIFECYCLE_JSON", lifecycle_path)
    monkeypatch.setattr(dataset_versions_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(dataset_segments_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(dataset_segments_api, "SEGMENTS_JSON", segments_path)
    monkeypatch.setattr(dataset_segments_api, "CANDIDATE_DIRS", [store_dir])

    # Ensure clean files
    for path in (datasets_path, versions_path, segments_path, lifecycle_path):
        if path.exists():
            path.unlink()
    yield
    # Cleanup created files
    for path in (datasets_path, versions_path, segments_path, lifecycle_path):
        if path.exists():
            path.unlink()


def _create_dataset(name: str = "Sales") -> str:
    payload = datasets_api.DatasetCreate(
        name=name,
        description="Test dataset",
        columns=[
            datasets_api.ColumnInfo(name="id", type="number"),
            datasets_api.ColumnInfo(name="city", type="string"),
            datasets_api.ColumnInfo(name="revenue", type="number"),
        ],
        sample_data=[
            {"id": 1, "city": "Москва", "revenue": 120.0},
            {"id": 2, "city": "Казань", "revenue": 80.0},
        ],
        row_count=2,
    )
    created = datasets_api.create_dataset(payload)
    return created["id"]


def test_versions_lifecycle_flow(override_storage):
    client = TestClient(app)
    dataset_id = _create_dataset()

    first_payload = {
        "author": "qa",
        "notes": "Первый снимок",
        "rows": [
            {"id": 1, "city": "Москва", "revenue": 120},
            {"id": 2, "city": "Казань", "revenue": 80},
        ],
    }
    response = client.post(f"/api/dataset/{dataset_id}/versions", json=first_payload, headers=HEADERS)
    assert response.status_code == 200
    first_version = response.json()
    assert first_version["row_count"] == 2
    assert first_version["change_summary"]["rows_added"] == 2

    second_payload = {
        "author": "qa",
        "notes": "Обновление",
        "rows": [
            {"id": 1, "city": "Москва", "revenue": 135},
            {"id": 3, "city": "Самара", "revenue": 40},
        ],
    }
    response = client.post(f"/api/dataset/{dataset_id}/versions", json=second_payload, headers=HEADERS)
    assert response.status_code == 200
    second_version = response.json()
    assert second_version["row_count"] == 2
    assert second_version["change_summary"]["rows_added"] >= 1

    list_response = client.get(f"/api/dataset/{dataset_id}/versions", headers=HEADERS)
    assert list_response.status_code == 200
    versions = list_response.json()
    assert len(versions) == 2
    assert versions[0]["version_number"] == 2

    diff_response = client.get(
        f"/api/dataset/{dataset_id}/versions/{second_version['id']}/diff/{first_version['id']}",
        headers=HEADERS,
    )
    assert diff_response.status_code == 200
    diff = diff_response.json()
    assert diff["added_rows"]
    assert diff["removed_rows"]
    assert diff["highlights"]
    metrics_delta = diff["metrics_delta"]
    assert "revenue" in metrics_delta
    assert metrics_delta["revenue"]["sum"] != 0


def test_versions_unknown_dataset_returns_404(override_storage):
    client = TestClient(app)
    response = client.get("/api/dataset/unknown/versions", headers=HEADERS)
    assert response.status_code == 404


def test_restore_version_updates_dataset_rows(override_storage):
    client = TestClient(app)
    dataset_id = _create_dataset()

    first_payload = {
        "author": "qa",
        "notes": "Первый снимок",
        "rows": [
            {"id": 1, "city": "Москва", "revenue": 120},
            {"id": 2, "city": "Казань", "revenue": 80},
        ],
    }
    first_response = client.post(
        f"/api/dataset/{dataset_id}/versions", json=first_payload, headers=HEADERS
    )
    assert first_response.status_code == 200
    first_version = first_response.json()

    second_payload = {
        "author": "qa",
        "notes": "Вторая версия",
        "rows": [
            {"id": 1, "city": "Москва", "revenue": 140},
            {"id": 3, "city": "Самара", "revenue": 55},
        ],
    }
    second_response = client.post(
        f"/api/dataset/{dataset_id}/versions", json=second_payload, headers=HEADERS
    )
    assert second_response.status_code == 200

    restore_response = client.post(
        f"/api/dataset/{dataset_id}/versions/{first_version['id']}/restore",
        headers=HEADERS,
    )
    assert restore_response.status_code == 200
    restored_version = restore_response.json()
    assert restored_version["id"] == first_version["id"]

    dataset = datasets_api.get_dataset(dataset_id)
    assert dataset["row_count"] == len(first_payload["rows"])
    assert dataset["sample_data"] == first_payload["rows"]


def test_restore_unknown_version_returns_404(override_storage):
    client = TestClient(app)
    dataset_id = _create_dataset()

    response = client.post(
        f"/api/dataset/{dataset_id}/versions/unknown/restore", headers=HEADERS
    )
    assert response.status_code == 404


def test_dataset_segmentation_and_reprocess(override_storage):
    client = TestClient(app)
    dataset_id = _create_dataset()

    response = client.post(
        f"/api/dataset/{dataset_id}/segments",
        json={"rules": {"rows_per_segment": 1}},
        headers=HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_segments"] == 2
    assert all(segment["row_count"] == 1 for segment in data["segments"])

    list_response = client.get(f"/api/dataset/{dataset_id}/segments", headers=HEADERS)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total_segments"] == 2

    segment_id = data["segments"][0]["id"]
    reprocess = client.post(
        f"/api/dataset/{dataset_id}/segments/{segment_id}/reprocess",
        headers=HEADERS,
    )
    assert reprocess.status_code == 200
    payload = reprocess.json()["segment"]
    assert payload["status"] == "pending"
    assert payload["progress"] == 0


def test_dataset_segmentation_uses_version_rows(override_storage):
    client = TestClient(app)
    dataset_id = _create_dataset()

    version_payload = {
        "author": "etl",
        "notes": "Версия для сегментации",
        "rows": [
            {"id": 1, "city": "Москва", "revenue": 120},
            {"id": 2, "city": "Пермь", "revenue": 95},
            {"id": 3, "city": "Самара", "revenue": 60},
        ],
    }
    version_response = client.post(
        f"/api/dataset/{dataset_id}/versions", json=version_payload, headers=HEADERS
    )
    assert version_response.status_code == 200
    version_id = version_response.json()["id"]

    # dataset sample_data остаётся исходным (2 строки), используем данные версии
    rebuild = client.post(
        f"/api/dataset/{dataset_id}/segments",
        json={"version_id": version_id, "rules": {"rows_per_segment": 2}},
        headers=HEADERS,
    )
    assert rebuild.status_code == 200
    body = rebuild.json()
    assert body["version_id"] == version_id
    assert body["total_segments"] == 2
    assert body["total_rows"] == 3
    assert [segment["row_count"] for segment in body["segments"]] == [2, 1]


def test_version_lifecycle_ttl_and_restore_flow(override_storage):
    client = TestClient(app)
    dataset_id = _create_dataset()

    response = client.post(
        f"/api/dataset/{dataset_id}/versions",
        json={"author": "qa", "notes": "ttl", "rows": []},
        headers=HEADERS,
    )
    assert response.status_code == 200
    version = response.json()
    version_id = version["id"]

    configure = client.post(
        f"/api/dataset/{dataset_id}/versions/{version_id}/lifecycle/configure",
        json={"ttl_days": 0, "cold_after_days": 0},
        headers=HEADERS,
    )
    assert configure.status_code == 200
    lifecycle_state = configure.json()
    assert lifecycle_state["status"] == "active"
    assert lifecycle_state["cold_since"] is not None

    future_time = (datetime.now(tz=timezone.utc) + timedelta(hours=1)).replace(microsecond=0)
    run = client.post(
        f"/api/dataset/{dataset_id}/versions/lifecycle/run-ttl",
        json={"current_time": future_time.isoformat().replace("+00:00", "Z")},
        headers=HEADERS,
    )
    assert run.status_code == 200
    statuses = run.json()
    assert statuses
    assert any(item["status"] == "archived" for item in statuses)

    lifecycle_response = client.get(
        f"/api/dataset/{dataset_id}/versions/{version_id}/lifecycle",
        headers=HEADERS,
    )
    assert lifecycle_response.status_code == 200
    assert lifecycle_response.json()["status"] == "archived"

    restore = client.post(
        f"/api/dataset/{dataset_id}/versions/{version_id}/restore-from-archive",
        headers=HEADERS,
    )
    assert restore.status_code == 200
    assert restore.json()["status"] == "active"

    mark_access = client.post(
        f"/api/dataset/{dataset_id}/versions/{version_id}/lifecycle/mark-access",
        headers=HEADERS,
    )
    assert mark_access.status_code == 200
    assert mark_access.json()["cold_since"] is None
