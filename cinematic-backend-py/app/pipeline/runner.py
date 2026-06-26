"""
Pipeline runner — coordinates orchestrator, B2 uploads, and DB persistence.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Asset, AssetType, PipelineRun, Project, ProjectStatus
from app.pipeline.orchestrator import PipelineOrchestrator
from app.pipeline.manifest import build_manifest, upload_manifest
# B2 imported lazily inside functions to avoid connecting at module load time

logger = logging.getLogger("cinematic_ai.runner")


async def run_pipeline(
    project_id: str,
    user_id: str,
    prompt: str,
    genre: str,
    db: AsyncSession,
    on_step_update: Optional[Callable[[str, str, int, Optional[str]], None]] = None,
) -> dict[str, Any]:
    """
    Full pipeline execution:
    1. Create PipelineRun record
    2. Run all 6 Genblaze steps via orchestrator
    3. Upload generated assets to B2, save Asset records
    4. Build + upload provenance manifest
    5. Update Project status

    Returns manifest summary dict.
    """
    run_id = str(uuid.uuid4())
    run = PipelineRun(
        project_id=project_id,
        run_id=run_id,
        status=ProjectStatus.processing,
        step_statuses={},
    )
    db.add(run)
    await db.commit()

    orchestrator = PipelineOrchestrator()

    # Track step statuses in run record
    step_statuses: dict[str, dict] = {}

    def _on_update(step_name: str, status: str, progress: int, preview: Optional[str]) -> None:
        step_statuses[step_name] = {"status": status, "progress": progress, "preview_url": preview}
        if on_step_update:
            on_step_update(step_name, status, progress, preview)

    try:
        pipeline_result = await orchestrator.run(
            prompt=prompt,
            genre=genre,
            project_id=project_id,
            user_id=user_id,
            on_step_update=_on_update,
        )
    except RuntimeError as exc:
        run.status = ProjectStatus.failed
        run.error_message = str(exc)
        run.step_statuses = step_statuses
        await db.execute(
            Project.__table__.update()
            .where(Project.id == project_id)
            .values(status=ProjectStatus.failed)
        )
        await db.commit()
        raise

    # ── Persist output assets ──────────────────────────────────────────────────
    from app.storage.b2_client import get_b2
    b2 = get_b2()  # lazy — avoids B2 auth at module load

    assets_meta: dict[str, Any] = {}
    steps_results: dict[str, Any] = pipeline_result.get("steps_results", {})

    for step_name, result in steps_results.items():
        if result.get("status") not in ("completed", "completed_with_fallback"):
            continue
        output = result.get("output")
        if not output:
            continue

        asset_type = _step_to_asset_type(step_name)
        b2_url = _extract_url(output)
        b2_key = _url_to_key(b2_url) if b2_url else f"pipeline/{run_id}/{step_name}"

        asset = Asset(
            project_id=project_id,
            run_id=run_id,
            asset_type=asset_type,
            pipeline_step=step_name,
            b2_url=b2_url or "",
            b2_key=b2_key,
            sha256=_extract_sha256(output),
            metadata_=output if isinstance(output, dict) else {"raw": str(output)},
        )
        db.add(asset)
        assets_meta[step_name] = {"b2_url": b2_url, "b2_key": b2_key, "sha256": asset.sha256}

    await db.commit()

    # ── FFmpeg: compose final video + generate thumbnail ──────────────────────
    thumbnail_url: Optional[str] = None
    final_video_url: Optional[str] = None
    try:
        final_video_url, thumbnail_url = await _compose_and_upload(
            project_id=project_id,
            user_id=user_id,
            run_id=run_id,
            context=pipeline_result.get("context", {}),
            assets_meta=assets_meta,
            db=db,
        )
    except Exception as ffmpeg_exc:
        # Non-fatal — pipeline still succeeds without composed video
        logger.warning("[%s] FFmpeg composition failed (non-fatal): %s", project_id[:8], ffmpeg_exc)

    # ── Build + upload provenance manifest ─────────────────────────────────────
    manifest = build_manifest(
        project_id=project_id,
        run_id=run_id,
        prompt=prompt,
        genre=genre,
        steps_results=steps_results,
        assets_meta=assets_meta,
    )
    manifest_url, manifest_key, manifest_sha256 = await upload_manifest(
        manifest=manifest,
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
    )

    # ── Finalise run + project ─────────────────────────────────────────────────
    run.status = ProjectStatus.completed
    run.manifest_b2_url = manifest_url
    run.manifest_b2_key = manifest_key
    run.manifest_sha256 = manifest_sha256
    run.step_statuses = step_statuses
    run.completed_at = datetime.now(timezone.utc)

    update_vals: dict[str, Any] = {"status": ProjectStatus.completed}
    if thumbnail_url:
        update_vals["thumbnail_url"] = thumbnail_url

    await db.execute(
        Project.__table__.update()
        .where(Project.id == project_id)
        .values(**update_vals)
    )
    await db.commit()

    logger.info("Pipeline completed for project %s (run %s)", project_id[:8], run_id[:8])
    return {
        "run_id": run_id,
        "manifest_url": manifest_url,
        "manifest_sha256": manifest_sha256,
        "final_video_url": final_video_url,
        "thumbnail_url": thumbnail_url,
        "assets": assets_meta,
    }


# ─── FFmpeg composition ───────────────────────────────────────────────────────

async def _compose_and_upload(
    project_id: str,
    user_id: str,
    run_id: str,
    context: dict[str, Any],
    assets_meta: dict[str, Any],
    db: AsyncSession,
) -> tuple[Optional[str], Optional[str]]:
    """
    Download generated video clips + audio from B2, compose final film,
    generate thumbnail, re-upload both to B2.

    Returns (final_video_url, thumbnail_url).
    """
    import tempfile
    from pathlib import Path
    from app.storage.b2_client import get_b2
    from app.utils.ffmpeg_utils import compose_final_video, generate_thumbnail
    b2 = get_b2()

    tmpdir = Path(tempfile.mkdtemp(prefix="cinematic_compose_"))

    try:
        # Collect local paths for clips, voiceover, music
        clips: list[Path] = []
        voiceover: Optional[Path] = None
        music: Optional[Path] = None

        for step_name, meta in assets_meta.items():
            b2_key = meta.get("b2_key")
            if not b2_key:
                continue
            local = tmpdir / f"{step_name}_{b2_key.split('/')[-1]}"
            try:
                b2.download_file(b2_key, local)
            except Exception as e:
                logger.warning("Could not download %s for FFmpeg: %s", b2_key, e)
                continue

            if step_name in ("video", "upscale") and local.suffix in (".mp4", ".mov", ".webm"):
                clips.append(local)
            elif step_name == "voiceover":
                voiceover = local
            elif step_name == "music":
                music = local

        if not clips:
            logger.warning("[%s] No video clips available for FFmpeg — skipping composition", project_id[:8])
            return None, None

        # Compose final video
        output_video = tmpdir / "film.mp4"
        script_text = str(context.get("script", ""))
        compose_final_video(
            clips=clips,
            voiceover=voiceover,
            music=music,
            subtitle_text=script_text[:2000] if script_text else None,
            output_path=output_video,
        )

        # Generate thumbnail at t=5s
        thumb_path = tmpdir / "thumbnail.jpg"
        generate_thumbnail(output_video, thumb_path, t=5.0)

        # Upload both to B2
        video_b2_key = b2.final_video_path(user_id, project_id)
        video_url, _, video_sha = b2.upload_file(output_video, video_b2_key, "video/mp4")

        thumb_b2_key = b2.thumbnail_path(user_id, project_id)
        thumb_url, _, _ = b2.upload_file(thumb_path, thumb_b2_key, "image/jpeg")

        # Persist final_video asset to DB
        final_asset = Asset(
            project_id=project_id,
            run_id=run_id,
            asset_type=AssetType.final_video,
            pipeline_step="ffmpeg_compose",
            b2_url=video_url,
            b2_key=video_b2_key,
            sha256=video_sha,
        )
        thumb_asset = Asset(
            project_id=project_id,
            run_id=run_id,
            asset_type=AssetType.thumbnail,
            pipeline_step="ffmpeg_compose",
            b2_url=thumb_url,
            b2_key=thumb_b2_key,
        )
        db.add(final_asset)
        db.add(thumb_asset)
        await db.commit()

        logger.info("[%s] FFmpeg composition uploaded: video=%s thumb=%s", project_id[:8], video_b2_key, thumb_b2_key)
        return video_url, thumb_url

    finally:
        # Clean up temp dir
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _step_to_asset_type(step_name: str) -> AssetType:
    mapping = {
        "script":     AssetType.script,
        "storyboard": AssetType.storyboard,
        "video":      AssetType.video_clip,
        "voiceover":  AssetType.voiceover,
        "music":      AssetType.music,
        "upscale":    AssetType.final_video,
    }
    return mapping.get(step_name, AssetType.script)


def _extract_url(output: Any) -> Optional[str]:
    if isinstance(output, str) and output.startswith("http"):
        return output
    if isinstance(output, dict):
        return output.get("url") or output.get("download_url") or output.get("output")
    return None


def _url_to_key(url: str) -> str:
    """Extract B2 path from a B2 download URL."""
    if "backblazeb2.com/file/" in url:
        return url.split("/file/", 1)[-1].split("?")[0]
    return url.split("/")[-1]


def _extract_sha256(output: Any) -> Optional[str]:
    if isinstance(output, dict):
        return output.get("sha256") or output.get("checksum")
    return None
