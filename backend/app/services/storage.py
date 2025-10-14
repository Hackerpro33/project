"""Storage backends for uploaded files.

This module encapsulates the logic required to persist uploaded files either on
local disk or on an S3 compatible object store (such as MinIO).  The storage
service is intentionally synchronous because uploads are already performed in
worker threads by Starlette/FastAPI.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Tuple

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException

from ..config import get_settings
from ..utils.files import FileLocation, UPLOAD_DIR, safe_filename


@dataclass
class PresignedPart:
    """Representation of a presigned multipart upload URL."""

    url: str
    headers: Dict[str, str]
    expires_in: int


class StorageService:
    """Abstraction over the configured storage backend."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.backend = self.settings.storage_backend
        if self.backend not in {"local", "s3"}:
            raise RuntimeError(f"Unsupported storage backend: {self.backend}")

        self._client = None
        if self.backend == "s3":
            if not self.settings.s3_bucket:
                raise RuntimeError("S3_BUCKET must be configured when STORAGE_BACKEND=s3")
            config = None
            if self.settings.s3_force_path_style:
                config = BotoConfig(s3={"addressing_style": "path"})
            self._client = boto3.client(
                "s3",
                region_name=self.settings.s3_region_name,
                endpoint_url=str(self.settings.s3_endpoint_url) if self.settings.s3_endpoint_url else None,
                aws_access_key_id=self.settings.s3_access_key_id,
                aws_secret_access_key=self.settings.s3_secret_access_key,
                aws_session_token=self.settings.s3_session_token,
                config=config,
            )

    # ------------------------------------------------------------------ helpers
    def _object_key(self, file_id: str, filename: str) -> str:
        prefix = self.settings.s3_key_prefix.strip("/") if self.settings.s3_key_prefix else "uploads"
        safe_name = safe_filename(filename or "file")
        return f"{prefix}/{file_id}/{safe_name}"

    def _write_local_copy(self, file_id: str, filename: str, data: bytes) -> Path:
        upload_root = Path(UPLOAD_DIR)
        upload_root.mkdir(parents=True, exist_ok=True)
        safe_name = safe_filename(filename or "file")
        path = upload_root / f"{file_id}_{safe_name}"
        with path.open("wb") as handle:
            handle.write(data)
        return path

    # ------------------------------------------------------------------ public API
    def store_bytes(self, file_id: str, filename: str, data: bytes) -> FileLocation:
        """Persist ``data`` under ``file_id`` and return the resulting location."""

        if self.backend == "s3":
            assert self._client is not None
            key = self._object_key(file_id, filename)
            try:
                self._client.put_object(Bucket=self.settings.s3_bucket, Key=key, Body=data)
            except (BotoCoreError, ClientError) as exc:  # pragma: no cover - network failures
                raise HTTPException(status_code=502, detail="Failed to persist file in object storage") from exc
            local_path = self._write_local_copy(file_id, filename, data)
            return FileLocation(storage="s3", path=str(local_path), bucket=self.settings.s3_bucket, key=key)

        local_path = self._write_local_copy(file_id, filename, data)
        return FileLocation(storage="local", path=str(local_path))

    def ensure_local_copy(self, file_id: str, location: FileLocation) -> Path:
        """Return a local filesystem path for ``location``."""

        if location.storage == "local":
            path = location.local_path()
            if not path or not path.exists():
                raise HTTPException(status_code=404, detail="File not found")
            return path

        assert self.backend == "s3"
        assert self._client is not None

        existing = location.local_path()
        if existing and existing.exists():
            return existing

        if not location.key:
            raise HTTPException(status_code=500, detail="Missing object key for S3 stored file")

        safe_name = safe_filename(Path(location.key).name)
        target = existing or Path(UPLOAD_DIR) / f"{file_id}_{safe_name}"
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with target.open("wb") as handle:
                self._client.download_fileobj(self.settings.s3_bucket, location.key, handle)
        except (BotoCoreError, ClientError) as exc:  # pragma: no cover - network failures
            raise HTTPException(status_code=502, detail="Failed to download object from storage") from exc
        return target

    # --------------- multipart / resumable uploads (S3 only) -----------------
    def create_multipart_upload(self, file_id: str, filename: str) -> Tuple[str, str]:
        """Initialise a multipart upload for ``file_id``.

        Returns the object key and the upload identifier.
        """

        if self.backend != "s3":
            raise RuntimeError("Multipart uploads are only supported for S3 storage")
        assert self._client is not None
        key = self._object_key(file_id, filename)
        try:
            response = self._client.create_multipart_upload(
                Bucket=self.settings.s3_bucket,
                Key=key,
            )
        except (BotoCoreError, ClientError) as exc:  # pragma: no cover - network failures
            raise HTTPException(status_code=502, detail="Failed to initialise multipart upload") from exc
        upload_id = response.get("UploadId")
        if not upload_id:
            raise HTTPException(status_code=502, detail="Multipart upload initialisation failed")
        return key, upload_id

    def generate_presigned_part(self, key: str, upload_id: str, part_number: int) -> PresignedPart:
        """Return a presigned URL that can upload a single part."""

        if self.backend != "s3":
            raise RuntimeError("Presigned parts are only available for S3 storage")
        assert self._client is not None
        params = {
            "Bucket": self.settings.s3_bucket,
            "Key": key,
            "UploadId": upload_id,
            "PartNumber": part_number,
        }
        try:
            url = self._client.generate_presigned_url(
                "upload_part",
                Params=params,
                ExpiresIn=self.settings.s3_upload_expiration_seconds,
                HttpMethod="PUT",
            )
        except (BotoCoreError, ClientError) as exc:  # pragma: no cover - network failures
            raise HTTPException(status_code=502, detail="Failed to generate presigned upload URL") from exc
        return PresignedPart(url=url, headers={"Content-Type": "application/octet-stream"}, expires_in=self.settings.s3_upload_expiration_seconds)

    def complete_multipart_upload(self, key: str, upload_id: str, parts: List[Dict[str, str]]) -> None:
        """Finalize a multipart upload once all parts are available."""

        if self.backend != "s3":
            raise RuntimeError("Multipart uploads are only supported for S3 storage")
        assert self._client is not None
        try:
            self._client.complete_multipart_upload(
                Bucket=self.settings.s3_bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )
        except (BotoCoreError, ClientError) as exc:  # pragma: no cover - network failures
            raise HTTPException(status_code=502, detail="Failed to finalize multipart upload") from exc

    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        if self.backend != "s3":
            return
        assert self._client is not None
        try:
            self._client.abort_multipart_upload(
                Bucket=self.settings.s3_bucket,
                Key=key,
                UploadId=upload_id,
            )
        except (BotoCoreError, ClientError):  # pragma: no cover - best effort cleanup
            return

    def fetch_completed_upload(self, file_id: str, filename: str, key: str) -> Tuple[FileLocation, bytes]:
        """Download the completed object so downstream processing can continue."""

        if self.backend != "s3":
            raise RuntimeError("Completed upload fetch is only required for S3 storage")
        assert self._client is not None
        try:
            response = self._client.get_object(Bucket=self.settings.s3_bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:  # pragma: no cover - network failures
            raise HTTPException(status_code=502, detail="Failed to download assembled object") from exc
        body = response.get("Body")
        if body is None:
            raise HTTPException(status_code=502, detail="Storage backend returned an empty response")
        data = body.read()
        local_path = self._write_local_copy(file_id, filename, data)
        return (
            FileLocation(storage="s3", path=str(local_path), bucket=self.settings.s3_bucket, key=key),
            data,
        )


@lru_cache()
def get_storage_service() -> StorageService:
    """Return the configured storage service."""

    return StorageService()


__all__ = [
    "StorageService",
    "PresignedPart",
    "get_storage_service",
]
