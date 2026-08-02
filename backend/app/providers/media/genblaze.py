from __future__ import annotations

import hashlib
import re
from collections.abc import Callable, Iterator
from typing import Literal

from genblaze_core import (
    Modality,
    ObjectStorageSink,
    Pipeline,
    StepCache,
)
from genblaze_core.exceptions import ProviderError
from genblaze_core.models.enums import ProviderErrorCode
from genblaze_core.pipeline.result import PipelineResult

from app.core.config import AppConfig
from app.media import SceneMediaError, StoredMediaArtifact
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import validate_selection
from app.providers.errors import ProviderError as TaleMotionProviderError
from app.providers.media.adapter import MediaProviderAdapter
from app.providers.media.registry import create_media_adapter
from app.schemas.scene_run import (
    SceneImageCompletedEvent,
    SceneImageProgressEvent,
    SceneImageStartedEvent,
    SceneRunAsset,
    SceneRunCompletedEvent,
    SceneRunEvent,
    SceneRunFailedEvent,
    SceneRunRequest,
    SceneRunStartedEvent,
    SceneVideoCompletedEvent,
    SceneVideoProgressEvent,
    SceneVideoStartedEvent,
)
from app.storage import MediaStorageGateway, create_media_storage

_SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9_-]+")


def _safe_segment(value: str) -> str:
    label = _SAFE_SEGMENT.sub("-", value).strip("-_")[:48] or "resource"
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return f"{label}-{digest}"


