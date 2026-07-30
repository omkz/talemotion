from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from app.schemas.scene_run import SceneRunEvent, SceneRunRequest


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
