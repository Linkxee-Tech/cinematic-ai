"""
Unit tests for B2 storage client.
Run: pytest tests/test_b2.py -v
"""

import hashlib
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_temp_file(content: bytes = b"hello cinematic") -> Path:
    f = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
    f.write(content)
    f.close()
    return Path(f.name)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── Path helper tests (pure, no B2 connection needed) ─────────────────────────

class TestPathHelpers:
    def test_storyboard_path(self):
        from app.storage.b2_client import B2Client
        p = B2Client.storyboard_path("u1", "p1", 3)
        assert p == "users/u1/projects/p1/raw/storyboard/frame_0003.png"

    def test_video_clip_path(self):
        from app.storage.b2_client import B2Client
        p = B2Client.video_clip_path("u1", "p1", 0)
        assert p == "users/u1/projects/p1/raw/video_clips/clip_0000.mp4"

    def test_voiceover_path(self):
        from app.storage.b2_client import B2Client
        p = B2Client.voiceover_path("u1", "p1")
        assert p == "users/u1/projects/p1/raw/audio/voiceover.mp3"

    def test_manifest_path(self):
        from app.storage.b2_client import B2Client
        p = B2Client.manifest_path("u1", "p1", "r1")
        assert p == "users/u1/projects/p1/manifests/run_r1.json"

    def test_final_video_path(self):
        from app.storage.b2_client import B2Client
        p = B2Client.final_video_path("u1", "p1")
        assert p == "users/u1/projects/p1/final/film.mp4"

    def test_thumbnail_path(self):
        from app.storage.b2_client import B2Client
        p = B2Client.thumbnail_path("u1", "p1")
        assert p == "users/u1/projects/p1/final/thumbnail.jpg"


# ── SHA-256 helper ─────────────────────────────────────────────────────────────

class TestSHA256:
    def test_sha256_known_value(self):
        from app.storage.b2_client import _sha256_file
        content = b"cinematic-ai-test"
        tmp = _make_temp_file(content)
        try:
            result = _sha256_file(tmp)
            assert result == _sha256(content)
        finally:
            tmp.unlink(missing_ok=True)

    def test_sha256_empty_file(self):
        from app.storage.b2_client import _sha256_file
        tmp = _make_temp_file(b"")
        try:
            result = _sha256_file(tmp)
            assert result == _sha256(b"")
        finally:
            tmp.unlink(missing_ok=True)


# ── Upload (mocked) ───────────────────────────────────────────────────────────

class TestUploadMocked:
    @patch("app.storage.b2_client.B2Api")
    def test_upload_returns_tuple(self, MockB2Api):
        mock_api = MagicMock()
        mock_bucket = MagicMock()
        mock_file = MagicMock()
        mock_file.id_ = "fileid_123"
        mock_bucket.upload_local_file.return_value = mock_file
        mock_api.get_bucket_by_name.return_value = mock_bucket
        mock_api.get_download_url_for_fileid.return_value = "https://f001.backblazeb2.com/file/bucket/test.txt"
        MockB2Api.return_value = mock_api

        with patch("app.storage.b2_client.InMemoryAccountInfo"):
            from importlib import reload
            import app.storage.b2_client as mod
            # Patch settings to avoid real creds
            with patch.object(mod, "settings") as ms:
                ms.b2_key_id = "fake"
                ms.b2_app_key = "fake"
                ms.b2_bucket_name = "test-bucket"
                client = mod.B2Client()

        tmp = _make_temp_file(b"test data")
        try:
            url, key, sha = client.upload_file(tmp, "test/test.txt")
            assert url.startswith("https://")
            assert key == "test/test.txt"
            assert len(sha) == 64
        finally:
            tmp.unlink(missing_ok=True)

    def test_upload_missing_file_raises(self):
        """upload_file must raise FileNotFoundError for missing local file."""
        with patch("app.storage.b2_client.B2Api"), \
             patch("app.storage.b2_client.InMemoryAccountInfo"):
            from app.storage import b2_client as mod
            with patch.object(mod, "settings") as ms:
                ms.b2_key_id = "x"
                ms.b2_app_key = "x"
                ms.b2_bucket_name = "x"
                client = mod.B2Client()
            with pytest.raises(FileNotFoundError):
                client.upload_file("/nonexistent/file.txt", "some/key.txt")
