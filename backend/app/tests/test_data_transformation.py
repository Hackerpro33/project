import asyncio
import builtins
import json
from datetime import datetime

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from .. import datasets_api
from .. import visualizations_api
from .. import main

HEADERS = {"host": "localhost"}


class DummyLLMResponse:
    def __init__(self, text: str):
        self._text = text

    def raise_for_status(self):
        return None

    def json(self):
        return {"response": self._text}


class DummyLLMClient:
    def __init__(self, text: str):
        self._text = text

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        return DummyLLMResponse(self._text)


def _mock_llm(monkeypatch, text: str):
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda *args, **kwargs: DummyLLMClient(text))


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
def isolate_email_log(tmp_path, monkeypatch):
    log_path = tmp_path / "email_log.jsonl"
    monkeypatch.setattr(main, "EMAIL_LOG_PATH", log_path)
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def test_upload_and_extract_roundtrip(client):
    csv_bytes = b"city,population\nParis,2148327\nBerlin,3769495\n"
    response = client.post(
        "/api/upload",
        files={"file": ("cities.csv", csv_bytes, "text/csv")},
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["file_url"]
    assert payload["quick_extraction"]["row_count"] == 2

    extract_response = client.post(
        "/api/extract",
        json={"file_url": payload["file_url"]},
        headers=HEADERS,
    )

    assert extract_response.status_code == 200
    extracted = extract_response.json()
    assert extracted["output"]["row_count"] == 2
    assert extracted["output"]["sample_data"][0]["city"] == "Paris"


def test_extract_missing_file_returns_404(client):
    response = client.post(
        "/api/extract",
        json={"file_url": "missing"},
        headers=HEADERS,
    )
    assert response.status_code == 404


def test_dataset_create_and_list(client):
    dataset_payload = {
        "name": "Extracted Sample",
        "description": "Generated in tests",
        "tags": ["test"],
        "columns": [
            {"name": "city", "type": "string"},
            {"name": "population", "type": "number"},
        ],
        "row_count": 2,
        "sample_data": [
            {"city": "Paris", "population": 2148327},
            {"city": "Berlin", "population": 3769495},
        ],
    }

    create_response = client.post(
        "/api/dataset/create",
        data=json.dumps(dataset_payload),
        headers={"Content-Type": "application/json", **HEADERS},
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["status"] == "created"
    assert created["dataset"]["name"] == dataset_payload["name"]

    list_response = client.get(
        "/api/dataset/list",
        headers=HEADERS,
    )
    assert list_response.status_code == 200
    datasets = list_response.json()
    assert len(datasets) == 1
    assert datasets[0]["name"] == dataset_payload["name"]
    assert datasets[0]["row_count"] == 2


def test_dataset_update_and_delete(client):
    create_response = client.post(
        "/api/dataset/create",
        json={
            "name": "Initial dataset",
            "description": "Before update",
            "columns": [],
            "row_count": 0,
        },
        headers=HEADERS,
    )
    dataset_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/dataset/{dataset_id}",
        json={
            "description": "After update",
            "tags": ["updated"],
        },
        headers=HEADERS,
    )

    assert update_response.status_code == 200
    updated = update_response.json()["dataset"]
    assert updated["description"] == "After update"
    assert updated["tags"] == ["updated"]
    assert "updated_at" in updated

    delete_response = client.delete(
        f"/api/dataset/{dataset_id}",
        headers=HEADERS,
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"

    missing_response = client.get(
        f"/api/dataset/{dataset_id}",
        headers=HEADERS,
    )
    assert missing_response.status_code == 404


def test_visualization_crud_and_filter(client):
    dataset_response = client.post(
        "/api/dataset/create",
        json={
            "name": "Geo dataset",
            "columns": [],
        },
        headers=HEADERS,
    )
    dataset_id = dataset_response.json()["id"]

    create_response = client.post(
        "/api/visualization/create",
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
        "/api/visualization/list",
        headers=HEADERS,
    )
    assert list_response.status_code == 200
    all_items = list_response.json()
    assert len(all_items) == 1
    assert all_items[0]["dataset_id"] == dataset_id

    filter_response = client.post(
        "/api/visualization/filter",
        json={"filters": {"type": "map"}},
        headers=HEADERS,
    )
    assert filter_response.status_code == 200
    filtered = filter_response.json()
    assert len(filtered) == 1
    assert filtered[0]["id"] == viz_id

    get_response = client.get(
        f"/api/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert get_response.status_code == 200
    assert get_response.json()["title"] == "Map overview"

    update_response = client.put(
        f"/api/visualization/{viz_id}",
        json={"title": "Updated map", "tags": ["geo"]},
        headers=HEADERS,
    )
    assert update_response.status_code == 200
    updated = update_response.json()["visualization"]
    assert updated["title"] == "Updated map"
    assert updated["tags"] == ["geo"]

    delete_response = client.delete(
        f"/api/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert delete_response.status_code == 200

    not_found = client.get(
        f"/api/visualization/{viz_id}",
        headers=HEADERS,
    )
    assert not_found.status_code == 404


def test_send_email_logs_request(client, tmp_path):
    response = client.post(
        "/api/utils/send-email",
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


def test_detect_general_type_handles_common_series():
    assert main.detect_general_type(pd.Series([True, False])) == "boolean"
    assert main.detect_general_type(pd.Series([1, 2.5])) == "number"
    assert main.detect_general_type(pd.Series(pd.to_datetime(["2024-01-01", "2024-01-02"]))) == "datetime"
    assert main.detect_general_type(pd.Series(["a", "b"])) == "string"


def test_build_extraction_replaces_nan_values():
    df = pd.DataFrame({"num": [1, np.nan], "text": ["alpha", "beta"]})
    result = main.build_extraction(df, sample_rows=2)
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

    names_desc = [item["name"] for item in datasets_api.list_datasets()]
    assert names_desc == ["Second", "First"]

    names_asc = [item["name"] for item in datasets_api.list_datasets(order_by="created_at")]
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


def test_upload_multiple_tables_near_limit(monkeypatch, client):
    limit = 5 * 1024  # 5 KB per file
    _set_upload_limit(monkeypatch, limit)

    created_datasets = []
    for idx in range(3):
        csv_bytes = _make_wide_csv(rows=50, columns=3)
        assert len(csv_bytes) < limit

        upload_response = client.post(
            "/api/upload",
            files={"file": (f"table_{idx}.csv", csv_bytes, "text/csv")},
            headers=HEADERS,
        )
        assert upload_response.status_code == 200
        uploaded = upload_response.json()
        assert uploaded["status"] == "success"
        assert uploaded["quick_extraction"]["row_count"] == 50

        extract_response = client.post(
            "/api/extract",
            json={"file_url": uploaded["file_url"]},
            headers=HEADERS,
        )
        assert extract_response.status_code == 200
        extracted = extract_response.json()
        assert extracted["output"]["row_count"] == 50

        dataset_payload = {
            "name": f"Batch {idx}",
            "description": "Loaded for integration test",
            "tags": [f"batch-{idx}"],
            "columns": uploaded["quick_extraction"]["columns"],
            "row_count": uploaded["quick_extraction"]["row_count"],
            "sample_data": uploaded["quick_extraction"]["sample_data"],
        }

        dataset_response = client.post(
            "/api/dataset/create",
            data=json.dumps(dataset_payload),
            headers={"Content-Type": "application/json", **HEADERS},
        )
        assert dataset_response.status_code == 200
        created_datasets.append(dataset_response.json()["id"])

    list_response = client.get(
        "/api/dataset/list",
        headers=HEADERS,
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == len(created_datasets)
    names = {item["name"] for item in listed}
    assert names == {"Batch 0", "Batch 1", "Batch 2"}


def test_upload_rejects_files_over_limit(monkeypatch, client):
    limit = 1024  # 1 KB
    _set_upload_limit(monkeypatch, limit)

    csv_bytes = _make_wide_csv(rows=80, columns=5)
    assert len(csv_bytes) > limit

    response = client.post(
        "/api/upload",
        files={"file": ("too_big.csv", csv_bytes, "text/csv")},
        headers=HEADERS,
    )

    assert response.status_code == 413
    payload = response.json()
    assert "File too large" in payload["detail"]


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
        "/api/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
        headers=HEADERS,
    )
    assert response.status_code == 400


def test_api_llm_requires_prompt():
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(main.api_llm(main.LLMReq()))
    assert excinfo.value.status_code == 400


def test_api_llm_parses_json_response(monkeypatch):
    captured = {}

    class DummyResponse:
        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

        def raise_for_status(self):
            return None

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, json):
            captured["url"] = url
            captured["json"] = json
            return DummyResponse({"response": "prefix {\"answer\": 42} suffix"})

    monkeypatch.setattr(main.httpx, "AsyncClient", DummyAsyncClient)

    result = asyncio.run(
        main.api_llm(main.LLMReq(prompt="Hello", response_json_schema={"type": "object"}))
    )

    assert result == {"answer": 42}
    assert captured["url"].endswith("/api/generate")
    assert "Hello" in captured["json"]["prompt"]


def test_api_llm_returns_plain_text_when_json_missing(monkeypatch):
    _mock_llm(monkeypatch, "Answer: 42")
    result = asyncio.run(
        main.api_llm(
            main.LLMReq(prompt="Hi", response_json_schema={"type": "object"})
        )
    )
    assert result == {"response": "Answer: 42"}


def test_api_llm_returns_json_when_prompted_via_client(monkeypatch, client):
    _mock_llm(monkeypatch, '{"summary": {"rows": 10}}')
    response = client.post(
        "/api/llm",
        json={
            "prompt": "Summarize",
            "response_json_schema": {"type": "object"},
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json() == {"summary": {"rows": 10}}


def test_api_send_email_logs_errors(monkeypatch):
    def failing_open(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(builtins, "open", failing_open)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            main.api_send_email(
                main.EmailRequest(to="user@example.com", subject="Hi", body="Body")
            )
        )

    assert excinfo.value.status_code == 500


def test_extract_json_snippet_handles_nested_payload():
    text = "Ответ модели: {\"outer\": {\"inner\": [1, 2, {\"flag\": true}]}} и ещё пояснения"
    snippet = main._extract_json_snippet(text)
    assert snippet is not None
    payload = json.loads(snippet)
    assert payload == {"outer": {"inner": [1, 2, {"flag": True}]}}


def test_extract_json_snippet_returns_none_for_invalid_json():
    text = "Неверный JSON: {\"outer\": {\"inner\": ]}"
    assert main._extract_json_snippet(text) is None


def test_api_llm_includes_all_prompt_sections(monkeypatch):
    captured = {}

    class DummyResponse:
        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

        def raise_for_status(self):
            return None

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, json):
            captured["url"] = url
            captured["payload"] = json
            return DummyResponse({"response": "ok"})

    monkeypatch.setattr(main.httpx, "AsyncClient", DummyAsyncClient)

    summary = {"columns": [{"name": "value", "type": "number"}]}
    question = "Что дальше?"
    result = asyncio.run(
        main.api_llm(
            main.LLMReq(
                prompt="Привет",
                summary=summary,
                userQuestion=question,
            )
        )
    )

    assert result == {"response": "ok"}
    prompt = captured["payload"]["prompt"]
    assert "SYSTEM:\n" in prompt
    assert "ПРОМПТ:\nПривет" in prompt
    assert f"ВОПРОС:\n{question}" in prompt
    assert json.dumps(summary, ensure_ascii=False, indent=2) in prompt
    assert captured["payload"]["stream"] is False
