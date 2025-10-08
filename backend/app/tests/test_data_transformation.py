import json

import pytest
from fastapi.testclient import TestClient

from .. import datasets_api
from .. import main

HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def isolate_dataset_store(tmp_path, monkeypatch):
    store_dir = tmp_path / "datasets"
    store_dir.mkdir()

    monkeypatch.setattr(datasets_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(datasets_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(datasets_api, "DATASETS_JSON", store_dir / "datasets.json")

    yield


@pytest.fixture(autouse=True)
def clear_file_registry():
    main.FILE_REGISTRY.clear()
    yield
    main.FILE_REGISTRY.clear()


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
