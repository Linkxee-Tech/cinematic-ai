# CINEMATIC AI — From Script to Screen

Full-stack AI film generation platform. Two independent folders — a Python FastAPI backend and a React frontend — that communicate over a local REST API.

```
cinematic-backend-py/   ← FastAPI + PostgreSQL + Redis + Celery + Backblaze B2  (port 8000)
cinematic-frontend/     ← React 18 + Vite + Tailwind + Zustand                  (port 5173)
```

---

## Quick Start

### 1. Start the Backend

**Prerequisites:** Python 3.11+, FFmpeg, PostgreSQL 14+, Redis 7+

```bash
cd cinematic-backend-py
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in: B2_KEY_ID, B2_APP_KEY, GMI_API_KEY, ELEVENLABS_API_KEY, REPLICATE_API_TOKEN

alembic upgrade head            # create DB tables
uvicorn app.main:app --reload --port 8000
```

In a separate terminal, start the Celery worker:

```bash
source venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info
```

**Or use Docker (recommended):**

```bash
cd cinematic-backend-py
cp .env.example .env            # fill in your API keys
docker compose up --build       # starts API + worker + PostgreSQL + Redis
```

### 2. Start the Frontend

**Prerequisites:** Node.js ≥ 18, npm ≥ 9

```bash
cd cinematic-frontend
npm install
npm run dev
# → App running at http://localhost:5173
```

Open **http://localhost:5173** in your browser.

> ⚠️ The backend must be running first — the frontend calls `http://localhost:8000` for all data.

---

## Architecture

