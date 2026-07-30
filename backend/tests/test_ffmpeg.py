import shutil
import subprocess
from pathlib import Path

import pytest

from app.core.config import AppConfig
from app.integrations.ffmpeg import FFmpegRenderer, RenderSceneInput


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg is unavailable")
def test_ffmpeg_renderer_creates_a_playable_mp4(tmp_path: Path) -> None:
    image = tmp_path / "source.png"
    audio = tmp_path / "narration.mp3"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x3b2f2f:s=1080x1920",
            "-frames:v",
            "1",
            str(image),
        ],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=stereo",
            "-t",
            "1",
            str(audio),
        ],
        check=True,
        capture_output=True,
    )
    output = tmp_path / "final.mp4"
    renderer = FFmpegRenderer(AppConfig(ffmpeg_path="ffmpeg"))
    renderer.render(
        scenes=[
            RenderSceneInput(
                visual_path=image,
                audio_path=audio,
                narration=f"Scene {index}",
                duration_seconds=1,
            )
            for index in range(1, 5)
        ],
        output_path=output,
        work_dir=tmp_path / "work",
    )

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(output),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert output.stat().st_size > 0
    assert probe.stdout.strip() == "h264"
