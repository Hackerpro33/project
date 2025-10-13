import base64
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from .. import main
from ..tasks import process_extraction_job
from ..utils.files import get_file_registry, register_uploaded_file
from ..utils.task_history import TaskHistoryStore, reset_task_history_store, set_task_history_store


@pytest.fixture(autouse=True)
def clear_registry():
    registry = get_file_registry()
    registry.clear()
    yield
    registry.clear()


@pytest.fixture(autouse=True)
def isolated_history(tmp_path):
    store = TaskHistoryStore(tmp_path / "history.json")
    set_task_history_store(store)
    yield store
    reset_task_history_store()


@pytest.fixture
def client():
    return TestClient(main.app)


MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids "
    b"[3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] "
    b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\n"
    b"BT /F1 24 Tf 72 120 Td (Hello PDF) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 "
    b"/BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000061 00000 n \n"
    b"0000000118 00000 n \n0000000293 00000 n \n0000000380 00000 n \ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n"
    b"447\n%%EOF\n"
)


def test_process_extraction_job_generates_preview(tmp_path, isolated_history):
    csv_path = tmp_path / "incidents.csv"
    pd.DataFrame({"crime": [1, 2, 3]}).to_csv(csv_path, index=False)
    register_uploaded_file("job-1", csv_path)

    payload = process_extraction_job("job-1")

    assert payload["row_count"] == 3
    assert payload["columns"][0]["name"] == "crime"
    assert payload["insights"]


