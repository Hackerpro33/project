"""Schemas for dataset upload/extraction endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field


class ColumnPreview(BaseModel):
    """Metadata about a column detected in the uploaded dataset."""

    name: str = Field(..., description="Column name as present in the dataset", examples=["incident_date"])
    type: str = Field(
        ...,
        description="High level column data type detected by the backend",
        examples=["datetime"],
    )


class QuickExtraction(BaseModel):
    """Lightweight preview of an uploaded dataset."""

    columns: List[ColumnPreview] = Field(
        ...,
        description="Detected columns with their data types",
        examples=[[{"name": "incident_id", "type": "number"}]],
    )
    row_count: int = Field(..., description="Total number of rows detected in the dataset", examples=[1200])
    sample_data: List[Dict[str, Any]] = Field(
        ...,
        description="Sample rows extracted from the dataset for quick preview",
        examples=[[{"incident_id": 1, "offense": "Burglary", "district": "North"}]],
    )
    insights: List[str] = Field(
        default_factory=list,
        description="Domain specific insights generated for the dataset",
        examples=[["Crime indicator 'incident_id' increased by 4.00 between the first and last records."]],
    )


class FileUploadResponse(BaseModel):
    """Response returned by the dataset upload endpoint."""

    status: str = Field("success", description="Status of the upload request", examples=["success"])
    file_url: str = Field(
        ...,
        description="Internal identifier that can be used to reference the uploaded file",
        examples=["a3f1-42ab"],
    )
    filename: Optional[str] = Field(
        None,
        description="Original filename provided by the client",
        examples=["incidents.csv"],
    )
    quick_extraction: Optional[QuickExtraction] = Field(
        None,
        description="Optional quick extraction payload with structural information about the dataset",
    )


class ExtractRequest(BaseModel):
    """Request body for extracting metadata of a previously uploaded dataset."""

    file_url: str = Field(..., description="Identifier returned by the upload endpoint", examples=["a3f1-42ab"])
    json_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON schema supplied by the client to validate the dataset",
        json_schema_extra={
            "example": {
                "title": "Dataset",
                "type": "object",
                "properties": {"incident_id": {"type": "integer"}},
            }
        },
    )


class ExtractResponse(BaseModel):
    """Response returned by the dataset extraction endpoint."""

    status: str = Field("success", description="Status of the extraction request", examples=["success"])
    output: QuickExtraction = Field(..., description="Quick extraction payload for the requested dataset")


class TaskEnqueueResponse(BaseModel):
    """Response returned when a background analytics task is enqueued."""

    task_id: str = Field(..., description="Identifier of the scheduled task", examples=["rq:job:123"])
    status: Literal["queued"] = Field(
        "queued",
        description="Initial status of the task right after scheduling",
        examples=["queued"],
    )
    queue: str = Field(..., description="Name of the queue the task was submitted to", examples=["insight-analytics"])


class TaskStatusResponse(BaseModel):
    """Status payload returned for a background analytics task."""

    task_id: str = Field(..., description="Identifier of the tracked task", examples=["rq:job:123"])
    status: str = Field(
        ...,
        description="Current RQ status (queued/started/finished/failed)",
        examples=["finished"],
    )
    result: Optional[QuickExtraction] = Field(
        None,
        description="Optional quick extraction payload when the task finished successfully",
    )
    error: Optional[str] = Field(
        None,
        description="Optional traceback or message if the task failed",
        examples=["Traceback (most recent call last)..."],
    )


class EmailRequest(BaseModel):
    """Schema for email logging endpoint payload."""

    to: str = Field(..., description="Recipient email address", examples=["team@example.com"])
    subject: str = Field(..., description="Email subject", examples=["Dataset ready"])
    body: str = Field(..., description="Email body", examples=["Your dataset has been processed."])
    from_name: Optional[str] = Field(
        None,
        description="Optional friendly name that will be associated with the email",
        examples=["Insight Sphere"],
    )


class EmailResponse(BaseModel):
    """Response returned by the email logging endpoint."""

    status: str = Field("queued", description="Status of the email logging request", examples=["queued"])
    logged: bool = Field(True, description="Flag indicating that the email was appended to the audit log", examples=[True])


class ErrorResponse(BaseModel):
    """Generic error response schema."""

    detail: str = Field(..., description="Human readable error description", examples=["File too large"])


class ResumableUploadInitRequest(BaseModel):
    """Request body for initiating or resuming a chunked upload."""

    filename: str = Field(..., description="Original file name supplied by the client")
    total_size: int = Field(..., gt=0, description="Total size of the file in bytes")
    chunk_size: int = Field(..., gt=0, description="Preferred chunk size in bytes")
    checksum: Optional[str] = Field(
        None,
        description="Optional SHA-256 checksum of the full file for integrity validation",
        examples=["9c56cc51f1f3"],
    )
    upload_id: Optional[str] = Field(
        None,
        description="Existing upload identifier to resume if available",
        examples=["upload-123"],
    )


class ResumableUploadInitResponse(BaseModel):
    """Server acknowledgement for starting/resuming a chunked upload."""

    upload_id: str = Field(..., description="Identifier that subsequent chunk requests must reference")
    uploaded_chunks: List[int] = Field(
        default_factory=list,
        description="Indices of chunks that have already been persisted on the server",
    )
    chunk_size: int = Field(..., description="Chunk size that the server expects")
    total_chunks: int = Field(..., description="Total number of chunks required to upload the file")
    total_size: int = Field(..., description="Total size of the file in bytes")


class ResumableChunkAck(BaseModel):
    """Acknowledgement returned when an individual chunk is accepted."""

    status: Literal["accepted"] = Field("accepted", description="Chunk persistence status")
    chunk_index: int = Field(..., description="Index of the chunk that was stored")
    stored_checksum: str = Field(..., description="SHA-256 checksum calculated by the server")


class UrlImportRequest(BaseModel):
    """Request payload for importing a dataset from a remote object store or link."""

    url: str = Field(..., description="Direct or pre-signed URL pointing to the dataset")
    source_type: Literal["s3", "minio", "gdrive", "dropbox", "http", "https"] = Field(
        "http",
        description="Type of the remote source to improve logging and error messages",
    )
    filename: Optional[str] = Field(
        None,
        description="Optional preferred filename that will be used when storing the dataset",
    )
    headers: Optional[Dict[str, str]] = Field(
        default=None,
        description="Optional custom headers that should be passed to the remote server",
    )


class DatasetProfileColumn(BaseModel):
    """Describes quality metrics that form the dataset passport for a single column."""

    name: str = Field(..., description="Column name")
    dtype: str = Field(..., description="Detected pandas dtype for the column")
    non_nulls: int = Field(..., description="Number of non-null values")
    missing: int = Field(..., description="Number of missing values")
    missing_percent: float = Field(..., description="Share of missing values in percent")
    cardinality: int = Field(..., description="Number of unique values")
    sample_values: List[Any] = Field(default_factory=list, description="Sample of observed values")
    stats: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional numeric statistics such as min/max/mean when available",
    )


class DatasetProfileResponse(BaseModel):
    """Dataset passport that summarises structure, completeness and uniqueness."""

    row_count: int = Field(..., description="Number of rows in the dataset")
    column_count: int = Field(..., description="Number of columns in the dataset")
    columns: List[DatasetProfileColumn] = Field(..., description="Per-column quality metrics")
    warnings: List[str] = Field(default_factory=list, description="Optional textual warnings")


class DatasetProfileRequest(BaseModel):
    """Request payload for building a dataset passport."""

    file_url: str = Field(..., description="Identifier of the uploaded dataset to analyse")


class ValidationRule(BaseModel):
    """Schema and constraint definition used for dataset validation."""

    column: str = Field(..., description="Target column for the validation rule")
    required: bool = Field(False, description="Whether the column must not contain null values")
    data_type: Optional[Literal["string", "number", "integer", "boolean", "date"]] = Field(
        None,
        description="Expected logical data type for the column",
    )
    min_value: Optional[float] = Field(None, description="Minimum numeric value allowed (inclusive)")
    max_value: Optional[float] = Field(None, description="Maximum numeric value allowed (inclusive)")
    regex: Optional[str] = Field(None, description="Regular expression that textual values must satisfy")
    allowed_values: Optional[List[str]] = Field(
        default=None,
        description="Explicit whitelist of accepted values",
    )
    unique: bool = Field(False, description="Whether values in the column must be unique")


class DatasetValidationRequest(BaseModel):
    """Request payload for triggering dataset validation."""

    file_url: str = Field(..., description="Identifier of the uploaded dataset to validate")
    rules: List[ValidationRule] = Field(..., description="Validation rules to apply")


class DatasetValidationIssue(BaseModel):
    """Individual validation issue detected for a dataset."""

    column: str = Field(..., description="Column associated with the issue")
    row: Optional[int] = Field(None, description="Optional row index where the issue occurred")
    message: str = Field(..., description="Human readable description of the issue")
    severity: Literal["error", "warning"] = Field(..., description="Severity of the issue")


class DatasetValidationResponse(BaseModel):
    """Aggregated validation report."""

    status: Literal["passed", "failed"] = Field(..., description="Overall validation outcome")
    issues: List[DatasetValidationIssue] = Field(default_factory=list, description="List of detected issues")
    summary: Dict[str, Any] = Field(default_factory=dict, description="Aggregated metrics about the validation run")
