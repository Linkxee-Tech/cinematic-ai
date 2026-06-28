"""
Genblaze pipeline orchestrator.

6-step chain:
  1. script      — GMICloud LLM   (llama-3.2-90b)
  2. storyboard  — GMICloud Image (seedream-5.0-lite)
  3. video       — GMICloud Video (kling)
  4. voiceover   — ElevenLabs     (eleven_monolingual_v1)
  5. music       — GMICloud Audio (minimax)
  6. upscale     — Replicate      (real-esrgan)
"""

import logging
from typing import Any, AsyncIterator, Callable, Optional

from app.config import get_settings

logger = logging.getLogger("cinematic_ai.pipeline")
settings = get_settings()

# Step definitions — order matters
PIPELINE_STEPS: list[dict[str, Any]] = [
    {
        "name": "script",
        "label": "Script Analysis",
        "provider": "gmicloud_chat",
        "model": "llama-3.2-90b",
        "timeout": 60,
    },
    {
        "name": "storyboard",
        "label": "Storyboard Generation",
        "provider": "gmicloud_image",
        "model": "seedream-5.0-lite",
        "timeout": 120,
    },
    {
        "name": "video",
        "label": "Video Synthesis",
        "provider": "gmicloud_video",
        "model": "kling",
        "timeout": 300,
    },
    {
        "name": "voiceover",
        "label": "Voiceover Generation",
        "provider": "elevenlabs",
        "model": "eleven_monolingual_v1",
        "timeout": 90,
    },
    {
        "name": "music",
        "label": "Score Generation",
        "provider": "gmicloud_audio",
        "model": "minimax",
        "timeout": 90,
    },
    {
        "name": "upscale",
        "label": "Upscaling & Post-Production",
        "provider": "replicate",
        "model": "real-esrgan",
        "timeout": 180,
    },
]

# Fallback providers per step name (rotation)
FALLBACK_PROVIDERS: dict[str, list[dict[str, str]]] = {
    "script": [
        {"provider": "openai", "model": "gpt-4o"},
        {"provider": "gemini", "model": "gemini-1.5-pro"}
    ],
    "storyboard": [
        {"provider": "replicate", "model": "sdxl"}
    ],
    "voiceover": [
        {"provider": "openai", "model": "tts-1"}
    ],
}


