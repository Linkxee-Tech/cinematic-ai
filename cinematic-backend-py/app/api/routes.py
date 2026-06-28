"""
All REST API routes.

Endpoints
---------
POST   /api/projects
GET    /api/projects
GET    /api/projects/{pid}
PUT    /api/projects/{pid}
DELETE /api/projects/{pid}
POST   /api/projects/{pid}/duplicate
POST   /api/projects/{pid}/run
GET    /api/projects/{pid}/status
GET    /api/projects/{pid}/assets
GET    /api/projects/{pid}/manifest
GET    /api/projects/{pid}/export
GET    /api/health
"""

import json
import logging
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Asset, AssetType, PipelineRun, Project, ProjectStatus
from app.schemas import (
    AssetResp,
    ExportResp,
    HealthResp,
    ManifestResp,
    PipelineStatusResp,
    ProjectCreate,
    ProjectListResp,
    ProjectResp,
    ProjectUpdate,
    ServiceHealth,
    StepStatusResp,
)
from app.tasks.pipeline_tasks import run_pipeline_task

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("cinematic_ai.routes")

# ── Dependency: mock user (replace with real JWT auth in production) ───────────
MOCK_USER_ID = "00000000-0000-0000-0000-000000000001"


def get_current_user_id() -> str:
    return MOCK_USER_ID


# ─── Projects ─────────────────────────────────────────────────────────────────

