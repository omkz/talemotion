from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from app.schemas.scene_run import SceneRunEvent, SceneRunRequest
from app.schemas.storyboard import HistoricalStoryboardDraft


@dataclass(slots=True)
class SceneMediaError(Exception):
    code: str
    message: str
    retryable: bool


class SceneMediaGenerator(Protocol):
    def run(
        self, request: SceneRunRequest, run_id: str
    ) -> Iterator[SceneRunEvent]: ...

    def presign_preview(self, key: str) -> str: ...


class StoryboardGenerator(Protocol):
    def generate(
        self,
        *,
        topic: str,
        additional_direction: str,
        historical_accuracy_note: str | None,
        visual_style: str,
        duration_seconds: int,
    ) -> HistoricalStoryboardDraft: ...
