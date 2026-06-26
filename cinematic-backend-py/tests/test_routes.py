"""
Integration tests for FastAPI routes.
Run: pytest tests/test_routes.py -v

Uses an in-memory SQLite DB (via SQLAlchemy sync) and mocked Celery.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from unittest.mock import patch, MagicMock

from app.main import app
from app.database import Base, get_db
from app.models import ProjectStatus


# ── Fixtures ──────────────────────────────────────────────────────────────────

SQLALCHEMY_TEST_URL = "sqlite:///./test_cinematic.db"


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture(scope="function")
def db_session(engine):
    TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """TestClient with overridden DB dependency."""

    async def override_get_db():
        # Wrap sync session in an async-compatible yield
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.tasks.pipeline_tasks.run_pipeline_task") as mock_task:
        mock_task.delay.return_value = MagicMock(id="mock-task-id")
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.clear()


# ── Health ─────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ── Project CRUD ───────────────────────────────────────────────────────────────

class TestProjectCRUD:
    def _create(self, client, name="Test Film", prompt="A robot finds love", genre="Sci-Fi"):
        return client.post("/api/projects", json={"name": name, "prompt": prompt, "genre": genre})

    def test_create_project_201(self, client):
        resp = self._create(client)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Film"
        assert data["status"] == "draft"
        assert "id" in data

    def test_list_projects(self, client):
        self._create(client, name="Film A")
        self._create(client, name="Film B")
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        body = resp.json()
        assert "projects" in body
        assert body["total"] >= 2

    def test_get_project(self, client):
        pid = self._create(client)["json"]["id"] if hasattr(self._create(client), "json") else None
        create_resp = self._create(client, name="Get Me")
        pid = create_resp.json()["id"]
        resp = client.get(f"/api/projects/{pid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == pid

    def test_get_nonexistent_project_404(self, client):
        resp = client.get("/api/projects/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_update_project_name(self, client):
        pid = self._create(client, name="Old Name").json()["id"]
        resp = client.put(f"/api/projects/{pid}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_delete_project(self, client):
        pid = self._create(client, name="To Delete").json()["id"]
        with patch("app.api.routes.b2") as mock_b2:
            mock_b2.delete_prefix.return_value = 0
            resp = client.delete(f"/api/projects/{pid}")
        assert resp.status_code == 204
        assert client.get(f"/api/projects/{pid}").status_code == 404

    def test_duplicate_project(self, client):
        pid = self._create(client, name="Original").json()["id"]
        resp = client.post(f"/api/projects/{pid}/duplicate")
        assert resp.status_code == 201
        data = resp.json()
        assert "Copy" in data["name"]
        assert data["id"] != pid


# ── Input validation ───────────────────────────────────────────────────────────

class TestValidation:
    def test_prompt_too_long_422(self, client):
        resp = client.post("/api/projects", json={
            "name": "x",
            "prompt": "a" * 10000,
            "genre": "Drama",
        })
        assert resp.status_code == 422

    def test_empty_name_422(self, client):
        resp = client.post("/api/projects", json={
            "name": "",
            "prompt": "valid prompt",
            "genre": "Drama",
        })
        assert resp.status_code == 422

    def test_invalid_genre_422(self, client):
        resp = client.post("/api/projects", json={
            "name": "Film",
            "prompt": "valid prompt",
            "genre": "NotAGenre",
        })
        assert resp.status_code == 422

    def test_prompt_max_boundary_passes(self, client):
        resp = client.post("/api/projects", json={
            "name": "Boundary",
            "prompt": "a" * 9999,
            "genre": "Drama",
        })
        assert resp.status_code == 201


# ── Pipeline ───────────────────────────────────────────────────────────────────

class TestPipeline:
    def test_run_pipeline_enqueues_task(self, client):
        pid = client.post("/api/projects", json={
            "name": "Pipeline Test",
            "prompt": "A spaceship explores the galaxy",
            "genre": "Sci-Fi",
        }).json()["id"]

        with patch("app.api.routes.run_pipeline_task") as mock_task:
            mock_task.delay.return_value = MagicMock(id="task-abc")
            resp = client.post(f"/api/projects/{pid}/run")

        assert resp.status_code == 200
        assert resp.json()["status"] == "processing"
        mock_task.delay.assert_called_once()

    def test_run_already_processing_409(self, client):
        pid = client.post("/api/projects", json={
            "name": "Double Run",
            "prompt": "Test",
            "genre": "Drama",
        }).json()["id"]

        with patch("app.api.routes.run_pipeline_task") as mock_task:
            mock_task.delay.return_value = MagicMock()
            client.post(f"/api/projects/{pid}/run")   # first run
            resp = client.post(f"/api/projects/{pid}/run")  # second run

        assert resp.status_code == 409
        assert "progress" in resp.json()["detail"].lower() or "progress" in resp.json()["detail"].lower()

    def test_get_pipeline_status(self, client):
        pid = client.post("/api/projects", json={
            "name": "Status Check",
            "prompt": "A ghost learns to cook",
            "genre": "Comedy",
        }).json()["id"]
        resp = client.get(f"/api/projects/{pid}/status")
        assert resp.status_code == 200
        body = resp.json()
        assert body["project_id"] == pid
        assert "steps" in body
