import pytest
from fastapi.testclient import TestClient

from .. import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    store = tmp_path / "store"
    store.mkdir()
    views_path = store / "saved_views.json"
    monkeypatch.setattr(main.views_router_module, "CANDIDATE_DIRS", [store])
    monkeypatch.setattr(main.views_router_module, "STORE_DIR", store)
    monkeypatch.setattr(main.views_router_module, "VIEWS_JSON", views_path)
    monkeypatch.setattr(main.views_router_module, "VIEWS_PATH", views_path)
    return TestClient(main.app)


def test_create_and_list_views(client):
    response = client.post(
        "/api/views",
        json={
            "name": "Недавние наборы",
            "entity": "dataset",
            "search": "crime",
            "filters": {"tags": ["analytics"]},
            "page_size": 5,
        },
        headers={"host": "localhost"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "created"
    view_id = payload["view"]["id"]

    list_response = client.get("/api/views", headers={"host": "localhost"})
    assert list_response.status_code == 200
    views = list_response.json()
    assert len(views) == 1
    assert views[0]["id"] == view_id
    assert views[0]["filters"]["tags"] == ["analytics"]


def test_update_and_delete_view(client):
    create = client.post(
        "/api/views",
        json={"name": "Charts", "entity": "visualization"},
        headers={"host": "localhost"},
    )
    view_id = create.json()["view"]["id"]

    update = client.put(
        f"/api/views/{view_id}",
        json={"name": "Dashboard charts", "search": "traffic"},
        headers={"host": "localhost"},
    )
    assert update.status_code == 200
    assert update.json()["view"]["name"] == "Dashboard charts"

    delete = client.delete(f"/api/views/{view_id}", headers={"host": "localhost"})
    assert delete.status_code == 200
    remaining = client.get("/api/views", headers={"host": "localhost"}).json()
    assert remaining == []
