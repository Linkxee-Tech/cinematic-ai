from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator
from app.models import AssetType, Genre, ProjectStatus, StepStatus


# ─── Project ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    # name is optional — server auto-generates from prompt if omitted
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    prompt: str = Field(..., min_length=1, max_length=10000)
    genre: Genre = Genre.sci_fi
    duration: str = Field("medium")
    quality: str = Field("720p")
    style: str = Field("cinematic")

    @field_validator("prompt")
    @classmethod
    def prompt_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Prompt cannot be empty or whitespace.")
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[ProjectStatus] = None


class ProjectResp(BaseModel):
    id: str
    user_id: str
    name: str
    prompt: str
    genre: Genre
    status: ProjectStatus
    duration: Optional[str] = None
    target_duration: str = "medium"
    target_quality: str = "720p"
    target_style: str = "cinematic"
    thumbnail_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    asset_count: int = 0
    # Steps and assets are populated on detail fetch (GET /projects/{id})
    steps: list["StepStatusResp"] = []
    assets: list["AssetResp"] = []

    model_config = {"from_attributes": True}


class ProjectListResp(BaseModel):
    projects: list[ProjectResp]
    total: int


# ─── Pipeline ─────────────────────────────────────────────────────────────────

class StepStatusResp(BaseModel):
    name: str
    status: StepStatus
    progress: int = Field(0, ge=0, le=100)
    message: Optional[str] = None
    preview_url: Optional[str] = None


class PipelineStatusResp(BaseModel):
    project_id: str
    run_id: Optional[str]
    overall_status: ProjectStatus
    steps: list[StepStatusResp]
    error_message: Optional[str] = None


# ─── Asset ────────────────────────────────────────────────────────────────────

class AssetResp(BaseModel):
    id: str
    project_id: str
    run_id: Optional[str]
    asset_type: AssetType
    pipeline_step: Optional[str]
    b2_url: str
    sha256: Optional[str]
    file_size_bytes: Optional[int]
    duration_seconds: Optional[float]
    width: Optional[int]
    height: Optional[int]
    metadata_: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Manifest ─────────────────────────────────────────────────────────────────

class ManifestResp(BaseModel):
    project_id: str
    run_id: str
    sha256: str
    manifest_url: str
    manifest: dict[str, Any]


# ─── Export ───────────────────────────────────────────────────────────────────

class ExportResp(BaseModel):
    project_id: str
    download_url: str
    expires_in_seconds: int = 3600
    filename: str


# ─── Health ───────────────────────────────────────────────────────────────────

class ServiceHealth(BaseModel):
    status: str   # "up" | "down"
    latency_ms: Optional[float] = None


class HealthResp(BaseModel):
    status: str
    services: dict[str, ServiceHealth]
