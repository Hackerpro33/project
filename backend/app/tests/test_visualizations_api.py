import json

import pytest

from .. import visualizations_api


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    store = tmp_path / "visualizations"
    store.mkdir()
    monkeypatch.setattr(visualizations_api, "CANDIDATE_DIRS", [store])
    monkeypatch.setattr(visualizations_api, "STORE_DIR", store)
    monkeypatch.setattr(
        visualizations_api,
        "VISUALIZATIONS_JSON",
        store / "visualizations.json",
    )
    yield


def test_atomic_write_json_writes_single_file(tmp_path):
    target = visualizations_api.VISUALIZATIONS_JSON
    payload = {"name": "viz"}

    visualizations_api._atomic_write_json(target, payload)

    assert target.exists()
    assert json.loads(target.read_text(encoding="utf-8")) == payload
    files = [path.name for path in target.parent.iterdir()]
    assert sorted(files) == ["visualizations.json"]
