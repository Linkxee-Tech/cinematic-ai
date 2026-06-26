"""
WebSocket endpoint — streams real-time pipeline progress.

Frontend connects to:
  ws://localhost:8000/ws/{project_id}

Messages sent by server (JSON):
  { "type": "step_update",  "step": "storyboard", "status": "running",   "progress": 42, "preview_url": null }
  { "type": "step_update",  "step": "storyboard", "status": "completed", "progress": 100, "preview_url": "https://…" }
  { "type": "pipeline_done","status": "completed", "manifest_url": "…" }
  { "type": "error",        "message": "…" }
  { "type": "ping" }   ← heartbeat (server → client every 15s)
"""

import asyncio
import json
import logging
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.config import get_settings

ws_router = APIRouter()
logger = logging.getLogger("cinematic_ai.ws")
settings = get_settings()

# Channel naming: pipeline:{project_id}
def _channel(project_id: str) -> str:
    return f"pipeline:{project_id}"


@ws_router.websocket("/ws/{project_id}")
async def pipeline_ws(websocket: WebSocket, project_id: str):
    """
    Subscribe to Redis pub/sub channel for the project and relay
    messages to the connected WebSocket client.
    """
    await websocket.accept()
    logger.info("WS client connected for project %s", project_id[:8])

    rc = aioredis.from_url(settings.redis_url)
    pubsub = rc.pubsub()
    await pubsub.subscribe(_channel(project_id))

    heartbeat_task = asyncio.create_task(_heartbeat(websocket))

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            data = message["data"]
            if isinstance(data, bytes):
                data = data.decode()
            try:
                payload = json.loads(data)
                await websocket.send_json(payload)
                # Close gracefully when pipeline terminal
                if payload.get("type") in ("pipeline_done", "error"):
                    break
            except json.JSONDecodeError:
                logger.warning("Bad JSON on WS channel %s: %s", project_id[:8], data)

    except WebSocketDisconnect:
        logger.info("WS client disconnected for project %s", project_id[:8])
    except Exception as exc:
        logger.error("WS error for project %s: %s", project_id[:8], exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        heartbeat_task.cancel()
        await pubsub.unsubscribe(_channel(project_id))
        await rc.aclose()
        try:
            await websocket.close()
        except Exception:
            pass


async def _heartbeat(ws: WebSocket, interval: int = 15) -> None:
    """Send a ping every *interval* seconds to keep the connection alive."""
    try:
        while True:
            await asyncio.sleep(interval)
            await ws.send_json({"type": "ping"})
    except Exception:
        pass


# ─── Publisher helper (called from Celery tasks) ─────────────────────────────

def publish_step_update(
    redis_url: str,
    project_id: str,
    step: str,
    status: str,
    progress: int,
    preview_url: Optional[str] = None,
) -> None:
    """Synchronous publish from Celery worker (uses sync redis client)."""
    import redis as sync_redis
    rc = sync_redis.from_url(redis_url)
    payload = json.dumps({
        "type": "step_update",
        "step": step,
        "status": status,
        "progress": progress,
        "preview_url": preview_url,
    })
    rc.publish(_channel(project_id), payload)
    rc.close()


def publish_pipeline_done(redis_url: str, project_id: str, manifest_url: str) -> None:
    import redis as sync_redis
    rc = sync_redis.from_url(redis_url)
    payload = json.dumps({
        "type": "pipeline_done",
        "status": "completed",
        "manifest_url": manifest_url,
    })
    rc.publish(_channel(project_id), payload)
    rc.close()


def publish_pipeline_error(redis_url: str, project_id: str, message: str) -> None:
    import redis as sync_redis
    rc = sync_redis.from_url(redis_url)
    payload = json.dumps({"type": "error", "message": message})
    rc.publish(_channel(project_id), payload)
    rc.close()
