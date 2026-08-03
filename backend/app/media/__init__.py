from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from app.providers.errors import ProviderError
from app.schemas.scene_run import SceneRunEvent, SceneRunRequest
from app.schemas.storyboard import (
    StoryboardDraft,
    StoryboardProjectSnapshot,
)

SceneMediaError = ProviderError


class SceneMediaGenerator(Protocol):
    def run(
        self, request: SceneRunRequest, run_id: str
    ) -> Iterator[SceneRunEvent]: ...


class StoryboardGenerator(Protocol):
    def generate(
        self,
        *,
        brief: StoryboardProjectSnapshot,
    ) -> StoryboardDraft: ...


@dataclass(frozen=True, slots=True)
class StoredMediaArtifact:
    storage_object_key: str
    media_type: str
    file_size_bytes: int
    sha256: str
    provider: str
    model: str
    manifest_object_key: str | None = None


class RenderMediaGateway(Protocol):
    def download(self, key: str) -> bytes: ...

    def upload(
        self,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> StoredMediaArtifact: ...

    def generate_narration(
        self,
        *,
        project_id: str,
        scene_id: str,
        text: str,
    ) -> StoredMediaArtifact: ...

    def generate_music(
        self,
        *,
        project_id: str,
        prompt: str,
        duration_seconds: int,
    ) -> StoredMediaArtifact: ...
