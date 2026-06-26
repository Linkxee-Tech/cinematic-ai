from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "cinematic_ai",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.pipeline_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,          # one task at a time per worker
    task_soft_time_limit=900,              # 15 min soft limit
    task_time_limit=1200,                  # 20 min hard limit
    result_expires=86400,                  # keep results 24h
    broker_connection_retry_on_startup=True,
)