class PipelineOrchestrator:
    """
    Builds and executes the Genblaze provider chain.

    Uses try-import pattern so the module loads even when
    genblaze is not installed (allows unit testing of other
    modules without the full AI SDK).
    """

    def __init__(self) -> None:
        self._steps = PIPELINE_STEPS

    def _build_provider(self, step: dict[str, Any]):
        """Instantiate the correct Genblaze provider for a step."""
        try:
            provider_name = step["provider"]
            model = step["model"]

            if provider_name == "gmicloud_chat":
                class GMICloudChatProvider:
                    def __init__(self, api_key: str):
                        self.api_key = api_key
                    async def ainvoke(self, step):
                        from genblaze_gmicloud import achat
                        res = await achat(model=step.model, prompt=step.prompt, api_key=self.api_key)
                        step.metadata = {"text": res.message.content}
                        return step
                return GMICloudChatProvider(api_key=settings.gmi_api_key)

            if provider_name == "gmicloud_image":
                from genblaze_gmicloud import GMICloudImageProvider
                return GMICloudImageProvider(api_key=settings.gmi_api_key)

            if provider_name == "gmicloud_video":
                from genblaze_gmicloud import GMICloudVideoProvider
                return GMICloudVideoProvider(api_key=settings.gmi_api_key)

            if provider_name == "gmicloud_audio":
                from genblaze_gmicloud import GMICloudAudioProvider
                return GMICloudAudioProvider(api_key=settings.gmi_api_key)

            if provider_name == "elevenlabs":
                from genblaze_elevenlabs import ElevenLabsProvider
                return ElevenLabsProvider(api_key=settings.elevenlabs_api_key)

            if provider_name == "replicate":
                from genblaze_replicate import ReplicateProvider
                return ReplicateProvider(api_token=settings.replicate_api_token)

            if provider_name == "openai":
                class OpenAIChatProvider:
                    def __init__(self, api_key: str):
                        self.api_key = api_key
                    async def ainvoke(self, step):
                        from genblaze_gmicloud import achat
                        res = await achat(model=step.model, prompt=step.prompt, api_key=self.api_key, base_url="https://api.openai.com/v1")
                        step.metadata = {"text": res.message.content}
                        return step
                return OpenAIChatProvider(api_key=settings.openai_api_key)

            if provider_name == "gemini":
                class GeminiChatProvider:
                    def __init__(self, api_key: str):
                        self.api_key = api_key
                    async def ainvoke(self, step):
                        from genblaze_google import achat
                        import os
                        
                        # genblaze_google looks for GEMINI_API_KEY environment variable by default,
                        # but we can also set it temporarily if it expects it in env or pass it via kwargs.
                        # It typically passes down **kwargs.
                        os.environ["GEMINI_API_KEY"] = self.api_key
                        
                        res = await achat(
                            model=step.model, 
                            prompt=step.prompt
                        )
                        step.metadata = {"text": res.message.content}
                        return step
                return GeminiChatProvider(api_key=settings.gemini_api_key)

        except ImportError as e:
            logger.warning("Provider import failed for %s: %s", step["name"], e)
            return None

    def _build_storage(self):
        """Return Genblaze S3Storage sink pointing at B2."""
        try:
            from genblaze_s3 import S3Storage
            return S3Storage(
                bucket=settings.b2_bucket_name,
                endpoint_url=f"https://s3.{settings.b2_bucket_name}.backblazeb2.com",
                aws_access_key_id=settings.b2_key_id,
                aws_secret_access_key=settings.b2_app_key,
            )
        except ImportError:
            logger.warning("genblaze_s3 not available; storage sink disabled")
            return None

    async def run(
        self,
        prompt: str,
        genre: str,
        project_id: str,
        user_id: str,
        target_duration: str = "medium",
        target_quality: str = "720p",
        target_style: str = "cinematic",
        on_step_update: Optional[Callable[[str, str, int, Optional[str]], None]] = None,
    ) -> dict[str, Any]:
        """
        Execute all 6 pipeline steps sequentially with retry + fallback.

        Parameters
        ----------
        on_step_update(step_name, status, progress, preview_url)

        Returns
        -------
        dict with keys: steps_results, output_paths
        """
        results: dict[str, Any] = {}
        context: dict[str, Any] = {
            "prompt": prompt, 
            "genre": genre,
            "target_duration": target_duration,
            "target_quality": target_quality,
            "target_style": target_style
        }

        for step in self._steps:
            name = step["name"]
            logger.info("[%s] Starting step '%s'", project_id[:8], name)

            if on_step_update:
                on_step_update(name, "running", 0, None)

            provider = self._build_provider(step)
            if provider is None:
                logger.warning("[%s] Skipping step '%s' — provider unavailable", project_id[:8], name)
                results[name] = {"status": "skipped", "output": None}
                if on_step_update:
                    on_step_update(name, "skipped", 100, None)
                continue

            try:
                output = await self._execute_step(provider, step, context)
                results[name] = {"status": "completed", "output": output}
                context[name] = output  # pass to next step
                if on_step_update:
                    on_step_update(name, "completed", 100, _extract_preview(name, output))
                logger.info("[%s] Step '%s' completed", project_id[:8], name)

            except Exception as exc:
                logger.error("[%s] Step '%s' failed: %s", project_id[:8], name, exc, exc_info=True)

                # Attempt fallbacks in order
                fallbacks = FALLBACK_PROVIDERS.get(name, [])
                fallback_success = False
                
                for fallback_cfg in fallbacks:
                    fb_name = fallback_cfg["provider"]
                    logger.info("[%s] Retrying '%s' with fallback provider: %s", project_id[:8], name, fb_name)
                    try:
                        merged_step = {**step, **fallback_cfg}
                        fb_provider = self._build_provider(merged_step)
                        output = await self._execute_step(fb_provider, merged_step, context)
                        results[name] = {"status": "completed_with_fallback", "output": output}
                        context[name] = output
                        if on_step_update:
                            on_step_update(name, "completed", 100, _extract_preview(name, output))
                        fallback_success = True
                        break # Stop trying fallbacks once one succeeds
                    except Exception as fb_exc:
                        logger.error("[%s] Fallback %s failed: %s", project_id[:8], fb_name, fb_exc)
                
                if fallback_success:
                    continue

                results[name] = {"status": "failed", "error": str(exc)}
                if on_step_update:
                    on_step_update(name, "failed", 0, None)
                raise RuntimeError(f"Pipeline failed at step '{name}': {exc}") from exc

        return {"steps_results": results, "context": context}

    async def _execute_step(
        self,
        provider,
        step: dict[str, Any],
        context: dict[str, Any],
    ) -> Any:
        """Run a single provider step with timeout."""
        import asyncio
        from genblaze_core import Step

        prompt = _build_step_prompt(step["name"], context)
        timeout = step.get("timeout", 120)

        genblaze_step = Step(
            provider=step["provider"],
            model=step.get("model", ""),
            prompt=prompt
        )

        res_step = await asyncio.wait_for(provider.ainvoke(genblaze_step), timeout=timeout)
        
        if hasattr(res_step, "status") and res_step.status.value == "failed":
            raise RuntimeError(f"Provider failed: {res_step.error}")

        if res_step.assets:
            return {"url": res_step.assets[0].url}
            
        if "text" in res_step.metadata:
            return res_step.metadata["text"]
            
        return res_step.model_dump()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_step_prompt(step_name: str, ctx: dict[str, Any]) -> str:
    base = ctx.get("prompt", "")
    genre = ctx.get("genre", "")
    duration = ctx.get("target_duration", "medium")
    quality = ctx.get("target_quality", "720p")
    style = ctx.get("target_style", "cinematic")
    
    dur_guidance = ""
    if duration == "short":
        dur_guidance = "It must be very short, roughly 1 paragraph, producing 2-3 scenes."
    elif duration == "long":
        dur_guidance = "It must be extensive, roughly 4-5 paragraphs, producing 8-10 scenes."
    else:
        dur_guidance = "It should be medium length, roughly 2-3 paragraphs, producing 4-6 scenes."

    if step_name == "script":
        return f"Write a {style} short film script ({genre}): {base}. {dur_guidance}"
    if step_name == "storyboard":
        return f"Storyboard for a {style} {genre} film: {ctx.get('script', base)[:500]}"
    if step_name == "video":
        return f"{style.capitalize()} video clip, {quality} quality for scene: {ctx.get('storyboard', base)}"
    if step_name == "voiceover":
        return str(ctx.get("script", base))[:2000]
    if step_name == "music":
        return f"Background score for {genre} {style} short film, emotional, cinematic"
    if step_name == "upscale":
        return f"upscale to {quality}"
    return base


def _extract_preview(step_name: str, output: Any) -> Optional[str]:
    """Extract a preview URL from provider output if available."""
    if isinstance(output, dict):
        return output.get("url") or output.get("preview_url")
    if isinstance(output, str) and output.startswith("http"):
        return output
    return None
