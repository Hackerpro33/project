import asyncio

import pytest
from fastapi.responses import PlainTextResponse
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from .. import main
from ..utils import files as file_utils

HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def reset_rate_limiter_and_idempotency():
    main.UPLOAD_RATE_LIMITER.reset()
    main.UPLOAD_RATE_LIMITER.limit = 1000
    main.IDEMPOTENCY_COORDINATOR.reset()
    yield
    main.UPLOAD_RATE_LIMITER.reset()
    main.UPLOAD_RATE_LIMITER.limit = 1000
    main.IDEMPOTENCY_COORDINATOR.reset()


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    data_dir = tmp_path / "data"
    upload_dir.mkdir()
    data_dir.mkdir()
    monkeypatch.setattr(main, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(main, "DATA_DIR", data_dir)
    monkeypatch.setattr(file_utils, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(file_utils, "DATA_DIR", data_dir)
    registry = {}
    monkeypatch.setattr(file_utils, "_FILE_REGISTRY", registry)
    monkeypatch.setattr(main, "FILE_REGISTRY", registry)
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def test_security_headers_and_secure_cookies(client):
    async def cookie_route():
        response = PlainTextResponse("ok")
        response.set_cookie("session", "value")
        return response

    route = main.app.router.add_api_route(
        "/tests/cookie",
        cookie_route,
        methods=["GET"],
        include_in_schema=False,
    )

    response = client.get("/healthz", headers=HEADERS)
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert "connect-src" in response.headers["content-security-policy"]
    assert response.headers["strict-transport-security"].startswith("max-age=")
    assert response.headers["x-frame-options"] == "DENY"

    cookie_response = client.get("/tests/cookie", headers=HEADERS)
    cookie_header = cookie_response.headers["set-cookie"]
    assert "Secure" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "SameSite=Lax" in cookie_header

    if route in main.app.router.routes:
        main.app.router.routes.remove(route)


def test_upload_rate_limiting(client):
    original_limit = main.UPLOAD_RATE_LIMITER.limit
    try:
        main.UPLOAD_RATE_LIMITER.limit = 2
        file_payload = ("data.csv", b"col1,col2\n1,2\n", "text/csv")
        for idx in range(2):
            response = client.post(
                "/api/upload",
                files={"file": file_payload},
                headers={**HEADERS, "Idempotency-Key": f"key-{idx}"},
            )
            assert response.status_code == 200
        third = client.post(
            "/api/upload",
            files={"file": file_payload},
            headers={**HEADERS, "Idempotency-Key": "key-2"},
        )
        assert third.status_code == 429
    finally:
        main.UPLOAD_RATE_LIMITER.limit = original_limit
        main.UPLOAD_RATE_LIMITER.reset()


def test_upload_rate_limiting_respects_forwarded_headers(client):
    original_limit = main.UPLOAD_RATE_LIMITER.limit
    try:
        main.UPLOAD_RATE_LIMITER.limit = 1
        file_payload = ("data.csv", b"col1,col2\n1,2\n", "text/csv")
        base_headers = {**HEADERS, "X-Forwarded-For": "203.0.113.1"}

        first = client.post(
            "/api/upload",
            files={"file": file_payload},
            headers={**base_headers, "Idempotency-Key": "forward-1"},
        )
        assert first.status_code == 200

        throttled = client.post(
            "/api/upload",
            files={"file": file_payload},
            headers={**base_headers, "Idempotency-Key": "forward-2"},
        )
        assert throttled.status_code == 429

        second_client = client.post(
            "/api/upload",
            files={"file": file_payload},
            headers={
                **HEADERS,
                "X-Forwarded-For": "198.51.100.8",
                "Idempotency-Key": "forward-3",
            },
        )
        assert second_client.status_code == 200
    finally:
        main.UPLOAD_RATE_LIMITER.limit = original_limit
        main.UPLOAD_RATE_LIMITER.reset()


def test_mime_sniffing_blocks_spoofed_files(client):
    payload = {
        "file": ("report.csv", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "text/csv"),
    }
    response = client.post("/api/upload", files=payload, headers={**HEADERS, "Idempotency-Key": "mime"})
    assert response.status_code == 400
    assert "signature" in response.json()["detail"].lower()


def test_idempotent_upload_reuses_cached_response(client, monkeypatch):
    tracking_calls: list[str] = []

    original_register = main.register_uploaded_file

    def tracking_register(file_id: str, path):
        tracking_calls.append(file_id)
        return original_register(file_id, path)

    monkeypatch.setattr(main, "register_uploaded_file", tracking_register)

    first_payload = {"file": ("dataset.csv", b"a,b\n1,2\n", "text/csv")}
    first = client.post(
        "/api/upload",
        files=first_payload,
        headers={**HEADERS, "Idempotency-Key": "stable"},
    )
    assert first.status_code == 200
    first_body = first.json()

    second_payload = {"file": ("dataset.csv", b"a,b\n3,4\n", "text/csv")}
    second = client.post(
        "/api/upload",
        files=second_payload,
        headers={**HEADERS, "Idempotency-Key": "stable"},
    )
    assert second.status_code == 200
    assert second.json() == first_body
    assert len(tracking_calls) == 1


@pytest.mark.anyio
@pytest.mark.parametrize("anyio_backend", ["asyncio"])
async def test_idempotent_upload_handles_concurrent_requests(monkeypatch, tmp_path, anyio_backend):
    file_bytes = b"a,b\n1,2\n"
    payload = {"file": ("table.csv", file_bytes, "text/csv")}
    headers = {**HEADERS, "Idempotency-Key": "concurrent"}

    calls: list[str] = []

    original_register = main.register_uploaded_file

    def tracking_register(file_id: str, path):
        calls.append(file_id)
        return original_register(file_id, path)

    monkeypatch.setattr(main, "register_uploaded_file", tracking_register)

    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        responses = await asyncio.gather(
            async_client.post("/api/upload", files=payload, headers=headers),
            async_client.post("/api/upload", files=payload, headers=headers),
        )

    assert all(response.status_code == 200 for response in responses)
    first_body = responses[0].json()
    second_body = responses[1].json()
    assert first_body == second_body
    assert len(list(main.UPLOAD_DIR.iterdir())) == 1
    assert len(calls) == 1