```
cinematic-frontend/src/
├── lib/api.ts                   # Typed REST client (all endpoints)
├── store/cinematicStore.ts      # Zustand store — async actions + 500ms polling
├── pages/
│   ├── LandingPage.tsx          # Prompt entry → POST /api/projects (auto-triggers pipeline)
│   ├── PipelineDashboard.tsx    # Live step progress via WS /ws/{id} + polling fallback
│   ├── AssetGallery.tsx         # Asset grid with type filter (GET /api/projects/{id}/assets)
│   ├── ProvenanceViewer.tsx     # JSON manifest + SHA-256 lineage tree
│   ├── ExportShare.tsx          # Quality/format selection + presigned download URL
│   └── ProjectLibrary.tsx       # All projects (CRUD: rename, duplicate, delete)
└── components/
    ├── layouts/AppLayout.tsx    # Sidebar nav (desktop) + Sheet drawer (mobile)
    └── common/CinematicLogo.tsx

cinematic-backend-py/app/
├── main.py                      # FastAPI entry — CORS, logging, lifespan
├── config.py                    # Pydantic settings (reads .env)
├── database.py                  # Async SQLAlchemy engine + session
├── models.py                    # Project, PipelineRun, Asset ORM models
├── schemas.py                   # Pydantic request/response schemas
├── api/
│   ├── routes.py                # All 12 REST endpoints
│   └── websocket.py             # WS /ws/{id} — Redis pub/sub relay + heartbeat
├── pipeline/
│   ├── orchestrator.py          # 6-step Genblaze provider chain + fallbacks
│   ├── runner.py                # Coordinates steps → B2 upload → FFmpeg → manifest
│   └── manifest.py              # SHA-256 provenance manifest builder + B2 uploader
├── storage/
│   └── b2_client.py             # Backblaze B2 wrapper (upload/download/presign/delete)
├── tasks/
│   ├── celery_app.py            # Celery + Redis broker config
│   └── pipeline_tasks.py        # Async pipeline Celery task + WS progress publisher
└── utils/
    └── ffmpeg_utils.py          # compose_final_video, generate_thumbnail, upscale_frames
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Fast health check |
| `GET` | `/api/health` | Detailed health (DB + Redis + B2 latency) |
| `POST` | `/api/projects` | **Create project + auto-trigger pipeline** → `{project_id, status:"processing"}` |
| `GET` | `/api/projects` | List all projects (filter by status, paginate) |
| `GET` | `/api/projects/{id}` | Get single project |
| `PUT` | `/api/projects/{id}` | Rename / update project |
| `DELETE` | `/api/projects/{id}` | Delete project + all B2 assets |
| `POST` | `/api/projects/{id}/duplicate` | Duplicate a project |
| `POST` | `/api/projects/{id}/run` | Re-run pipeline on existing project |
| `GET` | `/api/projects/{id}/status` | Poll all 6 step statuses + overall status |
| `GET` | `/api/projects/{id}/assets` | List generated assets (filter by type) |
| `GET` | `/api/projects/{id}/manifest` | Fetch SHA-256 provenance manifest from B2 |
| `GET` | `/api/projects/{id}/export` | Get 1-hour presigned download URL for `film.mp4` |
| `WS` | `/ws/{id}` | Real-time pipeline step updates (Redis pub/sub) |

---

## Environment Variables

**Backend** (`cinematic-backend-py/.env`):

```env
B2_KEY_ID=your_b2_key_id
B2_APP_KEY=your_b2_application_key
B2_BUCKET_NAME=cinematic-ai-assets
GMI_API_KEY=your_gmi_api_key
REPLICATE_API_TOKEN=your_replicate_token
ELEVENLABS_API_KEY=your_elevenlabs_key
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/cinematic_ai
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change_me_in_production
CORS_ORIGINS=http://localhost:5173
```

**Frontend** (`cinematic-frontend/.env`):

```env
VITE_API_URL=http://localhost:8000
```

---

## AI Pipeline

When you submit a prompt, `POST /api/projects` creates the project **and immediately enqueues a Celery task** that runs 6 real AI steps:

| Step | Provider | Model | Fallback |
|------|----------|-------|---------|
| 1. Script Analysis | GMI Cloud Chat | `llama-3.2-90b` | OpenAI `gpt-4o` |
| 2. Storyboard | GMI Cloud Image | `seedream-5.0-lite` | Replicate SDXL |
| 3. Video Synthesis | GMI Cloud Video | `kling` | — |
| 4. Voiceover | ElevenLabs | `eleven_monolingual_v1` | OpenAI TTS |
| 5. Background Score | GMI Cloud Audio | `minimax` | — |
| 6. Upscaling | Replicate | `real-esrgan` | — |

After all 6 steps complete, FFmpeg composes the final `film.mp4` (with subtitle burn-in, audio ducking, crossfade transitions) and generates a thumbnail. All assets are stored in Backblaze B2 with SHA-256 checksums. A WORM-protected provenance manifest is written to B2.

---

## WebSocket Messages

Connect: `ws://localhost:8000/ws/{project_id}`

```json
{ "type": "step_update",   "step": "storyboard", "status": "running",   "progress": 42, "preview_url": null }
{ "type": "step_update",   "step": "storyboard", "status": "completed", "progress": 100, "preview_url": "https://…" }
{ "type": "pipeline_done", "status": "completed", "manifest_url": "https://…" }
{ "type": "error",         "message": "Step 'video' failed: timeout" }
{ "type": "ping" }
```

---

## B2 Storage Layout

```
users/{uid}/projects/{pid}/
  raw/
    storyboard/frame_0001.png  …
    video_clips/clip_0001.mp4  …
    audio/voiceover.mp3
    audio/score.mp3
  manifests/run_{run_id}.json      ← WORM (Object Lock)
  final/
    film.mp4
    thumbnail.jpg
```

Raw assets auto-deleted after 7 days. Manifests are Object Lock protected.

---

## Running Tests

```bash
cd cinematic-backend-py
pytest tests/ -v
```

---

## Requirements Summary

| Component | Requirement |
|-----------|-------------|
| Python | ≥ 3.11 |
| Node.js | ≥ 18 |
| FFmpeg | Latest stable |
| PostgreSQL | ≥ 14 |
| Redis | ≥ 7 |
| Docker (optional) | ≥ 24 |