@router.post("/projects", response_model=dict, status_code=201, tags=["Projects"])
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """
    Create project AND immediately trigger the Celery pipeline.
    Returns {project_id, status: 'processing'} per spec.
    """
    # Auto-generate a name from the prompt if none provided
    name = body.name or _generate_name(body.prompt)

    project = Project(
        user_id=user_id,
        name=name,
        prompt=body.prompt,
        genre=body.genre,
        status=ProjectStatus.processing,
        target_duration=body.duration,
        target_quality=body.quality,
        target_style=body.style,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Enqueue Celery pipeline task immediately
    run_pipeline_task.delay(
        project_id=project.id,
        user_id=user_id,
        prompt=project.prompt,
        genre=project.genre.value,
    )

    return {"project_id": project.id, "status": "processing"}


@router.get("/projects", response_model=ProjectListResp, tags=["Projects"])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    status: Optional[ProjectStatus] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    q = select(Project).where(Project.user_id == user_id)
    if status:
        q = q.where(Project.status == status)
    q = q.order_by(Project.updated_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    projects = result.scalars().all()

    # Asset counts
    counts = {}
    if projects:
        pids = [p.id for p in projects]
        cnt_q = (
            select(Asset.project_id, func.count(Asset.id))
            .where(Asset.project_id.in_(pids))
            .group_by(Asset.project_id)
        )
        cnt_result = await db.execute(cnt_q)
        counts = dict(cnt_result.all())

    total_q = select(func.count()).select_from(Project).where(Project.user_id == user_id)
    total = (await db.execute(total_q)).scalar_one()

    return ProjectListResp(
        projects=[_project_resp(p, counts.get(p.id, 0)) for p in projects],
        total=total,
    )


@router.get("/projects/{pid}", response_model=ProjectResp, tags=["Projects"])
async def get_project(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    project = await _require_project(pid, user_id, db)
    count = await _asset_count(pid, db)
    # Include latest pipeline step statuses and assets inline
    run_q = (
        select(PipelineRun)
        .where(PipelineRun.project_id == pid)
        .order_by(PipelineRun.started_at.desc())
        .limit(1)
    )
    run = (await db.execute(run_q)).scalar_one_or_none()
    assets_q = select(Asset).where(Asset.project_id == pid).order_by(Asset.created_at)
    assets = (await db.execute(assets_q)).scalars().all()

    resp = _project_resp(project, count)
    # Attach steps from latest run
    steps: list[StepStatusResp] = []
    if run and run.step_statuses:
        for step_name, info in run.step_statuses.items():
            steps.append(StepStatusResp(
                name=step_name,
                status=info.get("status", "pending"),
                progress=info.get("progress", 0),
                message=info.get("message"),
                preview_url=info.get("preview_url"),
            ))
    resp.steps = steps
    resp.assets = assets
    return resp


@router.put("/projects/{pid}", response_model=ProjectResp, tags=["Projects"])
async def update_project(
    pid: str,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    project = await _require_project(pid, user_id, db)
    if body.name is not None:
        project.name = body.name
    if body.status is not None:
        project.status = body.status
    await db.commit()
    await db.refresh(project)
    count = await _asset_count(pid, db)
    return _project_resp(project, count)


@router.delete("/projects/{pid}", status_code=200, tags=["Projects"])
async def delete_project(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    project = await _require_project(pid, user_id, db)
    # Delete B2 assets (best-effort)
    try:
        from app.storage.b2_client import get_b2
        get_b2().delete_prefix(f"users/{user_id}/projects/{pid}/")
    except Exception as e:
        logger.warning("B2 delete failed for project %s: %s", pid[:8], e)
    await db.delete(project)
    await db.commit()
    return {"success": True}


@router.post("/projects/{pid}/duplicate", response_model=ProjectResp, status_code=201, tags=["Projects"])
async def duplicate_project(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    original = await _require_project(pid, user_id, db)
    copy = Project(
        user_id=user_id,
        name=f"{original.name} (Copy)",
        prompt=original.prompt,
        genre=original.genre,
        status=ProjectStatus.draft,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return _project_resp(copy, 0)


# ─── Pipeline ─────────────────────────────────────────────────────────────────

@router.post("/projects/{pid}/run", response_model=dict, tags=["Pipeline"])
async def run_pipeline(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    project = await _require_project(pid, user_id, db)

    if project.status == ProjectStatus.processing:
        raise HTTPException(409, detail="Pipeline in progress")

    project.status = ProjectStatus.processing
    await db.commit()

    # Enqueue Celery task
    run_pipeline_task.delay(
        project_id=pid,
        user_id=user_id,
        prompt=project.prompt,
        genre=project.genre.value,
    )

    return {"project_id": pid, "status": "processing", "message": "Pipeline started"}


@router.get("/projects/{pid}/status", response_model=PipelineStatusResp, tags=["Pipeline"])
async def get_pipeline_status(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    project = await _require_project(pid, user_id, db)

    run_q = (
        select(PipelineRun)
        .where(PipelineRun.project_id == pid)
        .order_by(PipelineRun.started_at.desc())
        .limit(1)
    )
    run = (await db.execute(run_q)).scalar_one_or_none()

    steps: list[StepStatusResp] = []
    if run and run.step_statuses:
        for step_name, info in run.step_statuses.items():
            steps.append(
                StepStatusResp(
                    name=step_name,
                    status=info.get("status", "pending"),
                    progress=info.get("progress", 0),
                    message=info.get("message"),
                    preview_url=info.get("preview_url"),
                )
            )

    return PipelineStatusResp(
        project_id=pid,
        run_id=run.run_id if run else None,
        overall_status=project.status,
        steps=steps,
        error_message=run.error_message if run else None,
    )


# ─── Assets ───────────────────────────────────────────────────────────────────

@router.get("/projects/{pid}/assets", response_model=list[AssetResp], tags=["Assets"])
async def get_assets(
    pid: str,
    asset_type: Optional[AssetType] = Query(None),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    await _require_project(pid, user_id, db)
    q = select(Asset).where(Asset.project_id == pid)
    if asset_type:
        q = q.where(Asset.asset_type == asset_type)
    q = q.order_by(Asset.created_at)
    result = await db.execute(q)
    return result.scalars().all()


# ─── Manifest ─────────────────────────────────────────────────────────────────

@router.get("/projects/{pid}/manifest", response_model=ManifestResp, tags=["Provenance"])
async def get_manifest(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    await _require_project(pid, user_id, db)

    run_q = (
        select(PipelineRun)
        .where(PipelineRun.project_id == pid, PipelineRun.manifest_b2_key != None)
        .order_by(PipelineRun.started_at.desc())
        .limit(1)
    )
    run = (await db.execute(run_q)).scalar_one_or_none()
    if not run:
        raise HTTPException(404, detail="No completed pipeline run with manifest found.")

    # Download manifest JSON from B2
    try:
        import tempfile
        from pathlib import Path
        from app.storage.b2_client import get_b2
        b2 = get_b2()
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            tmp = Path(f.name)
        b2.download_file(run.manifest_b2_key, tmp)
        manifest_data = json.loads(tmp.read_text(encoding="utf-8"))
        tmp.unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to fetch manifest: {e}")

    return ManifestResp(
        project_id=pid,
        run_id=run.run_id,
        sha256=run.manifest_sha256 or "",
        manifest_url=run.manifest_b2_url or "",
        manifest=manifest_data,
    )


# ─── Export ───────────────────────────────────────────────────────────────────

@router.get("/projects/{pid}/export", response_model=ExportResp, tags=["Export"])
async def export_project(
    pid: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    project = await _require_project(pid, user_id, db)
    if project.status != ProjectStatus.completed:
        raise HTTPException(400, detail="Project pipeline must be completed before export.")

    from app.storage.b2_client import get_b2
    b2 = get_b2()
    b2_key = b2.final_video_path(user_id, pid)
    try:
        url = b2.generate_presigned_url(b2_key, expires=3600)
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to generate export URL: {e}")

    return ExportResp(
        project_id=pid,
        download_url=url,
        expires_in_seconds=3600,
        filename=f"{project.name.replace(' ', '_')}_final.mp4",
    )


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResp, tags=["Health"])
async def detailed_health(db: AsyncSession = Depends(get_db)):
    services: dict[str, ServiceHealth] = {}

    # DB
    t0 = time.perf_counter()
    try:
        await db.execute(select(func.now()))
        services["db"] = ServiceHealth(status="up", latency_ms=round((time.perf_counter() - t0) * 1000, 1))
    except Exception:
        services["db"] = ServiceHealth(status="down")

    # Redis
    t0 = time.perf_counter()
    redis_error = None
    try:
        rc = aioredis.from_url(settings.redis_url)
        await rc.ping()
        await rc.aclose()
        services["redis"] = ServiceHealth(status="up", latency_ms=round((time.perf_counter() - t0) * 1000, 1))
    except Exception as e:
        redis_error = str(e)
        services["redis"] = ServiceHealth(status=f"down ({redis_error})")

    # B2
    t0 = time.perf_counter()
    try:
        from app.storage.b2_client import get_b2
        get_b2()._bucket.get_download_url("health-check")
        services["b2"] = ServiceHealth(status="up", latency_ms=round((time.perf_counter() - t0) * 1000, 1))
    except Exception:
        services["b2"] = ServiceHealth(status="down")

    overall = "ok" if all(s.status == "up" for s in services.values()) else "degraded"
    return HealthResp(status=overall, services=services)


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _require_project(pid: str, user_id: str, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found.")
    return project


async def _asset_count(pid: str, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(Asset.id)).where(Asset.project_id == pid)
    )
    return result.scalar_one()


def _project_resp(project: Project, asset_count: int) -> ProjectResp:
    return ProjectResp(
        id=project.id,
        user_id=project.user_id,
        name=project.name,
        prompt=project.prompt,
        genre=project.genre,
        status=project.status,
        duration=project.duration,
        target_duration=project.target_duration,
        target_quality=project.target_quality,
        target_style=project.target_style,
        thumbnail_url=project.thumbnail_url,
        created_at=project.created_at,
        updated_at=project.updated_at,
        asset_count=asset_count,
    )


def _generate_name(prompt: str) -> str:
    """Auto-generate a project name from the first ~45 chars of the prompt."""
    words = prompt.strip().split()
    title = " ".join(words[:7])
    if len(title) > 45:
        title = title[:45].rsplit(" ", 1)[0]
    return title.title() or "Untitled Project"
