import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from urllib.parse import unquote, urlparse

from genblaze_core import Modality, Pipeline
from genblaze_openai import DalleProvider, OpenAITTSProvider, chat
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import AppConfig
from app.core.readiness import require_openai


class StoryboardScene(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    narration: str = Field(min_length=1)
    visual_prompt: str = Field(min_length=1)
    duration_seconds: int = Field(gt=0, le=20)
    position: int = Field(ge=1, le=4)


class StoryboardOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenes: tuple[
        StoryboardScene,
        StoryboardScene,
        StoryboardScene,
        StoryboardScene,
    ]

    @model_validator(mode="after")
    def validate_positions(self) -> "StoryboardOutput":
        if [scene.position for scene in self.scenes] != [1, 2, 3, 4]:
            raise ValueError("Storyboard positions must be exactly 1, 2, 3, 4")
        return self


@dataclass(frozen=True, slots=True)
class GeneratedMedia:
    data: bytes
    mime_type: str
    provider: str
    model: str
    generation_parameters: dict[str, str | int | float | bool | None]
    genblaze_provenance: dict[str, object] = field(default_factory=dict)


class GenerationProvider(Protocol):
    def generate_storyboard(
        self,
        *,
        topic: str,
        additional_direction: str,
        source_notes: str,
        duration_seconds: int,
        additional_instruction: str | None = None,
    ) -> StoryboardOutput: ...

    def generate_image(self, *, prompt: str, output_dir: Path) -> GeneratedMedia: ...

    def generate_speech(
        self,
        *,
        narration: str,
        output_dir: Path,
    ) -> GeneratedMedia: ...


class GenblazeOpenAIProvider:
    def __init__(self, config: AppConfig) -> None:
        require_openai(config)
        self._api_key = (
            config.openai_api_key.get_secret_value()
            if config.openai_api_key
            else ""
        )
        self._text_model = config.genblaze_text_model
        self._image_model = config.genblaze_image_model
        self._tts_model = config.genblaze_tts_model
        self._tts_voice = config.genblaze_tts_voice

    def generate_storyboard(
        self,
        *,
        topic: str,
        additional_direction: str,
        source_notes: str,
        duration_seconds: int,
        additional_instruction: str | None = None,
    ) -> StoryboardOutput:
        prompt = (
            f"Topic: {topic}\n"
            f"Additional direction: {additional_direction or 'None'}\n"
            f"Source notes: {source_notes or 'None'}\n"
            f"Target duration: {duration_seconds} seconds\n"
            f"Revision instruction: {additional_instruction or 'None'}"
        )
        system = (
            "You are a historical documentary storyboard editor. Produce exactly "
            "four chronologically coherent scenes for a short-form vertical video. "
            "Narration must be concise English, distinguish established fact from "
            "uncertainty, avoid invented quotations, and approximately total the "
            "target duration. Visual prompts must request cinematic 9:16 imagery "
            "without anachronisms or modern text overlays."
        )
        last_error: ValueError | None = None
        for _attempt in range(3):
            response = chat(
                self._text_model,
                prompt=prompt,
                system=system,
                response_format=StoryboardOutput,
                api_key=self._api_key,
                temperature=0.3,
                max_tokens=1800,
                retry_on_rate_limit=True,
            )
            try:
                output = StoryboardOutput.model_validate_json(response.text)
                total = sum(scene.duration_seconds for scene in output.scenes)
                if abs(total - duration_seconds) > 2:
                    raise ValueError(
                        "Storyboard duration "
                        f"{total}s misses target {duration_seconds}s"
                    )
                return output
            except ValueError as error:
                last_error = error
                prompt += (
                    "\nThe previous response was malformed or missed the duration "
                    "target. Return only a valid structured response."
                )
        raise ValueError("Genblaze returned invalid storyboard output") from last_error

    def generate_image(self, *, prompt: str, output_dir: Path) -> GeneratedMedia:
        output_dir.mkdir(parents=True, exist_ok=True)
        provider = DalleProvider(api_key=self._api_key, output_dir=output_dir)
        result = (
            Pipeline("talemotion-scene-image")
            .step(
                provider,
                model=self._image_model,
                prompt=prompt,
                modality=Modality.IMAGE,
                size="1024x1536",
                quality="medium",
                output_format="png",
            )
            .run(timeout=300, max_retries=1, raise_on_failure=True, progress=False)
        )
        asset = result.run.steps[0].assets[0]
        return GeneratedMedia(
            data=self._read_local_asset(asset.url),
            mime_type=asset.media_type,
            provider=result.run.steps[0].provider,
            model=result.run.steps[0].model,
            generation_parameters={
                "size": "1024x1536",
                "quality": "medium",
                "output_format": "png",
            },
            genblaze_provenance=json.loads(result.manifest.model_dump_json()),
        )

    def generate_speech(
        self,
        *,
        narration: str,
        output_dir: Path,
    ) -> GeneratedMedia:
        output_dir.mkdir(parents=True, exist_ok=True)
        provider = OpenAITTSProvider(api_key=self._api_key, output_dir=output_dir)
        result = (
            Pipeline("talemotion-scene-narration")
            .step(
                provider,
                model=self._tts_model,
                prompt=narration,
                modality=Modality.AUDIO,
                voice=self._tts_voice,
                response_format="mp3",
            )
            .run(timeout=180, max_retries=1, raise_on_failure=True, progress=False)
        )
        asset = result.run.steps[0].assets[0]
        return GeneratedMedia(
            data=self._read_local_asset(asset.url),
            mime_type=asset.media_type,
            provider=result.run.steps[0].provider,
            model=result.run.steps[0].model,
            generation_parameters={
                "voice": self._tts_voice,
                "response_format": "mp3",
            },
            genblaze_provenance=json.loads(result.manifest.model_dump_json()),
        )

    @staticmethod
    def _read_local_asset(url: str) -> bytes:
        parsed = urlparse(url)
        if parsed.scheme != "file":
            raise ValueError(
                "Genblaze provider did not produce a local downloadable asset"
            )
        path = Path(unquote(parsed.path))
        return path.read_bytes()
