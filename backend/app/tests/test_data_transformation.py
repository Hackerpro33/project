import asyncio
import builtins
import itertools
import json
from datetime import datetime, timedelta
import json
from datetime import datetime
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.routes import datasets as datasets_api
from app.api.routes import visualizations as visualizations_api
from .. import main
from ..services import extraction
from ..utils.batch_progress import (
    BatchProgressTracker,
    reset_batch_progress_tracker,
    set_batch_progress_tracker,
)
from .factories import DatasetCreateFactory

HEADERS = {"host": "localhost"}
API_PREFIX = "/api/v1"


@pytest.fixture(autouse=True)
def isolate_dataset_store(tmp_path, monkeypatch):
    store_dir = tmp_path / "datasets"
    store_dir.mkdir()

    monkeypatch.setattr(datasets_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(datasets_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(datasets_api, "DATASETS_JSON", store_dir / "datasets.json")

    yield


@pytest.fixture(autouse=True)
def isolate_visualization_store(tmp_path, monkeypatch):
    store_dir = tmp_path / "visualizations"
    store_dir.mkdir()

    monkeypatch.setattr(visualizations_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(visualizations_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(visualizations_api, "VISUALIZATIONS_JSON", store_dir / "visualizations.json")

    yield


@pytest.fixture(autouse=True)
def clear_file_registry():
    main.FILE_REGISTRY.clear()
    yield
    main.FILE_REGISTRY.clear()


@pytest.fixture(autouse=True)
def isolate_upload_dir(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(main, "UPLOAD_DIR", str(upload_dir))
    yield


@pytest.fixture(autouse=True)
def isolate_batch_tracker():
    tracker = BatchProgressTracker()
    set_batch_progress_tracker(tracker)
    yield tracker
    reset_batch_progress_tracker()


@pytest.fixture(autouse=True)
def isolate_email_log(tmp_path, monkeypatch):
    log_path = tmp_path / "email_log.jsonl"
    monkeypatch.setattr(main, "EMAIL_LOG_PATH", log_path)
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def test_upload_and_extract_roundtrip(client):
    csv_bytes = "city,population\nМосква,12615882\nКазань,1257341\n".encode("utf-8")
    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("cities.csv", csv_bytes, "text/csv")},
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["file_url"]
    assert payload["quick_extraction"]["row_count"] == 2

    extract_response = client.post(
        f"{API_PREFIX}/extract",
        json={"file_url": payload["file_url"]},
        headers=HEADERS,
    )

    assert extract_response.status_code == 200
    extracted = extract_response.json()
    assert extracted["output"]["row_count"] == 2
    assert extracted["output"]["sample_data"][0]["city"] == "Москва"


def test_batch_upload_multiple_files(client):
    files = [
        ("files", ("first.csv", b"col\n1\n", "text/csv")),
        ("files", ("second.csv", b"col\n2\n", "text/csv")),
    ]

    response = client.post(
        f"{API_PREFIX}/uploads/batch",
        files=files,
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert len(payload["items"]) == 2
    assert all(item["status"] == "success" for item in payload["items"])


def test_batch_upload_partial_failure(client):
    files = [
        ("files", ("valid.csv", b"col\n1\n", "text/csv")),
        ("files", ("bad.exe", b"binary", "application/octet-stream")),
    ]

    response = client.post(
        f"{API_PREFIX}/uploads/batch",
        files=files,
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "partial"
    statuses = {item["status"] for item in payload["items"]}
    assert statuses == {"success", "failed"}
    failed = next(item for item in payload["items"] if item["status"] == "failed")
    assert "Unsupported file extension" in failed["error"]


def test_batch_upload_progress_snapshot(client):
    files = [
        ("files", ("first.csv", b"col\n1\n", "text/csv")),
        ("files", ("second.csv", b"col\n2\n", "text/csv")),
    ]

    response = client.post(
        f"{API_PREFIX}/uploads/batch",
        files=files,
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    batch_id = payload["batch_id"]

    snapshot = client.get(
        f"{API_PREFIX}/uploads/batch/{batch_id}",
        headers=HEADERS,
    )

    assert snapshot.status_code == 200
    snapshot_payload = snapshot.json()
    assert snapshot_payload["batch_id"] == batch_id
    assert snapshot_payload["status"] == payload["status"]
    assert {item["upload_id"] for item in snapshot_payload["items"]} == {
        item["upload_id"] for item in payload["items"]
    }


def test_extract_missing_file_returns_404(client):
    response = client.post(
        f"{API_PREFIX}/extract",
        json={"file_url": "missing"},
        headers=HEADERS,
    )
    assert response.status_code == 404


def test_dataset_create_and_list(client):
    dataset_payload = DatasetCreateFactory.build().model_dump()

    create_response = client.post(
        f"{API_PREFIX}/dataset/create",
        json=dataset_payload,
        headers={"Content-Type": "application/json", **HEADERS},
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["status"] == "created"
    assert created["dataset"]["name"] == dataset_payload["name"]
    assert created["dataset"].get("auto_summary")

    list_response = client.get(
        f"{API_PREFIX}/dataset/list",
        headers=HEADERS,
    )
    assert list_response.status_code == 200
    datasets = list_response.json()
    assert len(datasets) == 1
    assert datasets[0]["name"] == dataset_payload["name"]
    assert datasets[0]["row_count"] == 2
    assert datasets[0].get("auto_summary")


def test_dataset_update_and_delete(client):
    create_response = client.post(
        f"{API_PREFIX}/dataset/create",
        json={
            "name": "Initial dataset",
            "description": "До обновления",
            "columns": [],
            "row_count": 0,
        },
        headers=HEADERS,
    )
    dataset_id = create_response.json()["id"]

    update_response = client.put(
        f"{API_PREFIX}/dataset/{dataset_id}",
        json={
            "description": "После обновления",
            "tags": ["updated"],
        },
        headers=HEADERS,
    )

    assert update_response.status_code == 200
    updated = update_response.json()["dataset"]
    assert updated["description"] == "После обновления"
    assert updated["tags"] == ["updated"]
    assert "updated_at" in updated
    assert updated.get("auto_summary")

    delete_response = client.delete(
        f"{API_PREFIX}/dataset/{dataset_id}",
        headers=HEADERS,
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"

    missing_response = client.get(
        f"{API_PREFIX}/dataset/{dataset_id}",
        headers=HEADERS,
    )
    assert missing_response.status_code == 404


def test_visualization_crud_and_filter(client):
    dataset_response = client.post(
        f"{API_PREFIX}/dataset/create",
        json={
            "name": "Geo dataset",
            "columns": [],
        },
        headers=HEADERS,
    )
    dataset_id = dataset_response.json()["id"]

    create_response = client.post(
        f"{API_PREFIX}/visualization/create",
        json={
            "title": "Map overview",
            "type": "map",
            "dataset_id": dataset_id,
            "config": {"lat_column": "lat"},
        },
        headers=HEADERS,
    )

    assert create_response.status_code == 200
    viz_payload = create_response.json()
    viz_id = viz_payload["id"]
    assert viz_payload["visualization"]["title"] == "Map overview"

    list_response = client.get(
        f"{API_PREFIX}/visualization/list",
        headers=HEADERS,
    )
    assert list_response.status_code == 200
    all_items = list_response.json()
    assert len(all_items) == 1
    assert all_items[0]["dataset_id"] == dataset_id

    filter_response = client.post(
        f"{API_PREFIX}/visualization/filter",
        json={"filters": {"type": "map"}},
        headers=HEADERS,
    )
    assert filter_response.status_code == 200
    filtered = filter_response.json()
    assert len(filtered) == 1
    assert filtered[0]["id"] == viz_id

    get_response = client.get(
        f"{API_PREFIX}/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert get_response.status_code == 200
    assert get_response.json()["title"] == "Map overview"

    update_response = client.put(
        f"{API_PREFIX}/visualization/{viz_id}",
        json={"title": "Updated map", "tags": ["geo"]},
        headers=HEADERS,
    )
    assert update_response.status_code == 200
    updated = update_response.json()["visualization"]
    assert updated["title"] == "Updated map"
    assert updated["tags"] == ["geo"]

    delete_response = client.delete(
        f"{API_PREFIX}/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert delete_response.status_code == 200

    not_found = client.get(
        f"{API_PREFIX}/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert not_found.status_code == 404


def test_send_email_logs_request(client, tmp_path):
    response = client.post(
        f"{API_PREFIX}/utils/send-email",
        json={
            "to": "user@example.com",
            "subject": "Test",
            "body": "Message",
            "from_name": "QA",
        },
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "queued"

    with open(main.EMAIL_LOG_PATH, "r", encoding="utf-8") as fh:
        lines = fh.readlines()
    assert len(lines) == 1
    logged = json.loads(lines[0])
    assert logged["to"] == "user@example.com"
    assert logged["subject"] == "Test"


def test_safe_name_normalizes_unsafe_characters():
    assert main._safe_name("report 2024?.csv") == "report_2024_.csv"


def test_read_table_bytes_parses_csv():
    csv_bytes = b"a,b\n1,2\n"
    df = main.read_table_bytes(csv_bytes, "sample.csv")
    assert df.to_dict(orient="records") == [{"a": 1, "b": 2}]


def test_read_table_bytes_parses_tsv():
    tsv_bytes = b"c\td\n3\t4\n"
    df = main.read_table_bytes(tsv_bytes, "sample.tsv")
    assert df.to_dict(orient="records") == [{"c": 3, "d": 4}]


def test_read_table_bytes_rejects_unknown_extension():
    with pytest.raises(HTTPException) as excinfo:
        main.read_table_bytes(b"", "file.txt")
    assert excinfo.value.status_code == 400


def test_read_table_bytes_parses_pdf(monkeypatch):
    from app.utils import files

    class _FakePage:
        def __init__(self, tables, text):
            self._tables = tables
            self._text = text

        def extract_tables(self):
            return self._tables

        def extract_text(self):
            return self._text

    class _FakePDF:
        def __init__(self, pages):
            self.pages = pages

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def _fake_open(_):
        tables = [[["col1", "col2"], ["1", "2"], ["3", "4"]]]
        text = "col1,col2\n1,2\n3,4"
        page = _FakePage(tables=tables, text=text)
        return _FakePDF([page])

    monkeypatch.setattr(files.pdfplumber, "open", _fake_open)

    df = main.read_table_bytes(b"%PDF", "report.pdf")
    assert df.to_dict(orient="records") == [{"col1": "1", "col2": "2"}, {"col1": "3", "col2": "4"}]


def test_read_table_bytes_parses_image(monkeypatch):
    from app.utils import files

    class _FakeImage:
        def convert(self, *_args, **_kwargs):
            return self

    monkeypatch.setattr(files.Image, "open", lambda *_: _FakeImage())
    monkeypatch.setattr(files.pytesseract, "image_to_string", lambda *_args, **_kwargs: "col1,col2\n1,2")

    df = main.read_table_bytes(b"", "table.png")
    assert df.to_dict(orient="records") == [{"col1": "1", "col2": "2"}]


def test_read_table_payload_exposes_records_and_excel(tmp_path):
    from app.utils import files

    csv_bytes = b"name,score\nAlice,95\nBob,88\n"
    payload = files.read_table_payload(csv_bytes, "scores.csv")

    assert payload.records == [
        {"name": "Alice", "score": 95},
        {"name": "Bob", "score": 88},
    ]

    excel_bytes = payload.to_excel_bytes()
    excel_path = tmp_path / "scores.xlsx"
    excel_path.write_bytes(excel_bytes)

    loaded = pd.read_excel(excel_path)
    assert loaded.to_dict(orient="records") == payload.records


def test_detect_general_type_handles_common_series():
    assert extraction.detect_general_type(pd.Series([True, False])) == "boolean"
    assert extraction.detect_general_type(pd.Series([1, 2.5])) == "number"
    assert extraction.detect_general_type(pd.Series(pd.to_datetime(["2024-01-01", "2024-01-02"]))) == "datetime"
    assert extraction.detect_general_type(pd.Series(["a", "b"])) == "string"


def test_build_extraction_replaces_nan_values():
    df = pd.DataFrame({"num": [1, np.nan], "text": ["alpha", "beta"]})
    result = extraction.build_extraction(df, sample_rows=2)
    assert result["columns"] == [
        {"name": "num", "type": "number"},
        {"name": "text", "type": "string"},
    ]
    assert result["row_count"] == 2
    assert result["sample_data"][1]["num"] == ""


def test_dataset_ensure_dates_populates_missing_fields(monkeypatch):
    timestamp = int(datetime(2024, 1, 1, 12, 0, 0).timestamp())
    monkeypatch.setattr(datasets_api.time, "time", lambda: timestamp)
    item = {"id": "1"}
    result = datasets_api._ensure_dates(item)
    assert result["created_at"] == timestamp
    assert result["created_date"].startswith("2024-01-01T12:00:00")


def test_dataset_ensure_dates_adds_updated_date():
    updated_at = int(datetime(2024, 2, 1, 0, 0, 0).timestamp())
    item = {"updated_at": updated_at}
    result = datasets_api._ensure_dates(item)
    assert result["updated_date"].startswith("2024-02-01T00:00:00")


def test_dataset_listing_respects_order(monkeypatch):
    datasets_api._save_all([])
    times = iter([100, 200])

    def _fake_time():
        return next(times)

    monkeypatch.setattr(datasets_api.time, "time", _fake_time)
    datasets_api.create_dataset(datasets_api.DatasetCreate(name="First"))
    datasets_api.create_dataset(datasets_api.DatasetCreate(name="Second"))

    names_desc = [
        item["name"] for item in datasets_api.list_datasets(page_size=10)["items"]
    ]
    assert names_desc == ["Second", "First"]

    names_asc = [
        item["name"]
        for item in datasets_api.list_datasets(order_by="created_at", page_size=10)["items"]
    ]
    assert names_asc == ["First", "Second"]


def test_dataset_update_missing_raises():
    datasets_api._save_all([])
    with pytest.raises(HTTPException) as excinfo:
        datasets_api.update_dataset("missing", datasets_api.DatasetUpdate(description="test"))
    assert excinfo.value.status_code == 404


def test_dataset_delete_missing_raises():
    datasets_api._save_all([])
    with pytest.raises(HTTPException) as excinfo:
        datasets_api.delete_dataset("missing")
    assert excinfo.value.status_code == 404


def test_dataset_search_facets_and_similarity(client):
    datasets_api._save_all([])
    first = {
        "name": "Crime incidents",
        "description": "Geospatial incident registry",
        "tags": ["crime", "safety", "geodata"],
        "columns": [{"name": "district", "type": "string"}],
        "row_count": 1200,
        "dataset_type": "geospatial",
        "owners": ["Analytics Lab"],
    }
    second = {
        "name": "Crime heatmap",
        "description": "Spatial grid for crime analysis",
        "tags": ["crime", "heatmap"],
        "columns": [{"name": "grid_id", "type": "number"}],
        "row_count": 900,
        "dataset_type": "geospatial",
        "owners": ["Analytics Lab", "Visualization"],
    }
    third = {
        "name": "Budget planning",
        "description": "Financial projections",
        "tags": ["finance"],
        "columns": [{"name": "year", "type": "number"}],
        "row_count": 50,
        "dataset_type": "financial",
        "owners": ["Finance"],
    }

    for payload in (first, second, third):
        response = client.post(
            "/api/dataset/create",
            json=payload,
            headers={"Content-Type": "application/json", **HEADERS},
        )
        assert response.status_code == 200

    search_response = client.get(
        "/api/dataset/search",
        params={"query": "crime"},
        headers=HEADERS,
    )
    assert search_response.status_code == 200
    payload = search_response.json()
    assert payload["total"] == 2
    assert payload["facets"]["tags"]
    assert any(item["value"] == "crime" for item in payload["facets"]["tags"])
    assert all(item.get("auto_summary") for item in payload["items"])

    filtered_response = client.get(
        "/api/dataset/search",
        params=[("tags", "crime"), ("owners", "Analytics Lab")],
        headers=HEADERS,
    )
    assert filtered_response.status_code == 200
    filtered = filtered_response.json()
    assert filtered["total"] == 2
    assert filtered["applied_filters"]["tags"] == ["crime"]

    datasets = client.get("/api/dataset/list", headers=HEADERS).json()
    target_id = next(item["id"] for item in datasets if item["name"] == "Crime incidents")

    similar_response = client.get(
        f"/api/dataset/{target_id}/similar",
        params={"limit": 3},
        headers=HEADERS,
    )
    assert similar_response.status_code == 200
    similar_payload = similar_response.json()
    assert similar_payload["dataset_id"] == target_id
    assert any(entry["name"] == "Crime heatmap" for entry in similar_payload["similar"])
    match = next(entry for entry in similar_payload["similar"] if entry["name"] == "Crime heatmap")
    assert match["similarity"] > 0
    assert "crime" in match.get("overlap_tags", [])


def test_dataset_search_respects_ordering(client, monkeypatch):
    datasets_api._save_all([])

    base_timestamp = 1_700_000_000
    counter = itertools.count()

    monkeypatch.setattr(
        datasets_api.time,
        "time",
        lambda: base_timestamp + next(counter),
    )

    for name in ("First dataset", "Second dataset", "Third dataset"):
        response = client.post(
            "/api/dataset/create",
            json={
                "name": name,
                "description": "",
                "columns": [],
            },
            headers={"Content-Type": "application/json", **HEADERS},
        )
        assert response.status_code == 200

    ordered_response = client.get(
        "/api/dataset/search",
        params={"order_by": "-created_at"},
        headers=HEADERS,
    )
    assert ordered_response.status_code == 200
    payload = ordered_response.json()
    assert payload["total"] == 3
    names = [item["name"] for item in payload["items"]]
    assert names == ["Third dataset", "Second dataset", "First dataset"]
    assert payload["applied_filters"]["order_by"] == "-created_at"


def test_dataset_auto_summary_endpoint(client):
    create_response = client.post(
        "/api/dataset/create",
        json={
            "name": "Fresh dataset",
            "description": "",
            "columns": [],
        },
        headers=HEADERS,
    )
    dataset_id = create_response.json()["id"]

    regenerate = client.post(
        f"/api/dataset/{dataset_id}/auto-summary",
        headers=HEADERS,
    )

    assert regenerate.status_code == 200
    summary_payload = regenerate.json()
    assert summary_payload["dataset_id"] == dataset_id
    assert isinstance(summary_payload["auto_summary"], str)
    assert summary_payload["auto_summary"]


def test_metrics_monitor_detects_anomalies(client):
    series = []
    start = datetime(2024, 1, 1)
    for index in range(6):
        timestamp = (start + timedelta(days=index)).isoformat() + "Z"
        value = 10 + index
        if index == 5:
            value = 35
        series.append({"timestamp": timestamp, "value": value})

    response = client.post(
        "/api/dataset/monitor",
        json={
            "metrics": [{"metric": "latency", "series": series}],
            "sensitivity": 1.2,
            "min_points": 5,
        },
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "critical"
    assert len(payload["results"]) == 1
    assert payload["results"][0]["metric"] == "latency"
    assert payload["results"][0]["anomalies"]
    assert payload["alerts"]


def _set_upload_limit(monkeypatch, size_bytes):
    monkeypatch.setattr(main, "MAX_UPLOAD_SIZE", size_bytes)
    if size_bytes < 1024 * 1024:
        monkeypatch.setattr(main, "MAX_UPLOAD_SIZE_MB", 1)
    else:
        monkeypatch.setattr(main, "MAX_UPLOAD_SIZE_MB", size_bytes // (1024 * 1024))


def _make_wide_csv(rows: int, columns: int) -> bytes:
    headers = [f"col{i}" for i in range(columns)]
    lines = [",".join(headers)]
    for r in range(rows):
        lines.append(",".join(f"{r}_{c}" for c in range(columns)))
    return ("\n".join(lines) + "\n").encode("utf-8")


def _criminogenic_factors_csv() -> bytes:
    data_path = Path(__file__).resolve().parent / "data" / "moscow_crime_trends.csv"
    return data_path.read_bytes()


def test_upload_multiple_tables_near_limit(monkeypatch, client):
    limit = 5 * 1024  # 5 KB per file
    _set_upload_limit(monkeypatch, limit)

    created_datasets = []
    for idx in range(3):
        csv_bytes = _make_wide_csv(rows=50, columns=3)
        assert len(csv_bytes) < limit

        upload_response = client.post(
            f"{API_PREFIX}/upload",
            files={"file": (f"table_{idx}.csv", csv_bytes, "text/csv")},
            headers=HEADERS,
        )
        assert upload_response.status_code == 200
        uploaded = upload_response.json()
        assert uploaded["status"] == "success"
        assert uploaded["quick_extraction"]["row_count"] == 50

        extract_response = client.post(
            f"{API_PREFIX}/extract",
            json={"file_url": uploaded["file_url"]},
            headers=HEADERS,
        )
        assert extract_response.status_code == 200
        extracted = extract_response.json()
        assert extracted["output"]["row_count"] == 50

        dataset_payload = {
            "name": f"Batch {idx}",
            "description": "Загружено для интеграционного теста",
            "tags": [f"batch-{idx}"],
            "columns": uploaded["quick_extraction"]["columns"],
            "row_count": uploaded["quick_extraction"]["row_count"],
            "sample_data": uploaded["quick_extraction"]["sample_data"],
        }

        dataset_response = client.post(
            f"{API_PREFIX}/dataset/create",
            json=dataset_payload,
            headers={"Content-Type": "application/json", **HEADERS},
        )
        assert dataset_response.status_code == 200
        created_datasets.append(dataset_response.json()["id"])

    list_response = client.get(
        f"{API_PREFIX}/dataset/list",
        headers=HEADERS,
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == len(created_datasets)
    names = {item["name"] for item in listed}
    assert names == {"Batch 0", "Batch 1", "Batch 2"}


def test_upload_rejects_files_over_limit(limit_upload_size, client, oversized_csv_payload):
    limit_upload_size(1024)

    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("too_big.csv", oversized_csv_payload, "text/csv")},
        headers=HEADERS,
    )

    assert response.status_code == 413
    payload = response.json()
    assert "File too large" in payload["detail"]


@pytest.mark.parametrize(
    "clamav_status,clamav_payload,expected_status,expected_detail",
    [
        (503, {"status": "error"}, 502, "ClamAV scanning service unavailable"),
        (200, {"status": "infected"}, 400, "File failed malware scan"),
    ],
)
def test_upload_clamav_failure_paths(
    monkeypatch,
    client,
    clamav_status,
    clamav_payload,
    expected_status,
    expected_detail,
    csv_bytes_factory,
    limit_upload_size,
):
    limit_upload_size(2 * 1024 * 1024)
    monkeypatch.setattr(main.settings, "clamav_scan_url", "http://clamav:3310/scan")

    class _FakeResponse:
        def __init__(self, status_code: int, payload: dict):
            self.status_code = status_code
            self._payload = payload

        def json(self) -> dict:
            return self._payload

    async def _fake_post(self, url, files):
        return _FakeResponse(clamav_status, clamav_payload)

    monkeypatch.setattr(httpx.AsyncClient, "post", _fake_post, raising=False)

    response = client.post(
        "/api/upload",
        files={"file": ("dataset.csv", csv_bytes_factory(rows=10, columns=5), "text/csv")},
        headers=HEADERS,
    )

    assert response.status_code == expected_status
    assert expected_detail in response.json()["detail"]


def test_visualization_ensure_dates_populates_fields(monkeypatch):
    timestamp = int(datetime(2023, 12, 31, 23, 59, 59).timestamp())
    monkeypatch.setattr(visualizations_api.time, "time", lambda: timestamp)
    item = {"id": "1"}
    result = visualizations_api._ensure_dates(item)
    assert result["created_at"] == timestamp
    assert result["created_date"].startswith("2023-12-31T23:59:59")


def test_visualization_list_and_filter(monkeypatch):
    visualizations_api._save_all([])
    times = iter([300, 400])

    def _fake_time():
        return next(times)

    monkeypatch.setattr(visualizations_api.time, "time", _fake_time)
    visualizations_api.create_visualization(
        visualizations_api.VisualizationCreate(title="First", type="map")
    )
    visualizations_api.create_visualization(
        visualizations_api.VisualizationCreate(title="Second", type="chart")
    )

    titles_desc = [item["title"] for item in visualizations_api.list_visualizations()]
    assert titles_desc == ["Second", "First"]

    filtered = visualizations_api.filter_visualizations(
        visualizations_api.VisualizationFilterRequest(filters={"type": "map"})
    )
    assert [item["title"] for item in filtered] == ["First"]

    filtered_ordered = visualizations_api.filter_visualizations(
        visualizations_api.VisualizationFilterRequest(filters={}, order_by="created_at")
    )
    assert [item["title"] for item in filtered_ordered] == ["First", "Second"]


def test_visualization_update_missing_raises():
    visualizations_api._save_all([])
    with pytest.raises(HTTPException) as excinfo:
        visualizations_api.update_visualization(
            "missing", visualizations_api.VisualizationUpdate(title="Updated")
        )
    assert excinfo.value.status_code == 404


def test_visualization_delete_missing_raises():
    visualizations_api._save_all([])
    with pytest.raises(HTTPException) as excinfo:
        visualizations_api.delete_visualization("missing")
    assert excinfo.value.status_code == 404


def test_visualization_get_missing_raises():
    visualizations_api._save_all([])
    with pytest.raises(HTTPException) as excinfo:
        visualizations_api.get_visualization("missing")
    assert excinfo.value.status_code == 404


def test_health_endpoint_returns_security_headers(client):
    response = client.get("/health", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_upload_rejects_empty_payload(client):
    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
        headers=HEADERS,
    )
    assert response.status_code == 400


def test_crime_factor_dataset_workflow(client):
    csv_bytes = _criminogenic_factors_csv()

    upload_response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("crime_factors.csv", csv_bytes, "text/csv")},
        headers=HEADERS,
    )
    assert upload_response.status_code == 200
    upload_payload = upload_response.json()
    extraction = upload_payload["quick_extraction"]

    assert extraction["row_count"] == 4
    assert any(col["name"] == "crime_incidents" and col["type"] == "number" for col in extraction["columns"])
    assert any(
        "crime indicator" in insight.lower() and "crime_incidents" in insight
        for insight in extraction["insights"]
    )

    extract_response = client.post(
        f"{API_PREFIX}/extract",
        json={"file_url": upload_payload["file_url"]},
        headers=HEADERS,
    )
    assert extract_response.status_code == 200
    extract_payload = extract_response.json()["output"]
    assert extract_payload["row_count"] == 4
    assert any(
        "crime indicator" in insight.lower() and "crime_incidents" in insight
        for insight in extract_payload["insights"]
    )

    dataset_response = client.post(
        f"{API_PREFIX}/dataset/create",
        json={
            "name": "Показатели преступности Москвы 2020-2023",
            "description": "Сводные годовые данные ГУ МВД по Москве.",
            "tags": ["crime-analysis", "trend"],
            "columns": extract_payload["columns"],
            "row_count": extract_payload["row_count"],
            "sample_data": extract_payload["sample_data"],
        },
        headers=HEADERS,
    )
    assert dataset_response.status_code == 200
    dataset_id = dataset_response.json()["id"]
    dataset_detail = dataset_response.json()["dataset"]
    assert dataset_detail["row_count"] == 4

    dataset_list_response = client.get(
        f"{API_PREFIX}/dataset/list",
        headers=HEADERS,
    )
    assert dataset_list_response.status_code == 200
    dataset_listing = next(
        (item for item in dataset_list_response.json() if item["id"] == dataset_id),
        None,
    )
    assert dataset_listing is not None
    assert dataset_listing["tags"] == ["crime-analysis", "trend"]

    dataset_get_response = client.get(
        f"{API_PREFIX}/dataset/{dataset_id}",
        headers=HEADERS,
    )
    assert dataset_get_response.status_code == 200
    dataset_payload = dataset_get_response.json()
    assert "ГУ МВД по Москве" in dataset_payload["description"]
    assert len(dataset_payload["sample_data"]) == 4

    update_response = client.put(
        f"{API_PREFIX}/dataset/{dataset_id}",
        json={
            "description": "Обновлено оперативной сводкой столичного управления МВД",
            "tags": ["crime-analysis", "hotspot"],
        },
        headers=HEADERS,
    )
    assert update_response.status_code == 200
    assert "hotspot" in update_response.json()["dataset"]["tags"]

    viz_response = client.post(
        f"{API_PREFIX}/visualization/create",
        json={
            "title": "Динамика преступности Москвы",
            "type": "line",
            "dataset_id": dataset_id,
            "config": {"x": "year", "y": ["crime_incidents", "theft_incidents"]},
            "tags": ["crime-analysis"],
        },
        headers=HEADERS,
    )
    assert viz_response.status_code == 200
    viz_id = viz_response.json()["id"]
    viz_detail = viz_response.json()["visualization"]
    assert viz_detail["config"]["y"] == ["crime_incidents", "theft_incidents"]

    filtered_viz = client.post(
        f"{API_PREFIX}/visualization/filter",
        json={"filters": {"type": "line"}},
        headers=HEADERS,
    )
    assert filtered_viz.status_code == 200
    assert any(item["id"] == viz_id for item in filtered_viz.json())

    viz_get_response = client.get(
        f"{API_PREFIX}/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert viz_get_response.status_code == 200
    viz_payload = viz_get_response.json()
    assert viz_payload["title"] == "Динамика преступности Москвы"

    viz_update_response = client.put(
        f"{API_PREFIX}/visualization/{viz_id}",
        json={
            "title": "Динамика преступности Москвы (обновлено)",
            "summary": {"crime_incidents": {"latest": 172360, "trend": "rising"}},
            "tags": ["crime-analysis", "report"],
        },
        headers=HEADERS,
    )
    assert viz_update_response.status_code == 200
    updated_viz = viz_update_response.json()["visualization"]
    assert updated_viz["title"].endswith("(Updated)")
    assert updated_viz["summary"]["crime_incidents"]["trend"] == "rising"
    assert "report" in updated_viz["tags"]

    viz_list_response = client.get(
        f"{API_PREFIX}/visualization/list",
        headers=HEADERS,
    )
    assert viz_list_response.status_code == 200
    assert any(item["id"] == viz_id for item in viz_list_response.json())

    viz_delete_response = client.delete(
        f"{API_PREFIX}/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert viz_delete_response.status_code == 200
    assert viz_delete_response.json()["status"] == "deleted"

    filtered_after_delete = client.post(
        f"{API_PREFIX}/visualization/filter",
        json={"filters": {"type": "line"}},
        headers=HEADERS,
    )
    assert filtered_after_delete.status_code == 200
    assert not any(item["id"] == viz_id for item in filtered_after_delete.json())

    dataset_delete_response = client.delete(
        f"{API_PREFIX}/dataset/{dataset_id}",
        headers=HEADERS,
    )
    assert dataset_delete_response.status_code == 200
    assert dataset_delete_response.json()["status"] == "deleted"

    dataset_list_after_delete = client.get(
        f"{API_PREFIX}/dataset/list",
        headers=HEADERS,
    )
    assert dataset_list_after_delete.status_code == 200
    assert not any(item["id"] == dataset_id for item in dataset_list_after_delete.json())


def test_api_send_email_logs_errors(monkeypatch):
    def failing_open(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(Path, "open", failing_open, raising=False)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            main.api_send_email(
                main.EmailRequest(to="user@example.com", subject="Hi", body="Body")
            )
        )

    assert excinfo.value.status_code == 500




