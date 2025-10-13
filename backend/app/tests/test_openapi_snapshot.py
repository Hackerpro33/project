import json
from pathlib import Path

from ..main import app

SNAPSHOT_PATH = Path(__file__).parent / "snapshots" / "openapi_v1.json"


def test_openapi_schema_matches_snapshot():
    schema = app.openapi()

    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    assert schema == snapshot
