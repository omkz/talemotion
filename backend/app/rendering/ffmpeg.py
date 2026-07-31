from __future__ import annotations

import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


class RenderCompositionError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class SceneMediaInput:
    path: Path
    kind: str
    duration_seconds: int
    narration_path: Path | None = None


@dataclass(frozen=True, slots=True)
class RenderComposition:
    scenes: list[SceneMediaInput]
    output_path: Path
    workspace: Path
    music_path: Path | None = None
    captions_path: Path | None = None


RunCommand = Callable[..., subprocess.CompletedProcess[str]]


class FFmpegComposer:
    def __init__(
        self,
        *,
        binary: str = "ffmpeg",
        timeout_seconds: int = 900,
        runner: RunCommand = subprocess.run,
    ) -> None:
        self.binary = binary
        self.timeout_seconds = timeout_seconds
        self.runner = runner

    def compose(self, composition: RenderComposition) -> None:
        if not composition.scenes:
            raise RenderCompositionError("No scene media was supplied.")
        composition.workspace.mkdir(parents=True, exist_ok=True)
        segment_paths: list[Path] = []
        narration_paths: list[Path] = []
        for index, scene in enumerate(composition.scenes, start=1):
            segment = composition.workspace / f"scene-{index:02}.mp4"
            self._execute(
                self.build_segment_command(scene, segment),
                cwd=composition.workspace,
            )
            segment_paths.append(segment)
            narration = composition.workspace / f"narration-{index:02}.m4a"
            self._execute(
                self.build_narration_command(scene, narration),
                cwd=composition.workspace,
            )
            narration_paths.append(narration)

        visuals = composition.workspace / "visuals.mp4"
        narration = composition.workspace / "narration.m4a"
        self._write_concat(
            composition.workspace / "visuals.txt",
            segment_paths,
        )
        self._write_concat(
            composition.workspace / "narration.txt",
            narration_paths,
        )
        self._execute(
            self._concat_command(composition.workspace / "visuals.txt", visuals),
            cwd=composition.workspace,
        )
        self._execute(
            self._concat_command(
                composition.workspace / "narration.txt",
                narration,
                copy_video=False,
            ),
            cwd=composition.workspace,
        )
        self._execute(
            self.build_final_command(
                visuals=visuals,
                narration=narration,
                output=composition.output_path,
                music=composition.music_path,
                captions=composition.captions_path,
            ),
            cwd=composition.workspace,
        )

    def build_segment_command(
        self,
        scene: SceneMediaInput,
        output: Path,
    ) -> list[str]:
        command = [self.binary]
        if scene.kind == "image":
            command.extend(["-loop", "1"])
        else:
            command.extend(["-stream_loop", "-1"])
        command.extend(["-i", str(scene.path), "-t", str(scene.duration_seconds)])
        command.extend(
            [
                "-vf",
                (
                    "scale=1080:1920:force_original_aspect_ratio=increase,"
                    "crop=1080:1920,fps=30"
                ),
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-y",
                str(output),
            ]
        )
        return command

    def build_narration_command(
        self,
        scene: SceneMediaInput,
        output: Path,
    ) -> list[str]:
        if scene.narration_path is None:
            return [
                self.binary,
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-t",
                str(scene.duration_seconds),
                "-c:a",
                "aac",
                "-y",
                str(output),
            ]
        return [
            self.binary,
            "-i",
            str(scene.narration_path),
            "-af",
            "apad",
            "-t",
            str(scene.duration_seconds),
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "aac",
            "-y",
            str(output),
        ]

    def build_final_command(
        self,
        *,
        visuals: Path,
        narration: Path,
        output: Path,
        music: Path | None,
        captions: Path | None,
    ) -> list[str]:
        command = [self.binary, "-i", str(visuals), "-i", str(narration)]
        if music is not None:
            command.extend(["-stream_loop", "-1", "-i", str(music)])
            audio_filter = (
                "[1:a]volume=1.0[narration];"
                "[2:a]volume=0.18[music];"
                "[narration][music]amix=inputs=2:duration=first:"
                "dropout_transition=2[aout]"
            )
        else:
            audio_filter = "[1:a]anull[aout]"
        command.extend(["-filter_complex", audio_filter])
        if captions is not None:
            command.extend(["-vf", "subtitles=captions.srt"])
        command.extend(
            [
                "-map",
                "0:v:0",
                "-map",
                "[aout]",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                "-movflags",
                "+faststart",
                "-y",
                str(output),
            ]
        )
        return command

    def _concat_command(
        self,
        manifest: Path,
        output: Path,
        *,
        copy_video: bool = True,
    ) -> list[str]:
        command = [
            self.binary,
            "-f",
            "concat",
            "-safe",
            "1",
            "-i",
            str(manifest),
        ]
        command.extend(["-c", "copy"] if copy_video else ["-c:a", "aac"])
        command.extend(["-y", str(output)])
        return command

    @staticmethod
    def _write_concat(path: Path, inputs: list[Path]) -> None:
        for item in inputs:
            if item.parent != path.parent or "'" in item.name:
                raise RenderCompositionError("Unsafe concat input path.")
        path.write_text(
            "".join(f"file '{item.name}'\n" for item in inputs),
            encoding="utf-8",
        )

    def _execute(self, command: list[str], *, cwd: Path) -> None:
        try:
            self.runner(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                cwd=cwd,
            )
        except (
            OSError,
            subprocess.CalledProcessError,
            subprocess.TimeoutExpired,
        ) as error:
            raise RenderCompositionError(
                "FFmpeg could not compose the final video."
            ) from error
