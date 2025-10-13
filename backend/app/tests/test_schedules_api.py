from fastapi.testclient import TestClient

from app import main, schedules_api
from app.services.scheduler import TaskScheduler

API_PREFIX = "/api/v1"


def test_schedule_lifecycle(monkeypatch, tmp_path):
    client = TestClient(main.app)
    scheduler = TaskScheduler(tmp_path / "schedules.json")
    monkeypatch.setattr(schedules_api, "_scheduler", scheduler)

    payload = {
        "name": "analytics refresh",
        "task": "refresh_metrics",
        "cron": "0 9 * * 1-5",
        "sla_seconds": 600,
        "max_retries": 2,
        "payload": {"segment": "enterprise"},
    }

    response = client.post(f"{API_PREFIX}/schedules", json=payload, headers={"host": "localhost"})
    assert response.status_code == 201
    schedule = response.json()["schedule"]
    schedule_id = schedule["id"]

    listings = client.get(f"{API_PREFIX}/schedules", headers={"host": "localhost"}).json()
    assert listings["count"] == 1
    assert listings["items"][0]["id"] == schedule_id

    preview = client.get(
        f"{API_PREFIX}/schedules/{schedule_id}/preview",
        params={"count": 3},
        headers={"host": "localhost"},
    ).json()
    assert preview["count"] == 3
    assert preview["items"][0].endswith("Z")

    pause_resp = client.post(
        f"{API_PREFIX}/schedules/{schedule_id}/pause", headers={"host": "localhost"}
    )
    assert pause_resp.status_code == 200
    assert pause_resp.json()["schedule"]["status"] == "paused"

    resume_resp = client.post(
        f"{API_PREFIX}/schedules/{schedule_id}/resume", headers={"host": "localhost"}
    )
    assert resume_resp.status_code == 200
    assert resume_resp.json()["schedule"]["status"] == "pending"

    update_payload = {"cron": "30 7 * * *", "name": "daily 7:30"}
    update_resp = client.put(
        f"{API_PREFIX}/schedules/{schedule_id}",
        json=update_payload,
        headers={"host": "localhost"},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()["schedule"]
    assert updated["cron"] == "30 7 * * *"
    assert updated["name"] == "daily 7:30"

    due = client.get(f"{API_PREFIX}/schedules/due", headers={"host": "localhost"}).json()
    assert due["count"] == 0

    delete_resp = client.delete(
        f"{API_PREFIX}/schedules/{schedule_id}", headers={"host": "localhost"}
    )
    assert delete_resp.status_code == 200
    assert delete_resp.json()["id"] == schedule_id

    empty = client.get(f"{API_PREFIX}/schedules", headers={"host": "localhost"}).json()
    assert empty["count"] == 0
