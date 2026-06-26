"""
Backblaze B2 storage client.

Path conventions
----------------
users/{uid}/projects/{pid}/raw/storyboard/frame_{n}.png
users/{uid}/projects/{pid}/raw/video_clips/clip_{n}.mp4
users/{uid}/projects/{pid}/raw/audio/voiceover.mp3
users/{uid}/projects/{pid}/raw/audio/score.mp3
users/{uid}/projects/{pid}/manifests/run_{rid}.json
users/{uid}/projects/{pid}/final/film.mp4
users/{uid}/projects/{pid}/final/thumbnail.jpg
"""

import hashlib
import logging
import mimetypes
import os
from pathlib import Path
from typing import Optional

from app.config import get_settings

logger = logging.getLogger("cinematic_ai.b2")
settings = get_settings()


class B2Client:
    """Thread-safe B2 client wrapper (one instance per process)."""

    def __init__(self) -> None:
        from b2sdk.v2 import B2Api, InMemoryAccountInfo
        info = InMemoryAccountInfo()
        self._api = B2Api(info)
        self._api.authorize_account("production", settings.b2_key_id, settings.b2_app_key)
        self._bucket = self._api.get_bucket_by_name(settings.b2_bucket_name)
        logger.info("B2 client authorised — bucket: %s", settings.b2_bucket_name)

    # ─── Upload ───────────────────────────────────────────────────────────────

    def upload_file(
        self,
        local_path: str | Path,
        b2_path: str,
        content_type: Optional[str] = None,
    ) -> tuple[str, str, str]:
        """
        Upload *local_path* to *b2_path*.

        Returns
        -------
        (public_url, b2_file_key, sha256_hex)
        """
        local_path = Path(local_path)
        if not local_path.exists():
            raise FileNotFoundError(f"Local file not found: {local_path}")

        sha256 = _sha256_file(local_path)
        ct = content_type or mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"

        file_info = {"sha256": sha256}
        b2_file = self._bucket.upload_local_file(
            local_file=str(local_path),
            file_name=b2_path,
            content_type=ct,
            file_infos=file_info,
        )

        url = self._api.get_download_url_for_fileid(b2_file.id_)
        logger.info("Uploaded %s → %s (%s bytes)", local_path.name, b2_path, local_path.stat().st_size)
        return url, b2_path, sha256

    # ─── Download ─────────────────────────────────────────────────────────────

    def download_file(self, b2_key: str, local_path: str | Path) -> Path:
        """Download *b2_key* to *local_path*. Creates parent dirs automatically."""
        local_path = Path(local_path)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        downloaded = self._bucket.download_file_by_name(b2_key)
        downloaded.save_to(str(local_path))
        logger.info("Downloaded %s → %s", b2_key, local_path)
        return local_path

    # ─── Delete ───────────────────────────────────────────────────────────────

    def delete_file(self, b2_key: str) -> None:
        """Delete a single file by its B2 path (file name)."""
        file_version = self._bucket.get_file_info_by_name(b2_key)
        self._bucket.delete_file_version(file_version.id_, b2_key)
        logger.info("Deleted B2 object: %s", b2_key)

    def delete_prefix(self, prefix: str) -> int:
        """Delete all objects under *prefix*. Returns count deleted."""
        count = 0
        for fv in self._bucket.ls(folder_to_list=prefix, recursive=True):
            file_version, _ = fv
            self._bucket.delete_file_version(file_version.id_, file_version.file_name)
            count += 1
        logger.info("Deleted %d objects under prefix: %s", count, prefix)
        return count

    # ─── Presigned URL ────────────────────────────────────────────────────────

    def generate_presigned_url(self, b2_key: str, expires: int = 3600) -> str:
        """Return a time-limited download URL for *b2_key*."""
        url = self._bucket.get_download_url(b2_key)
        auth_token = self._bucket.get_download_authorization(
            file_name_prefix=b2_key,
            valid_duration_in_seconds=expires,
        )
        return f"{url}?Authorization={auth_token}"

    # ─── Path helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def storyboard_path(uid: str, pid: str, n: int) -> str:
        return f"users/{uid}/projects/{pid}/raw/storyboard/frame_{n:04d}.png"

    @staticmethod
    def video_clip_path(uid: str, pid: str, n: int) -> str:
        return f"users/{uid}/projects/{pid}/raw/video_clips/clip_{n:04d}.mp4"

    @staticmethod
    def voiceover_path(uid: str, pid: str) -> str:
        return f"users/{uid}/projects/{pid}/raw/audio/voiceover.mp3"

    @staticmethod
    def score_path(uid: str, pid: str) -> str:
        return f"users/{uid}/projects/{pid}/raw/audio/score.mp3"

    @staticmethod
    def manifest_path(uid: str, pid: str, run_id: str) -> str:
        return f"users/{uid}/projects/{pid}/manifests/run_{run_id}.json"

    @staticmethod
    def final_video_path(uid: str, pid: str) -> str:
        return f"users/{uid}/projects/{pid}/final/film.mp4"

    @staticmethod
    def thumbnail_path(uid: str, pid: str) -> str:
        return f"users/{uid}/projects/{pid}/final/thumbnail.jpg"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ─── Lazy singleton ────────────────────────────────────────────────────────────
# B2Client is only instantiated on first call — avoids B2 auth at module import
# time, which would crash workers/tests that don't have B2 credentials.

_b2_instance: Optional[B2Client] = None


def get_b2() -> B2Client:
    global _b2_instance
    if _b2_instance is None:
        _b2_instance = B2Client()
    return _b2_instance


# Legacy alias kept for any remaining direct imports
@property
def b2() -> B2Client:  # type: ignore[misc]
    return get_b2()