class GenblazeSceneGenerator:
    """Translate Genblaze pipelines into TaleMotion scene-run events."""

    def __init__(
        self,
        config: AppConfig,
        selections: dict[ProviderCapability, ProviderSelection] | None = None,
        storage: MediaStorageGateway | None = None,
        adapter_constructor: Callable[
            [AppConfig, ProviderSelection], MediaProviderAdapter
        ] = create_media_adapter,
    ) -> None:
        self.config = config
        self.storage = storage or create_media_storage(config)
        self.adapter_constructor = adapter_constructor
        resolved = selections or {
            capability: config.default_provider_selection(capability)
            for capability in (
                ProviderCapability.IMAGE,
                ProviderCapability.VIDEO,
            )
        }
        self.image_selection = resolved[ProviderCapability.IMAGE]
        self.video_selection = resolved[ProviderCapability.VIDEO]

    def run(
        self, request: SceneRunRequest, run_id: str
    ) -> Iterator[SceneRunEvent]:
        image: SceneRunAsset | None = None
        yield SceneRunStartedEvent(
            run_id=run_id,
            project_id=request.project_id,
            scene_id=request.scene_id,
        )
        try:
            if request.generate_video:
                validate_selection(
                    self.config,
                    self.video_selection,
                    aspect_ratio=request.aspect_ratio,
                    duration_seconds=request.duration_seconds,
                )
            validate_selection(
                self.config,
                self.image_selection,
                aspect_ratio=request.aspect_ratio,
            )
        except TaleMotionProviderError as error:
            yield self._failure(
                request,
                run_id,
                SceneMediaError(
                    code=error.code,
                    message=error.message,
                    retryable=error.retryable,
                ),
            )
            return
        try:
            self.storage.validate_configuration()
        except TaleMotionProviderError as error:
            yield self._failure(
                request,
                run_id,
                SceneMediaError(
                    code=error.code,
                    message=error.message,
                    retryable=error.retryable,
                ),
            )
            return

        prefix = self._run_prefix(request, run_id)
        try:
            yield SceneImageStartedEvent(
                run_id=run_id,
                project_id=request.project_id,
                scene_id=request.scene_id,
                model=self.image_selection.model,
            )
            image_pipeline = self._image_pipeline(request)
            image_result = yield from self._stream_pipeline(
                request=request,
                run_id=run_id,
                kind="image",
                pipeline=image_pipeline,
                sink=self.storage.sink(prefix),
            )
            image = self._asset_reference(
                image_result,
                kind="image",
                selection=self.image_selection,
                expected_prefix=prefix,
            )
            image_manifest, image_manifest_key = self._manifest_reference(
                image_result, expected_prefix=prefix
            )
            yield SceneImageCompletedEvent(
                run_id=run_id,
                project_id=request.project_id,
                scene_id=request.scene_id,
                asset=image,
                manifest_url=image_manifest,
                manifest_object_key=image_manifest_key,
            )

            if not request.generate_video:
                yield SceneRunCompletedEvent(
                    run_id=run_id,
                    project_id=request.project_id,
                    scene_id=request.scene_id,
                    image=image,
                    video=None,
                    manifest_url=image_manifest,
                    manifest_object_key=image_manifest_key,
                )
                return

            yield SceneVideoStartedEvent(
                run_id=run_id,
                project_id=request.project_id,
                scene_id=request.scene_id,
                model=self.video_selection.model,
            )
            image_key = self.storage.key_from_url(
                image.asset_url, expected_prefix=prefix
            )
            image_reference = self.storage.presign_preview(image_key)
            video_pipeline = self._video_pipeline(
                request, image_result, image_reference
            )
            video_result = yield from self._stream_pipeline(
                request=request,
                run_id=run_id,
                kind="video",
                pipeline=video_pipeline,
                sink=self.storage.sink(prefix),
            )
            video = self._asset_reference(
                video_result,
                kind="video",
                selection=self.video_selection,
                expected_prefix=prefix,
            )
            video_manifest, video_manifest_key = self._manifest_reference(
                video_result, expected_prefix=prefix
            )
            yield SceneVideoCompletedEvent(
                run_id=run_id,
                project_id=request.project_id,
                scene_id=request.scene_id,
                asset=video,
                manifest_url=video_manifest,
                manifest_object_key=video_manifest_key,
            )
            yield SceneRunCompletedEvent(
                run_id=run_id,
                project_id=request.project_id,
                scene_id=request.scene_id,
                image=image,
                video=video,
                manifest_url=video_manifest,
                manifest_object_key=video_manifest_key,
            )
        except Exception as error:
            yield self._failure(
                request,
                run_id,
                self._map_error(error),
                image=image,
            )

    def _image_pipeline(self, request: SceneRunRequest) -> Pipeline:
        adapter = self.adapter_constructor(self.config, self.image_selection)
        return (
            Pipeline(
                "talemotion-scene-keyframe",
                tenant_id=_safe_segment(request.project_id),
                project_id=request.project_id,
                max_concurrency=1,
            )
            .metadata(
                talemotion_scene_id=request.scene_id,
                aspect_ratio=request.aspect_ratio,
            )
            .cache(StepCache(self.config.genblaze_cache_dir))
            .step(
                adapter.provider,
                model=self.image_selection.model,
                prompt=request.visual_prompt,
                modality=Modality.IMAGE,
                aspect_ratio=request.aspect_ratio,
            )
        )

    def _video_pipeline(
        self,
        request: SceneRunRequest,
        image_result: PipelineResult,
        image_reference: str,
    ) -> Pipeline:
        adapter = self.adapter_constructor(self.config, self.video_selection)
        pipeline = Pipeline(
            "talemotion-scene-animation",
            tenant_id=_safe_segment(request.project_id),
            project_id=request.project_id,
            max_concurrency=1,
        )
        if adapter.inherit_parent_result:
            pipeline = pipeline.from_result(image_result)
        return pipeline.metadata(
            talemotion_scene_id=request.scene_id,
            aspect_ratio=request.aspect_ratio,
        ).step(
            adapter.provider,
            model=self.video_selection.model,
            prompt=request.visual_prompt,
            modality=Modality.VIDEO,
            duration=request.duration_seconds,
            aspect_ratio=request.aspect_ratio,
            **adapter.video_inputs(
                image_result=image_result,
                signed_image_url=image_reference,
            ),
        )

    def _stream_pipeline(
        self,
        *,
        request: SceneRunRequest,
        run_id: str,
        kind: Literal["image", "video"],
        pipeline: Pipeline,
        sink: ObjectStorageSink,
    ) -> Iterator[SceneRunEvent]:
        result: PipelineResult | None = None
        for event in pipeline.stream(sink=sink, timeout=600):
            if event.type == "step.progress":
                progress = (
                    event.progress_pct * 100
                    if event.progress_pct is not None
                    else None
                )
                event_type = (
                    SceneImageProgressEvent
                    if kind == "image"
                    else SceneVideoProgressEvent
                )
                yield event_type(
                    run_id=run_id,
                    project_id=request.project_id,
                    scene_id=request.scene_id,
                    progress=progress,
                    elapsed_seconds=event.elapsed_sec,
                    message=(
                        "The media provider is generating the scene keyframe."
                        if kind == "image"
                        else "The media provider is animating the scene keyframe."
                    ),
                )
            elif event.type in {"pipeline.completed", "pipeline.failed"}:
                result = event.result
                if event.type == "pipeline.failed":
                    raise self._pipeline_failure(result)
        if result is None:
            raise SceneMediaError(
                code="provider_generation_failed",
                message="The media provider ended without a completed result.",
                retryable=True,
            )
        return result

    def _asset_reference(
        self,
        result: PipelineResult,
        *,
        kind: Literal["image", "video"],
        selection: ProviderSelection,
        expected_prefix: str,
    ) -> SceneRunAsset:
        steps = result.run.steps
        asset = steps[-1].assets[0] if steps and steps[-1].assets else None
        if asset is None or not asset.url or not asset.sha256:
            raise SceneMediaError(
                code="storage_failed",
                message="Genblaze did not return a durable, hashed B2 asset.",
                retryable=True,
            )
        key = self.storage.key_from_url(
            asset.url, expected_prefix=expected_prefix
        )
        return SceneRunAsset(
            kind=kind,
            media_type=asset.media_type,
            asset_url=asset.url,
            sha256=asset.sha256,
            storage_object_key=key,
            file_size_bytes=asset.size_bytes,
            provider=selection.provider,
            model=selection.model,
        )

    def _manifest_reference(
        self, result: PipelineResult, *, expected_prefix: str
    ) -> tuple[str, str]:
        manifest_url = result.manifest.manifest_uri
        if not manifest_url:
            raise SceneMediaError(
                code="storage_failed",
                message="Genblaze did not persist a provenance manifest.",
                retryable=True,
            )
        return (
            manifest_url,
            self.storage.key_from_url(
                manifest_url,
                expected_prefix=expected_prefix,
            ),
        )

    def _run_prefix(self, request: SceneRunRequest, run_id: str) -> str:
        return (
            f"talemotion/projects/{_safe_segment(request.project_id)}"
            f"/scenes/{_safe_segment(request.scene_id)}/runs/{run_id}"
        )

    def _pipeline_failure(
        self, result: PipelineResult | None
    ) -> SceneMediaError:
        step = result.failed_steps()[0] if result and result.failed_steps() else None
        error_code = step.error_code if step is not None else None
        if error_code is ProviderErrorCode.AUTH_FAILURE:
            return SceneMediaError(
                "provider_authentication_failed",
                "The configured media provider rejected the credentials.",
                False,
            )
        if error_code is ProviderErrorCode.RATE_LIMIT:
            return SceneMediaError(
                "provider_rate_limited",
                "The media provider rate limit was reached.",
                True,
            )
        if error_code is ProviderErrorCode.TIMEOUT:
            return SceneMediaError(
                "provider_timeout",
                "The media provider did not respond before the timeout.",
                True,
            )
        return SceneMediaError(
            "provider_generation_failed",
            "The media provider could not generate this scene.",
            error_code
            in {
                ProviderErrorCode.TIMEOUT,
                ProviderErrorCode.SERVER_ERROR,
                ProviderErrorCode.UNKNOWN,
            },
        )

    def _map_error(self, error: Exception) -> SceneMediaError:
        if isinstance(error, SceneMediaError):
            return error
        storage_error = self.storage.map_error(error)
        if storage_error is not None:
            return storage_error
        if isinstance(error, TimeoutError):
            return SceneMediaError(
                "provider_timeout",
                "The media provider did not respond before the timeout.",
                True,
            )
        if isinstance(error, ProviderError):
            if error.error_code is ProviderErrorCode.AUTH_FAILURE:
                return SceneMediaError(
                    "provider_authentication_failed",
                    "The configured media provider rejected the credentials.",
                    False,
                )
            if error.error_code is ProviderErrorCode.RATE_LIMIT:
                return SceneMediaError(
                    "provider_rate_limited",
                    "The media provider rate limit was reached.",
                    True,
                )
            if error.error_code is ProviderErrorCode.TIMEOUT:
                return SceneMediaError(
                    "provider_timeout",
                    "The media provider did not respond before the timeout.",
                    True,
                )
            return SceneMediaError(
                "provider_generation_failed",
                "The media provider could not generate this scene.",
                error.error_code
                in {
                    ProviderErrorCode.TIMEOUT,
                    ProviderErrorCode.SERVER_ERROR,
                    ProviderErrorCode.UNKNOWN,
                },
            )
        return SceneMediaError(
            "provider_generation_failed",
            "The media provider could not generate this scene.",
            True,
        )

    def _failure(
        self,
        request: SceneRunRequest,
        run_id: str,
        error: SceneMediaError,
        *,
        image: SceneRunAsset | None = None,
    ) -> SceneRunFailedEvent:
        return SceneRunFailedEvent(
            run_id=run_id,
            project_id=request.project_id,
            scene_id=request.scene_id,
            code=error.code,
            message=error.message,
            retryable=error.retryable,
            image=image,
        )

