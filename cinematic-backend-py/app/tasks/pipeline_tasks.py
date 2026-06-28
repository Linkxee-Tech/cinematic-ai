"""
Celery pipeline task.

Runs the full Genblaze 6-step pipeline in a background worker,
publishes progress to Redis pub/sub (consumed by the WebSocket endpoint),
and persists state to PostgreSQL via synchronous SQLAlchemy.
"""

import asyncio
import logging
from typing import Any, Optional

from celery import Task
from celery.exceptions import SoftTimeLimitExceeded

from app.tasks.celery_app import celery_app
from app.config import get_settings

logger = logging.getLogger("cinematic_ai.tasks")
settings = get_settings()


class PipelineTask(Task):
    """Base class with DB session management."""

    _db_engine = None
    _SessionLocal = None

    @property
    def db_engine(self):
        if self._db_engine is None:
            from sqlalchemy import create_engine
            sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
            sync_url = sync_url.replace("ssl=require", "sslmode=require")
            self._db_engine = create_engine(sync_url, pool_pre_ping=True, pool_size=5)
        return self._db_engine

    @property
    def SessionLocal(self):
        if self._SessionLocal is None:
            from sqlalchemy.orm import sessionmaker
            self._SessionLocal = sessionmaker(bind=self.db_engine, autocommit=False, autoflush=False)
        return self._SessionLocal


@celery_app.task(
    bind=True,
    base=PipelineTask,
    name="cinematic_ai.run_pipeline",
    max_retries=3,
    default_retry_delay=10,
)
def run_pipeline_task(
    self: PipelineTask,
    project_id: str,
    user_id: str,
    prompt: str,
    genre: str,
) -> dict[str, Any]:
    """
    Execute the full AI pipeline for a project.

    Progress is published to Redis channel `pipeline:{project_id}`.
    """
    from app.api.websocket import (
        publish_pipeline_done,
        publish_pipeline_error,
        publish_step_update,
    )
    from app.models import PipelineRun, Project, ProjectStatus
    from sqlalchemy import select

    logger.info("[Task] Starting pipeline for project %s", project_id[:8])
    self.update_state(state="PROGRESS", meta={"step": "init", "progress": 0})

    db = self.SessionLocal()

    try:
        # ── Callback that publishes WS messages + updates Celery state ────────
        def on_step_update(step: str, status: str, progress: int, preview: Optional[str]) -> None:
            publish_step_update(
                redis_url=settings.redis_url,
                project_id=project_id,
                step=step,
                status=status,
                progress=progress,
                preview_url=preview,
            )
            self.update_state(
                state="PROGRESS",
                meta={"step": step, "status": status, "progress": progress},
            )
            # Persist step status into PipelineRun
            try:
                run = db.execute(
                    select(PipelineRun)
                    .where(PipelineRun.project_id == project_id)
                    .order_by(PipelineRun.started_at.desc())
                    .limit(1)
                ).scalar_one_or_none()
                if run:
                    statuses = run.step_statuses or {}
                    statuses[step] = {"status": status, "progress": progress, "preview_url": preview}
                    run.step_statuses = statuses
                    db.commit()
            except Exception as e:
                logger.warning("Could not update step status in DB: %s", e)

        # ── Run async pipeline in a fresh event loop ───────────────────────────
        result = asyncio.run(
            _run_async_pipeline(
                project_id=project_id,
                user_id=user_id,
                prompt=prompt,
                genre=genre,
                on_step_update=on_step_update,
            )
        )

        # ── Publish completion ─────────────────────────────────────────────────
        publish_pipeline_done(
            redis_url=settings.redis_url,
            project_id=project_id,
            manifest_url=result.get("manifest_url", ""),
        )

        logger.info("[Task] Pipeline completed for project %s", project_id[:8])
        return {"project_id": project_id, "status": "completed", **result}

    except SoftTimeLimitExceeded:
        msg = "Pipeline timed out (15 min limit)"
        logger.error("[Task] %s — project %s", msg, project_id[:8])
        _mark_failed(db, project_id, msg)
        publish_pipeline_error(settings.redis_url, project_id, msg)
        raise

    except Exception as exc:
        logger.error("[Task] Pipeline failed for project %s: %s", project_id[:8], exc, exc_info=True)
        _mark_failed(db, project_id, str(exc))
        publish_pipeline_error(settings.redis_url, project_id, str(exc))

        # Retry up to max_retries for transient errors
        try:
            raise self.retry(exc=exc, countdown=30)
        except self.MaxRetriesExceededError:
            logger.error("[Task] Max retries exceeded for project %s", project_id[:8])
            raise

    finally:
        db.close()


# ─── Async helper (runs in its own event loop inside the worker) ─────────────

async def _run_async_pipeline(
    project_id: str,
    user_id: str,
    prompt: str,
    genre: str,
    on_step_update,
) -> dict[str, Any]:
    """Thin async wrapper around the DB-session-aware runner."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.pipeline.runner import run_pipeline

    # Create a fresh engine bound to this specific asyncio.run() event loop
    # This prevents 'RuntimeError: Event loop is closed' on subsequent Celery runs
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
    )
    LocalSession = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with LocalSession() as db:
            return await run_pipeline(
                project_id=project_id,
                user_id=user_id,
                prompt=prompt,
                genre=genre,
                db=db,
                on_step_update=on_step_update,
            )
    finally:
        await engine.dispose()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _mark_failed(db, project_id: str, message: str) -> None:
    from app.models import PipelineRun, Project, ProjectStatus
    from sqlalchemy import select
    try:
        project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
        if project:
            project.status = ProjectStatus.failed
        run = db.execute(
            select(PipelineRun)
            .where(PipelineRun.project_id == project_id)
            .order_by(PipelineRun.started_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if run:
            run.status = ProjectStatus.failed
            run.error_message = message
        db.commit()
    except Exception as e:
        logger.error("Could not mark project %s as failed: %s", project_id[:8], e)