def test_task_history_listing_and_detail(client, isolated_history):
    isolated_history.record_enqueued("task-1", "extraction", params={"file_url": "file-1"})
    isolated_history.update_status(
        "task-1",
        "finished",
        message="Task finished",
        task_type="extraction",
        extra={"result_summary": {"row_count": 10, "column_count": 3}},
    )

    response = client.get("/api/tasks/history", headers={"host": "localhost"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["limit"] == 50
    assert payload["offset"] == 0
    assert payload["items"][0]["status"] == "finished"

    detail = client.get("/api/tasks/history/task-1", headers={"host": "localhost"})
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["result_summary"]["row_count"] == 10

    filtered = client.get("/api/tasks/history?status=queued", headers={"host": "localhost"}).json()
    assert filtered["count"] == 0


def test_task_retry_enqueues_new_job(monkeypatch, client, isolated_history):
    isolated_history.record_enqueued("task-1", "extraction", params={"file_url": "file-1"})

    monkeypatch.setattr(main.settings, "task_queue_enabled", True)
    monkeypatch.setattr(main, "enqueue_extraction", lambda file_url: "task-2")

    response = client.post("/api/tasks/history/task-1/retry", headers={"host": "localhost"})
    assert response.status_code == 200
    assert response.json()["task_id"] == "task-2"

    new_entry = client.get("/api/tasks/history/task-2", headers={"host": "localhost"}).json()
    assert new_entry["parent_task_id"] == "task-1"

    monkeypatch.setattr(main.settings, "task_queue_enabled", False)


def test_task_retry_without_file_reference(monkeypatch, client, isolated_history):
    isolated_history.record_enqueued("task-1", "extraction", params={})

    monkeypatch.setattr(main.settings, "task_queue_enabled", True)

    response = client.post("/api/tasks/history/task-1/retry", headers={"host": "localhost"})
    assert response.status_code == 400
    assert "file reference" in response.json()["detail"]

    monkeypatch.setattr(main.settings, "task_queue_enabled", False)


def test_dataset_preview_endpoint(client, tmp_path):
    csv_path = tmp_path / "preview.csv"
    csv_path.write_text("col_a,col_b\n1,2\n3,4\n5,6\n", encoding="utf-8")
    register_uploaded_file("preview-file", csv_path)

    response = client.get(
        "/api/upload/preview-file/preview",
        headers={"host": "localhost"},
    )


API_PREFIX = "/api/v1"


def test_extract_async_requires_queue_enabled(client):
    response = client.post(
        f"{API_PREFIX}/extract/async",
        json={"file_url": "job-unknown"},
        headers={"host": "localhost"},
        params={"page_size": 2},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "page"
    assert payload["has_more"] is True
    assert payload["rows"][0]["col_a"] == "1"

    sample_response = client.get(
        "/api/upload/preview-file/preview",
        headers={"host": "localhost"},
        params={"mode": "sample", "sample_size": 2},
    )
    assert sample_response.status_code == 200
    sample_payload = sample_response.json()
    assert sample_payload["mode"] == "sample"
    assert len(sample_payload["rows"]) == 2


def test_dataset_preview_tsv_sampling(client, tmp_path):
    tsv_path = tmp_path / "preview.tsv"
    tsv_path.write_text("col_a\tcol_b\n1\t2\n3\t4\n5\t6\n", encoding="utf-8")
    register_uploaded_file("preview-tsv", tsv_path)
def test_task_status_requires_queue_enabled(client):
    response = client.get(f"{API_PREFIX}/tasks/rq:job:123", headers={"host": "localhost"})

    response = client.get(
        "/api/upload/preview-tsv/preview",
        headers={"host": "localhost"},
        params={"mode": "sample", "sample_size": 2, "seed": 42},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "sample"
    assert payload["columns"] == ["col_a", "col_b"]
    assert all("col_a" in row and "col_b" in row for row in payload["rows"])
    assert len(payload["rows"]) == 2
    # ensure sampling returns unique combinations in TSV context
    unique_pairs = {(row["col_a"], row["col_b"]) for row in payload["rows"]}
    assert unique_pairs.issubset({("1", "2"), ("3", "4"), ("5", "6")})


def test_dataset_preview_pdf_document(client, tmp_path):
    pdf_path = tmp_path / "preview.pdf"
    pdf_path.write_bytes(MINIMAL_PDF)
    register_uploaded_file("preview-pdf", pdf_path)

    response = client.get(
        "/api/upload/preview-pdf/preview",
        headers={"host": "localhost"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_type"] == "pdf"
    assert payload["pages"]
    assert payload["pages"][0]["text"].startswith("Hello")


def test_dataset_preview_image_thumbnail(client, tmp_path):
    image_path = tmp_path / "preview.png"
    Image.new("RGB", (64, 32), color=(255, 0, 0)).save(image_path, format="PNG")
    register_uploaded_file("preview-image", image_path)

    response = client.get(
        "/api/upload/preview-image/preview",
        headers={"host": "localhost"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_type"] == "image"
    assert payload["thumbnails"]
    thumb_data = payload["thumbnails"][0]
    assert thumb_data.startswith("data:image/png;base64,")
    decoded = base64.b64decode(thumb_data.split(",", 1)[1])
    assert len(decoded) > 0
    assert payload["metadata"]["original_width"] == 64
    assert payload["metadata"]["original_height"] == 32


def test_task_history_retry_metadata(isolated_history):
    isolated_history.record_enqueued("task-1", "extraction", params={"file_url": "file-1"})

    isolated_history.record_retry(
        "task-1",
        "task-2",
        "extraction",
        params={"file_url": "file-1"},
        metadata={"note": "retry"},
    )

    new_entry = isolated_history.get("task-2")
    assert new_entry["parent_task_id"] == "task-1"
    assert new_entry["metadata"]["retry_of"] == "task-1"

    original_entry = isolated_history.get("task-1")
    retry_logs = [log for log in original_entry["log"] if "Retried as" in log["message"]]
    assert retry_logs, "Original task should capture retry log entry"


def test_task_history_csv_export(client, isolated_history):
    isolated_history.record_enqueued("task-1", "extraction", params={"file_url": "file-1"})
    isolated_history.update_status("task-1", "finished", task_type="extraction")
    isolated_history.record_enqueued("task-2", "extraction", params={"file_url": "file-2"})
    isolated_history.update_status(
        "task-2",
        "failed",
        message="Boom",
        level="error",
        task_type="extraction",
        extra={"error": "Boom"},
    )

    response = client.get("/api/tasks/history/export", headers={"host": "localhost"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    body = response.text.strip().splitlines()
    assert body[0].startswith("task_id,task_type")
    assert any("task-1" in line for line in body[1:])
    assert any("task-2" in line for line in body[1:])


def test_task_history_search_and_date_filters(monkeypatch, client, isolated_history):
    timestamps = iter(
        [
            "2024-01-01T09:00:00Z",
            "2024-01-01T10:00:00Z",
            "2024-01-01T11:00:00Z",
            "2024-01-03T09:00:00Z",
            "2024-01-03T10:00:00Z",
            "2024-01-03T11:00:00Z",
        ]
    )
    monkeypatch.setattr(TaskHistoryStore, "_timestamp", lambda self: next(timestamps))

    isolated_history.record_enqueued("task-1", "extraction", params={"file_url": "file-1"})
    isolated_history.append_log("task-1", "Первый прогон", task_type="extraction")
    isolated_history.update_status("task-1", "finished", task_type="extraction")

    isolated_history.record_enqueued("task-2", "extraction", params={"file_url": "file-2"})
    isolated_history.append_log("task-2", "Second pass", task_type="extraction")
    isolated_history.update_status("task-2", "failed", message="Crashed", level="error", task_type="extraction")

    search_response = client.get(
        "/api/tasks/history",
        headers={"host": "localhost"},
        params={"q": "second"},
    )
    assert search_response.status_code == 200
    search_payload = search_response.json()
    assert search_payload["count"] == 1
    assert search_payload["items"][0]["task_id"] == "task-2"

    date_filtered = client.get(
        "/api/tasks/history",
        headers={"host": "localhost"},
        params={"since": "2024-01-03T00:00:00Z"},
    )
    assert date_filtered.status_code == 200
    date_payload = date_filtered.json()
    assert date_payload["count"] == 1
    assert all(item["task_id"] != "task-1" for item in date_payload["items"])

    invalid = client.get(
        "/api/tasks/history",
        headers={"host": "localhost"},
        params={"since": "2024-02-01T00:00:00Z", "until": "2024-01-01T00:00:00Z"},
    )
    assert invalid.status_code == 400
