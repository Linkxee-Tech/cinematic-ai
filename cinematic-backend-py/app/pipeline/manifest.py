"""
Provenance manifest builder + B2 uploader.

Manifest schema
---------------
{
  "schema_version": "1.0",
  "run_id": "...",
  "project_id": "...",
  "pipeline": "cinematic-ai-v1",
  "generation_timestamp": "ISO-8601",
  "prompt": "...",
  "genre": "...",
  "model_versions": { step: "provider@model" },
  "asset_checksums": { b2_key: sha256 },
  "lineage": [ { provider, model, version, output } ],
  "pipeline_hash": "sha256 of sorted asset_checksums"
}
"""

import hashlib
import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.pipeline.orchestrator import PIPELINE_STEPS

logger = logging.getLogger("cinematic_ai.manifest")


def build_manifest(
    project_id: str,
    run_id: str,
    prompt: str,
    genre: str,
    steps_results: dict[str, Any],
    assets_meta: dict[str, Any],
) -> dict[str, Any]:
    """Construct the provenance manifest dict."""
    model_versions: dict[str, str] = {}
    lineage: list[dict[str, str]] = []

    for step in PIPELINE_STEPS:
        name = step["name"]
        result = steps_results.get(name, {})
        if result.get("status") not in ("completed", "completed_with_fallback", "skipped"):
            continue
        version_str = f"{step['provider']}@{step['model']}"
        model_versions[name] = version_str
        lineage.append({
            "provider": step["provider"],
            "model": step["model"],
            "version": step["model"],
            "output": assets_meta.get(name, {}).get("b2_key", "N/A"),
        })

    asset_checksums: dict[str, str] = {
        meta["b2_key"]: meta.get("sha256", "")
        for meta in assets_meta.values()
        if meta.get("b2_key")
    }

    pipeline_hash = _hash_checksums(asset_checksums)

    return {
        "schema_version": "1.0",
        "run_id": run_id,
        "project_id": project_id,
        "pipeline": "cinematic-ai-v1",
        "generation_timestamp": datetime.now(timezone.utc).isoformat(),
        "prompt": prompt,
        "genre": genre,
        "model_versions": model_versions,
        "asset_checksums": asset_checksums,
        "lineage": lineage,
        "pipeline_hash": pipeline_hash,
    }


async def upload_manifest(
    manifest: dict[str, Any],
    user_id: str,
    project_id: str,
    run_id: str,
) -> tuple[str, str, str]:
    """
    Write manifest to a temp file, upload to B2, return (url, b2_key, sha256).
    """
    from app.storage.b2_client import get_b2
    b2 = get_b2()
    b2_key = b2.manifest_path(user_id, project_id, run_id)
    manifest_json = json.dumps(manifest, indent=2, ensure_ascii=False)

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w", encoding="utf-8") as f:
        f.write(manifest_json)
        tmp_path = Path(f.name)

    try:
        url, key, sha256 = b2.upload_file(tmp_path, b2_key, content_type="application/json")
    finally:
        tmp_path.unlink(missing_ok=True)

    logger.info("Manifest uploaded: %s (sha256=%s…)", b2_key, sha256[:16])
    return url, key, sha256


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _hash_checksums(checksums: dict[str, str]) -> str:
    """Deterministic SHA-256 of sorted key:value pairs."""
    joined = ";".join(f"{k}:{v}" for k, v in sorted(checksums.items()))
    return hashlib.sha256(joined.encode()).hexdigest()
