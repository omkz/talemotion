import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import AppConfig
from app.core.readiness import require_ffmpeg


@dataclass(frozen=True, slots=True)
class RenderSceneInput:
    visual_path: Path
    audio_path: Path
    narration: str
    duration_seconds: int


class VideoRenderer(Protocol):
    def render(
        self,
        *,
        scenes: list[RenderSceneInput],
        output_path: Path,
        work_dir: Path,
    ) -> None: ...


class FFmpegRenderer:
    def __init__(self, config: AppConfig) -> None:
        require_ffmpeg(config)
        self._ffmpeg = config.ffmpeg_path

    def render(
        self,
        *,
        scenes: list[RenderSceneInput],
        output_path: Path,
        work_dir: Path,
    ) -> None:
        work_dir.mkdir(parents=True, exist_ok=True)
        clips: list[Path] = []
        subtitle_lines: list[str] = []
        elapsed = 0
        for index, scene in enumerate(scenes, start=1):
            clip_path = work_dir / f"scene-{index:02d}.mp4"
            frame_count = scene.duration_seconds * 30
            filter_graph = (
                "scale=1080:1920:force_original_aspect_ratio=increase,"
                "crop=1080:1920,"
                f"zoompan=z='min(zoom+0.0005,1.08)':d={frame_count}:"
                "s=1080x1920:fps=30,format=yuv420p"
            )
            self._run(
                [
                    self._ffmpeg,
                    "-y",
                    "-loop",
                    "1",
                    "-i",
                    str(scene.visual_path),
                    "-i",
                    str(scene.audio_path),
                    "-vf",
                    filter_graph,
                    "-af",
                    f"apad=whole_dur={scene.duration_seconds}",
                    "-t",
                    str(scene.duration_seconds),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "medium",
                    "-c:a",
                    "aac",
                    "-pix_fmt",
                    "yuv420p",
                    str(clip_path),
                ]
            )
            clips.append(clip_path)
            subtitle_lines.extend(
                [
                    str(index),
                    f"{self._srt_time(elapsed)} --> "
                    f"{self._srt_time(elapsed + scene.duration_seconds)}",
                    scene.narration.replace("\n", " "),
                    "",
                ]
            )
            elapsed += scene.duration_seconds

        concat_file = work_dir / "concat.txt"
        concat_file.write_text(
            "".join(f"file '{clip.as_posix()}'\n" for clip in clips),
            encoding="utf-8",
        )
        joined = work_dir / "joined.mp4"
        self._run(
            [
                self._ffmpeg,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_file),
                "-c",
                "copy",
                str(joined),
            ]
        )
        subtitles = work_dir / "captions.srt"
        subtitles.write_text("\n".join(subtitle_lines), encoding="utf-8")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        self._run(
            [
                self._ffmpeg,
                "-y",
                "-i",
                str(joined),
                "-vf",
                (
                    f"subtitles={subtitles.as_posix()}:"
                    "force_style='FontSize=18,Alignment=2,MarginV=110,"
                    "Outline=2,Shadow=1'"
                ),
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-c:a",
                "copy",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )

    @staticmethod
    def _srt_time(seconds: int) -> str:
        hours, remainder = divmod(seconds, 3600)
        minutes, secs = divmod(remainder, 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},000"

    @staticmethod
    def _run(command: list[str]) -> None:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
