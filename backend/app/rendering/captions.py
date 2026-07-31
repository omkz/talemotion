from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CaptionScene:
    narration: str
    duration_seconds: int


def _timestamp(milliseconds: int) -> str:
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def build_srt(scenes: list[CaptionScene]) -> str:
    blocks: list[str] = []
    elapsed_ms = 0
    for index, scene in enumerate(scenes, start=1):
        duration_ms = scene.duration_seconds * 1_000
        text = " ".join(scene.narration.split()).strip()
        if text:
            blocks.append(
                "\n".join(
                    (
                        str(index),
                        f"{_timestamp(elapsed_ms)} --> "
                        f"{_timestamp(elapsed_ms + duration_ms)}",
                        text,
                    )
                )
            )
        elapsed_ms += duration_ms
    return "\n\n".join(blocks) + ("\n" if blocks else "")
