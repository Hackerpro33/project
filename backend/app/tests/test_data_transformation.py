import json

import pytest
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


def test_llm_schema_parses_embedded_object(client, monkeypatch):
    _mock_llm(monkeypatch, "Ответ: {\"result\": 7, \"status\": \"ok\"}\nСпасибо")

    response = client.post(
        "/api/llm",
        json={
            "prompt": "test",
            "response_json_schema": {"type": "object"},
        },
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["result"] == 7
    assert payload["status"] == "ok"


def test_llm_schema_parses_arrays(client, monkeypatch):
    _mock_llm(monkeypatch, "Вот список:\n[ {\"value\": 1}, {\"value\": 2} ]")

    response = client.post(
        "/api/llm",
        json={
            "userQuestion": "give array",
            "response_json_schema": {"type": "array"},
        },
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload[0]["value"] == 1
