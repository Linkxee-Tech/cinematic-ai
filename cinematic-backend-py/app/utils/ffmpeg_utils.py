"""
FFmpeg composition utilities.

Functions
---------
compose_final_video(project_dir, clips, voiceover, music, subtitles)
generate_thumbnail(video_path, output_path, t=5)
upscale_frames(frames_dir, output_dir)
"""

import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import ffmpeg

logger = logging.getLogger("cinematic_ai.ffmpeg")

# dB attenuation applied to background music under voiceover
MUSIC_DUCK_DB = -12.0
# Crossfade duration between clips in seconds
CROSSFADE_DURATION = 0.5


def compose_final_video(
    clips: list[Path],
    voiceover: Optional[Path],
    music: Optional[Path],
    subtitle_text: Optional[str],
    output_path: Path,
) -> Path:
    """
    Compose final film.mp4:
      1. Concatenate video clips with crossfade transitions.
      2. Overlay voiceover (primary) + music ducked under voiceover by MUSIC_DUCK_DB.
      3. Burn SRT subtitles onto video.

    Returns the output path.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not clips:
        raise ValueError("No video clips provided for composition.")

    logger.info("Composing final video: %d clips → %s", len(clips), output_path)

    # ── Step 1: concat clips ─────────────────────────────────────────────────
    if len(clips) == 1:
        concat_video = clips[0]
    else:
        concat_video = _crossfade_concat(clips)

    # ── Step 2: audio mix ────────────────────────────────────────────────────
    video_stream = ffmpeg.input(str(concat_video))

    if voiceover and voiceover.exists():
        if music and music.exists():
            vo = ffmpeg.input(str(voiceover)).audio
            bg = ffmpeg.input(str(music)).audio
            # Duck background music
            bg_ducked = ffmpeg.filter(bg, "volume", f"{MUSIC_DUCK_DB}dB")
            mixed_audio = ffmpeg.filter([vo, bg_ducked], "amix", inputs=2, duration="first")
        else:
            mixed_audio = ffmpeg.input(str(voiceover)).audio
    else:
        mixed_audio = video_stream.audio

    # ── Step 3: subtitle overlay ─────────────────────────────────────────────
    video_with_subs = video_stream.video
    if subtitle_text:
        srt_path = _write_srt(subtitle_text)
        video_with_subs = ffmpeg.filter(video_with_subs, "subtitles", str(srt_path))

    # ── Step 4: output ───────────────────────────────────────────────────────
    out = ffmpeg.output(
        video_with_subs,
        mixed_audio,
        str(output_path),
        vcodec="libx264",
        acodec="aac",
        audio_bitrate="192k",
        video_bitrate="4000k",
        **{"crf": "18", "preset": "fast"},
    ).overwrite_output()

    try:
        ffmpeg.run(out, quiet=True, capture_stdout=True, capture_stderr=True)
    except ffmpeg.Error as e:
        logger.error("FFmpeg compose failed: %s", e.stderr.decode() if e.stderr else str(e))
        raise

    logger.info("Final video composed: %s (%.1f MB)", output_path, output_path.stat().st_size / 1e6)
    return output_path


def generate_thumbnail(video_path: Path, output_path: Path, t: float = 5.0) -> Path:
    """Extract a single frame at time *t* seconds as JPEG thumbnail."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        (
            ffmpeg
            .input(str(video_path), ss=t)
            .output(str(output_path), vframes=1, format="image2", vcodec="mjpeg")
            .overwrite_output()
            .run(quiet=True)
        )
        logger.info("Thumbnail generated: %s", output_path)
    except ffmpeg.Error as e:
        logger.error("Thumbnail generation failed: %s", e.stderr.decode() if e.stderr else str(e))
        raise
    return output_path


def upscale_frames(frames_dir: Path, output_dir: Path, scale: int = 4) -> Path:
    """
    Upscale each PNG frame in *frames_dir* using Lanczos (CPU fallback).
    In production the Genblaze Replicate step handles GPU upscaling.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = sorted(frames_dir.glob("*.png"))
    if not frames:
        raise FileNotFoundError(f"No PNG frames found in {frames_dir}")

    for frame in frames:
        out_frame = output_dir / frame.name
        try:
            (
                ffmpeg
                .input(str(frame))
                .filter("scale", f"iw*{scale}", f"ih*{scale}", flags="lanczos")
                .output(str(out_frame))
                .overwrite_output()
                .run(quiet=True)
            )
        except ffmpeg.Error as e:
            logger.warning("Upscale failed for %s: %s", frame.name, e)

    logger.info("Upscaled %d frames → %s", len(frames), output_dir)
    return output_dir


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _crossfade_concat(clips: list[Path]) -> Path:
    """Concatenate clips with xfade crossfade transitions. Returns temp output path."""
    tmp = Path(tempfile.mktemp(suffix="_concat.mp4"))

    if len(clips) == 2:
        a = ffmpeg.input(str(clips[0]))
        b = ffmpeg.input(str(clips[1]))
        # Get duration of first clip to calculate offset
        probe = ffmpeg.probe(str(clips[0]))
        dur = float(probe["format"]["duration"])
        offset = max(0, dur - CROSSFADE_DURATION)
        v = ffmpeg.filter([a.video, b.video], "xfade", transition="fade", duration=CROSSFADE_DURATION, offset=offset)
        au = ffmpeg.filter([a.audio, b.audio], "acrossfade", d=CROSSFADE_DURATION)
        ffmpeg.output(v, au, str(tmp)).overwrite_output().run(quiet=True)
        return tmp

    # For 3+ clips: use simple concat (xfade chaining is complex)
    concat_list = tmp.with_suffix(".txt")
    concat_list.write_text("\n".join(f"file '{c}'" for c in clips))
    (
        ffmpeg
        .input(str(concat_list), format="concat", safe=0)
        .output(str(tmp), c="copy")
        .overwrite_output()
        .run(quiet=True)
    )
    concat_list.unlink(missing_ok=True)
    return tmp


def _write_srt(text: str) -> Path:
    """Write minimal SRT subtitle file from plain text. Returns path."""
    words = text.split()
    lines: list[str] = []
    chunk_size = 8
    for i, chunk_start in enumerate(range(0, len(words), chunk_size)):
        chunk = " ".join(words[chunk_start:chunk_start + chunk_size])
        ts_start = _srt_ts(i * 3)
        ts_end = _srt_ts((i + 1) * 3)
        lines.append(f"{i + 1}\n{ts_start} --> {ts_end}\n{chunk}\n")
    srt_path = Path(tempfile.mktemp(suffix=".srt"))
    srt_path.write_text("\n".join(lines), encoding="utf-8")
    return srt_path


def _srt_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
