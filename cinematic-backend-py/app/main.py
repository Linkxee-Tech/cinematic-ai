import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.database import init_db
from app.api.routes import router as api_router
from app.api.websocket import ws_router

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("cinematic_ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Cinematic AI backend…")
    await init_db()
    logger.info("Database initialised")
    yield
    logger.info("Shutting down…")


app = FastAPI(
    title="Cinematic AI",
    description="AI-powered film generation platform — FastAPI backend",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request logging middleware ───────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = round((time.perf_counter() - start) * 1000, 1)
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({ms}ms)")
    return response


# ─── Global exception handler ─────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    
    # Try to grab the origin from the request to inject it back into the response
    origin = request.headers.get("origin")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        
    return JSONResponse(
        status_code=500, 
        content={"detail": "Internal server error. Ensure Redis and DB are running."},
        headers=headers
    )


# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api")
app.include_router(ws_router)


# ─── Health (fast, no DB) ─────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}
