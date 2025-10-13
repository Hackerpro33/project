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


class TaskLogEntry(BaseModel):
    """Single line entry from the task lifecycle log."""

    timestamp: str = Field(..., description="ISO 8601 timestamp when the log line was recorded")
    level: str = Field(..., description="Severity level of the log entry", examples=["info", "error"])
    message: str = Field(..., description="Human readable description of the event")
    details: Dict[str, Any] = Field(
        default_factory=dict,
        description="Optional structured payload with additional information for the log entry",
    )


class TaskHistoryEntry(BaseModel):
    """Aggregated information about a background task."""

    task_id: str = Field(..., description="Identifier of the task inside the queue")
    task_type: str = Field(..., description="Domain specific task type", examples=["extraction"])
    status: str = Field(..., description="Latest known status of the task", examples=["queued", "finished"])
    created_at: str = Field(..., description="Timestamp when the task was created in ISO 8601 format")
    updated_at: str = Field(..., description="Timestamp of the latest update in ISO 8601 format")
    params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters that were supplied when the task was created",
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata captured during the task lifecycle",
    )
    log: List[TaskLogEntry] = Field(
        default_factory=list,
        description="Chronological log of significant task events",
    )
    result_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional lightweight summary of the task result when applicable",
    )
    parent_task_id: Optional[str] = Field(
        default=None,
        description="Identifier of the original task when this entry was created by retrying",
    )


class TaskHistoryListResponse(BaseModel):
    """Paginated list of task history entries."""

    items: List[TaskHistoryEntry] = Field(..., description="Sub-set of tasks matching the filters")
    count: int = Field(..., description="Total number of tasks matching the filters")
    limit: int = Field(..., description="Limit applied to the current listing")
    offset: int = Field(..., description="Offset applied to the current listing")


class DatasetPreviewResponse(BaseModel):
    """Lazy preview payload for an uploaded dataset."""

    file_id: str = Field(..., description="Identifier of the dataset used to build the preview")
    mode: Literal["page", "sample"] = Field(..., description="Preview strategy that was used")
    page: Optional[int] = Field(None, description="Requested page when ``mode`` is 'page'")
    page_size: Optional[int] = Field(None, description="Number of rows in a single page preview")
    sample_size: Optional[int] = Field(None, description="Number of rows sampled when ``mode`` is 'sample'")
    columns: List[str] = Field(default_factory=list, description="Ordered list of column names detected in the dataset")
    rows: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Preview rows serialised as dictionaries",
    )
    has_more: Optional[bool] = Field(
        None,
        description="Whether more rows are available when ``mode`` is 'page'",
    )


class ConfigExportResponse(BaseModel):
    """Configuration export payload."""

    format: Literal["json", "yaml"] = Field(..., description="Serialisation format of the export")
    content: str = Field(..., description="Configuration serialised into ``format``")
    values: Dict[str, Any] = Field(..., description="Configuration rendered as a JSON compatible dictionary")


class ConfigImportRequest(BaseModel):
    """Request body for importing configuration values."""

    format: Literal["json", "yaml"] = Field("json", description="Format of the provided configuration payload")
    content: str = Field(..., description="Configuration serialised as a string")


class ConfigImportResponse(BaseModel):
    """Response returned after applying imported configuration values."""

    format: Literal["json", "yaml"] = Field(..., description="Format that was processed")
    values: Dict[str, Any] = Field(..., description="Effective configuration stored by the backend")


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
