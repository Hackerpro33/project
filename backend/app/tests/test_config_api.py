import json

import pytest
import yaml
from fastapi.testclient import TestClient

from .. import config, main


@pytest.fixture
def client(tmp_path, monkeypatch):
    overrides_path = tmp_path / "config_overrides.json"
    monkeypatch.setattr(config, "CONFIG_OVERRIDES_PATH", overrides_path, raising=False)
    config.get_settings.cache_clear()
    main.settings = config.get_settings()
    client = TestClient(main.app)
    yield client
    config.get_settings.cache_clear()
    main.settings = config.get_settings()


def test_config_export_and_import_json_yaml(client):
    export = client.get("/api/config/export", headers={"host": "localhost"})
    assert export.status_code == 200
    payload = export.json()
    assert payload["format"] == "json"
    assert "values" in payload

    updated = dict(payload["values"])
    updated["max_upload_size_mb"] = 5

    yaml_payload = yaml.safe_dump(updated)
    import_response = client.post(
        "/api/config/import",
        headers={"host": "localhost"},
        json={"format": "yaml", "content": yaml_payload},
    )
    assert import_response.status_code == 200
    import_body = import_response.json()
    assert import_body["values"]["max_upload_size_mb"] == 5

    export_yaml = client.get(
        "/api/config/export",
        headers={"host": "localhost"},
        params={"format": "yaml"},
    )
    assert export_yaml.status_code == 200
    assert "max_upload_size_mb: 5" in export_yaml.json()["content"]
