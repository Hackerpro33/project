import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ...main import app

PACT_PATH = Path(__file__).resolve().parents[4] / "contracts" / "pacts" / "insight-frontend-insight-backend.json"


@pytest.mark.contract
def test_send_email_contract(tmp_path, monkeypatch):
    # Redirect email log to a temporary directory so the provider state is satisfied.
    from ... import main as main_module

    log_path = tmp_path / "email-log.jsonl"
    monkeypatch.setattr(main_module, "EMAIL_LOG_PATH", log_path)

    client = TestClient(app)

    with PACT_PATH.open("r", encoding="utf-8") as fh:
        pact = json.load(fh)

    interaction = pact["interactions"][0]
    request = interaction["request"]
    response = interaction["response"]

    headers = {"Host": "localhost", **(request.get("headers") or {})}
    actual = client.request(
        method=request["method"],
        url=request["path"],
        headers=headers,
        json=request.get("body"),
    )

    assert actual.status_code == response["status"]
    assert actual.json() == response["body"]
    for header, value in response.get("headers", {}).items():
        assert actual.headers.get(header) == value

    # Ensure the provider state is satisfied (file written).
    assert log_path.exists()