class GenblazeRenderMediaGateway:
    """Generate render audio and move render artifacts through genblaze-s3."""

    def __init__(
        self,
        config: AppConfig,
        selections: dict[ProviderCapability, ProviderSelection] | None = None,
        storage: MediaStorageGateway | None = None,
        adapter_constructor: Callable[
            [AppConfig, ProviderSelection], MediaProviderAdapter
        ] = create_media_adapter,
    ) -> None:
        self.config = config
        self.selections = selections or {}
        self.storage = storage or create_media_storage(config)
        self.adapter_constructor = adapter_constructor

    def download(self, key: str) -> bytes:
        return self.storage.download(key)

    def upload(
        self,
        *,
        key: str,
        data: bytes,
        media_type: str,
    ) -> StoredMediaArtifact:
        stored = self.storage.upload(
            key=key,
            data=data,
            media_type=media_type,
        )
        return StoredMediaArtifact(
            storage_object_key=stored.storage_object_key,
            media_type=stored.media_type,
            file_size_bytes=stored.file_size_bytes,
            sha256=stored.sha256,
            provider="talemotion",
            model="ffmpeg" if media_type == "video/mp4" else "generated",
        )

    def generate_narration(
        self,
        *,
        project_id: str,
        scene_id: str,
        text: str,
    ) -> StoredMediaArtifact:
        selection = self.selections.get(ProviderCapability.TTS) or (
            self.config.default_provider_selection(ProviderCapability.TTS)
        )
        self._validate_audio_selection(selection)
        adapter = self.adapter_constructor(self.config, selection)
        prefix = (
            f"talemotion/projects/{_safe_segment(project_id)}/audio/scenes/"
            f"{_safe_segment(scene_id)}"
        )
        pipeline = (
            Pipeline(
                "talemotion-scene-narration",
                tenant_id=_safe_segment(project_id),
                project_id=project_id,
                max_concurrency=1,
            )
            .metadata(talemotion_scene_id=scene_id, purpose="narration")
            .cache(StepCache(self.config.genblaze_cache_dir))
            .step(
                adapter.provider,
                model=selection.model,
                prompt=text,
                modality=Modality.AUDIO,
                **(
                    {"voice": self.config.talemotion_tts_voice}
                    if self.config.talemotion_tts_voice
                    else {}
                ),
            )
        )
        return self._run_audio(
            pipeline,
            prefix=prefix,
            selection=selection,
        )

    def generate_music(
        self,
        *,
        project_id: str,
        prompt: str,
        duration_seconds: int,
    ) -> StoredMediaArtifact:
        selection = self.selections.get(ProviderCapability.MUSIC) or (
            self.config.default_provider_selection(ProviderCapability.MUSIC)
        )
        self._validate_audio_selection(selection)
        adapter = self.adapter_constructor(self.config, selection)
        prefix = f"talemotion/projects/{_safe_segment(project_id)}/music"
        pipeline = (
            Pipeline(
                "talemotion-project-music",
                tenant_id=_safe_segment(project_id),
                project_id=project_id,
                max_concurrency=1,
            )
            .metadata(purpose="background_music")
            .cache(StepCache(self.config.genblaze_cache_dir))
            .step(
                adapter.provider,
                model=selection.model,
                prompt=prompt,
                modality=Modality.AUDIO,
                duration_seconds=duration_seconds,
            )
        )
        return self._run_audio(
            pipeline,
            prefix=prefix,
            selection=selection,
        )

    def _run_audio(
        self,
        pipeline: Pipeline,
        *,
        prefix: str,
        selection: ProviderSelection,
    ) -> StoredMediaArtifact:
        try:
            result = pipeline.run(
                sink=self.storage.sink(prefix), timeout=600
            )
            step_asset = (
                result.run.steps[-1].assets[0]
                if result.run.steps and result.run.steps[-1].assets
                else None
            )
            if (
                step_asset is None
                or not step_asset.url
                or not step_asset.sha256
            ):
                raise SceneMediaError(
                    "storage_failed",
                    "Genblaze did not return a durable audio asset.",
                    True,
                )
            key = self.storage.key_from_url(
                step_asset.url,
                expected_prefix=prefix,
            )
            _, manifest_key = self._manifest_reference(
                result,
                expected_prefix=prefix,
            )
            return StoredMediaArtifact(
                storage_object_key=key,
                media_type=step_asset.media_type or "audio/mpeg",
                file_size_bytes=step_asset.size_bytes or 0,
                sha256=step_asset.sha256,
                provider=selection.provider,
                model=selection.model,
                manifest_object_key=manifest_key,
            )
        except SceneMediaError:
            raise
        except Exception as error:
            mapped = self._map_error(error)
            raise mapped from error

    def _manifest_reference(
        self, result: PipelineResult, *, expected_prefix: str
    ) -> tuple[str, str]:
        manifest_url = result.manifest.manifest_uri
        if not manifest_url:
            raise SceneMediaError(
                "storage_failed",
                "Genblaze did not persist a provenance manifest.",
                True,
            )
        return (
            manifest_url,
            self.storage.key_from_url(
                manifest_url,
                expected_prefix=expected_prefix,
            ),
        )

    def _map_error(self, error: Exception) -> SceneMediaError:
        if isinstance(error, SceneMediaError):
            return error
        storage_error = self.storage.map_error(error)
        if storage_error is not None:
            return storage_error
        if isinstance(error, TimeoutError):
            return SceneMediaError(
                "provider_timeout",
                "The media provider did not respond before the timeout.",
                True,
            )
        if isinstance(error, ProviderError):
            if error.error_code is ProviderErrorCode.AUTH_FAILURE:
                return SceneMediaError(
                    "provider_authentication_failed",
                    "The configured media provider rejected the credentials.",
                    False,
                )
            if error.error_code is ProviderErrorCode.RATE_LIMIT:
                return SceneMediaError(
                    "provider_rate_limited",
                    "The media provider rate limit was reached.",
                    True,
                )
            return SceneMediaError(
                "provider_generation_failed",
                "The media provider could not generate audio.",
                error.error_code
                in {
                    ProviderErrorCode.TIMEOUT,
                    ProviderErrorCode.SERVER_ERROR,
                    ProviderErrorCode.UNKNOWN,
                },
            )
        return SceneMediaError(
            "provider_generation_failed",
            "The media provider could not generate audio.",
            True,
        )

    def _validate_audio_selection(
        self, selection: ProviderSelection
    ) -> None:
        try:
            validate_selection(self.config, selection)
        except TaleMotionProviderError as error:
            raise SceneMediaError(
                error.code, error.message, error.retryable
            ) from error
        try:
            self.storage.validate_configuration()
        except TaleMotionProviderError as error:
            raise SceneMediaError(
                error.code, error.message, error.retryable
            ) from error
