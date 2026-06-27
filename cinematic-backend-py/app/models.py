import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, Text, DateTime,
    Enum, Integer, Float, JSON, func, Index, ForeignKey
)
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


# ─── Enums ────────────────────────────────────────────────────────────────────

class ProjectStatus(str, PyEnum):
    draft = "draft"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Genre(str, PyEnum):
    sci_fi = "Sci-Fi"
    drama = "Drama"
    action = "Action"
    comedy = "Comedy"
    horror = "Horror"
    documentary = "Documentary"
    thriller = "Thriller"
    animation = "Animation"
    fantasy = "Fantasy"
    romance = "Romance"


class AssetType(str, PyEnum):
    storyboard = "storyboard"
    video_clip = "video_clip"
    voiceover = "voiceover"
    music = "music"
    final_video = "final_video"
    thumbnail = "thumbnail"
    script = "script"


class StepStatus(str, PyEnum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    skipped = "skipped"


# ─── Models ───────────────────────────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    # user_id is stored as a plain string — no FK to a users table so the
    # backend works standalone without a separate auth service.
    user_id = Column(String(36), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    prompt = Column(Text, nullable=False)
    genre = Column(Enum(Genre), nullable=False, default=Genre.sci_fi)
    status = Column(Enum(ProjectStatus), nullable=False, default=ProjectStatus.draft)
    duration = Column(String(20), nullable=True)         # e.g. "2:34"
    thumbnail_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    pipeline_runs = relationship("PipelineRun", back_populates="project", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="project", cascade="all, delete-orphan")


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    run_id = Column(String(36), unique=True, nullable=False, default=gen_uuid)
    status = Column(Enum(ProjectStatus), nullable=False, default=ProjectStatus.processing)
    manifest_b2_url = Column(Text, nullable=True)
    manifest_b2_key = Column(Text, nullable=True)
    manifest_sha256 = Column(String(64), nullable=True)
    step_statuses = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="pipeline_runs")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    run_id = Column(String(36), nullable=True)
    asset_type = Column(Enum(AssetType), nullable=False)
    pipeline_step = Column(String(50), nullable=True)
    b2_url = Column(Text, nullable=False)
    b2_key = Column(Text, nullable=False)
    sha256 = Column(String(64), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="assets")
