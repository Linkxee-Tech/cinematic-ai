# CINEMATIC AI — Python Backend

Production-ready FastAPI backend for the CINEMATIC AI film generation platform.

**Stack:** FastAPI · PostgreSQL · Redis · Celery · Backblaze B2 · Genblaze AI · FFmpeg

---

## Quick Start (Docker — recommended)

```bash
cp .env.example .env
# Fill in B2_KEY_ID, B2_APP_KEY, GMI_API_KEY, ELEVENLABS_API_KEY, REPLICATE_API_TOKEN

docker compose up --build
```

Services started:
| Service | URL |
|---------|-----|
| API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Health check | http://localhost:8000/health |

---

## Quick Start (Local)

### Prerequisites
- Python 3.11+
- FFmpeg (`brew install ffmpeg` / `apt install ffmpeg`)
- PostgreSQL 14+
- Redis 7+

### Setup

```bash
# 1. Create virtualenv
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your real credentials

# 4. Run DB migrations
alembic upgrade head

# 5. Start API server
uvicorn app.main:app --reload --port 8000

# 6. Start Celery worker (separate terminal)
celery -A app.tasks.celery_app worker --loglevel=info
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `B2_KEY_ID` | Backblaze B2 application key ID |
| `B2_APP_KEY` | Backblaze B2 application key |
| `B2_BUCKET_NAME` | B2 bucket name (default: `cinematic-ai-assets`) |
| `GMI_API_KEY` | GMI Cloud / Genblaze API key |
| `REPLICATE_API_TOKEN` | Replicate API token (upscaling) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (voiceover) |
| `DATABASE_URL` | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `REDIS_URL` | Redis URL (`redis://localhost:6379/0`) |
| `SECRET_KEY` | Random secret for JWT signing |
| `CORS_ORIGINS` | Comma-separated allowed origins |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Fast health check |
| `GET` | `/api/health` | Detailed health (DB + Redis + B2) |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects` | List projects |
| `GET` | `/api/projects/{id}` | Get project |
| `PUT` | `/api/projects/{id}` | Rename / update project |
| `DELETE` | `/api/projects/{id}` | Delete project + all B2 assets |
| `POST` | `/api/projects/{id}/duplicate` | Duplicate project |
| `POST` | `/api/projects/{id}/run` | Start pipeline (enqueues Celery task) |
| `GET` | `/api/projects/{id}/status` | Poll pipeline step statuses |
| `GET` | `/api/projects/{id}/assets` | List generated assets |
| `GET` | `/api/projects/{id}/manifest` | Fetch provenance manifest |
| `GET` | `/api/projects/{id}/export` | Get presigned download URL |
| `WS` | `/ws/{id}` | WebSocket — real-time pipeline updates |

---

## Pipeline Steps

| # | Step | Provider | Model |
|---|------|----------|-------|
| 1 | Script Analysis | GMI Cloud Chat | `llama-3.2-90b` |
| 2 | Storyboard Generation | GMI Cloud Image | `seedream-5.0-lite` |
| 3 | Video Synthesis | GMI Cloud Video | `kling` |
| 4 | Voiceover | ElevenLabs | `eleven_monolingual_v1` |
| 5 | Background Score | GMI Cloud Audio | `minimax` |
| 6 | Upscaling | Replicate | `real-esrgan` |

Each step has a fallback provider (OpenAI for script, Replicate for storyboard, OpenAI TTS for voiceover).

---

## B2 Storage Layout

```
users/{uid}/projects/{pid}/
  raw/
    storyboard/frame_0001.png  …
    video_clips/clip_0001.mp4  …
    audio/voiceover.mp3
    audio/score.mp3
  manifests/run_{run_id}.json   ← WORM (Object Lock)
  final/
    film.mp4
    thumbnail.jpg
```

Raw assets auto-deleted after 7 days via B2 lifecycle rules.
Manifests are Object Lock protected (WORM).

---

## WebSocket Protocol

Connect: `ws://localhost:8000/ws/{project_id}`

Messages received:
```json
{ "type": "step_update",   "step": "storyboard", "status": "running",   "progress": 42 }
{ "type": "step_update",   "step": "storyboard", "status": "completed", "progress": 100, "preview_url": "https://…" }
{ "type": "pipeline_done", "status": "completed", "manifest_url": "https://…" }
{ "type": "error",         "message": "Step 'video' failed: …" }
{ "type": "ping" }
```

---

## Running Tests

```bash
pytest tests/ -v
```

---

## DB Migrations

```bash
# Create new migration after model changes
alembic revision --autogenerate -m "describe_change"

# Apply migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

---

## Production Deployment

```bash
# Build + push Docker image
docker build -t cinematic-ai-backend .
docker push your-registry/cinematic-ai-backend

# On server:
docker compose -f docker-compose.yml up -d
```

Supports deployment to **Render**, **Fly.io**, **Railway**, or **AWS ECS**.
