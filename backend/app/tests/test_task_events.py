import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from .. import main


@pytest.fixture
def client(monkeypatch):
    original_flag = main.settings.task_queue_enabled
    original_webhook = main.settings.task_status_webhook_url
    main.settings.task_queue_enabled = True
    main.settings.task_status_webhook_url = "https://example.com/webhook"

    base_statuses = [
        {"status": "queued"},
        {"status": "started"},
        {"status": "finished", "result": {"rows": 10}},
    ]

    def _sequence(task_id: str):
        for entry in base_statuses:
            payload = dict(entry)
            payload["task_id"] = task_id
            yield payload
        finished_payload = dict(base_statuses[-1])
        finished_payload["task_id"] = task_id
        while True:
            yield dict(finished_payload)

    sequences = {}

    def _fake_get_status(task_id: str):
        generator = sequences.setdefault(task_id, _sequence(task_id))
        return next(generator)

    notifications = []

    async def _fake_notify(event: str, payload):
        notifications.append({"event": event, "payload": payload})

    monkeypatch.setattr(main, "get_task_status", _fake_get_status)
    monkeypatch.setattr(main, "_notify_task_webhook", _fake_notify)
    client = TestClient(main.app)
    client.webhook_notifications = notifications

    yield client

    main.settings.task_queue_enabled = original_flag
    main.settings.task_status_webhook_url = original_webhook


def test_task_events_streams_status_changes(client):
    with client.stream("GET", "/api/tasks/job-1/events", headers={"host": "localhost"}) as response:
        assert response.status_code == 200
        payloads = []
        for line in response.iter_lines():
            if not line:
                continue
            if line.startswith("data: "):
                data = json.loads(line.split(": ", 1)[1])
                payloads.append(data)
                if data.get("status") == "finished":
                    break

    statuses = [item.get("status") for item in payloads]
    assert statuses[:3] == ["queued", "started", "finished"]
    webhook_statuses = [event["payload"]["status"] for event in client.webhook_notifications]
    assert webhook_statuses[:3] == ["queued", "started", "finished"]


def test_task_status_endpoint_dispatches_webhook(client):
    response = client.get("/api/tasks/job-2", headers={"host": "localhost"})
    assert response.status_code == 200
    assert any(event["payload"]["task_id"] == "job-2" for event in client.webhook_notifications)


def test_notify_task_webhook_posts_payload(monkeypatch):
    captured = {}

    class DummyResponse:
        status_code = 200

    class DummyClient:
        def __init__(self, *args, **kwargs):
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json):
            captured["url"] = url
            captured["json"] = json
            return DummyResponse()

    monkeypatch.setattr(main.httpx, "AsyncClient", DummyClient)
    original_url = main.settings.task_status_webhook_url
    main.settings.task_status_webhook_url = "https://example.com/hook"

    asyncio.run(main._notify_task_webhook("status", {"task_id": "abc", "status": "queued"}))

    assert captured["url"] == "https://example.com/hook"
    assert captured["json"]["event"] == "status"
    assert captured["json"]["data"]["task_id"] == "abc"

    main.settings.task_status_webhook_url = original_url
