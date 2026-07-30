from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from dataclasses import replace
from typing import Literal
from urllib.parse import unquote, urlparse

from genblaze_core import (
    KeyStrategy,
    Modality,
    ObjectStorageSink,
    Pipeline,
    StepCache,
)
from genblaze_core.exceptions import ProviderError, SinkError
from genblaze_core.models.enums import ProviderErrorCode
from genblaze_core.pipeline.result import PipelineResult
from genblaze_core.storage.errors import StorageError
from genblaze_gmicloud import (
    GMICloudImageProvider,
    GMICloudVideoProvider,
    chat,
)
from genblaze_s3 import S3StorageBackend

from app.core.config import AppConfig
from app.media import SceneMediaError
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
from app.schemas.storyboard import HistoricalStoryboardDraft

_SAFE_SEGMENT = re.compile(r"[^a-zA-Z0-9_-]+")


def _safe_segment(value: str) -> str:
    label = _SAFE_SEGMENT.sub("-", value).strip("-_")[:48] or "resource"
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return f"{label}-{digest}"


class GenblazeSceneGenerator:
    """Translate Genblaze pipelines into TaleMotion scene-run events."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config

    def run(
        self, request: SceneRunRequest, run_id: str
    ) -> Iterator[SceneRunEvent]:
        image: SceneRunAsset | None = None
        yield SceneRunStartedEvent(
            run_id=run_id,
            project_id=request.project_id,
            scene_id=request.scene_id,
        )
        if (
            request.generate_video
            and request.duration_seconds
            not in self.config.supported_video_durations
        ):
            supported = sorted(self.config.supported_video_durations)
            yield self._failure(
                request,
                run_id,
                SceneMediaError(
                    code="invalid_request",
                    message=(
                        f"{self.config.talemotion_video_model} supports configured "
                        f"durations: {supported} seconds."
                    ),
                    retryable=False,
                ),
            )
            return
        missing = self.config.missing_media_configuration()
        if missing:
            yield self._failure(
                request,
                run_id,
                SceneMediaError(
                    code="missing_configuration",
                    message=(
                        "Real scene generation is not configured. "
                        f"Missing: {', '.join(missing)}."
                    ),
                    retryable=False,
                ),
            )
            return

        prefix = self._run_prefix(request, run_id)
        try:
            yield SceneImageStartedEvent(
                run_id=run_id,
                project_id=request.project_id,
                scene_id=request.scene_id,
                model=self.config.talemotion_image_model,
            )
            image_pipeline = self._image_pipeline(request)
            image_result = yield from self._stream_pipeline(
                request=request,
                run_id=run_id,
                kind="image",
                pipeline=image_pipeline,
                sink=self._sink(prefix),
            )
            image = self._asset_reference(
                image_result,
                kind="image",
                model=self.config.talemotion_image_model,
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
                model=self.config.talemotion_video_model,
            )
            image_key = self._key_from_url(
                image.asset_url, expected_prefix=prefix
            )
            image_reference = self._signed_url(image_key)
            video_pipeline = self._video_pipeline(
                request, image_result, image_reference
            )
            video_result = yield from self._stream_pipeline(
                request=request,
                run_id=run_id,
                kind="video",
                pipeline=video_pipeline,
                sink=self._sink(prefix),
            )
            video = self._asset_reference(
                video_result,
                kind="video",
                model=self.config.talemotion_video_model,
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

    def presign_preview(self, key: str) -> str:
        if not key.startswith("talemotion/"):
            raise ValueError("Media key is outside the TaleMotion prefix.")
        return self._signed_url(key)

    def _image_pipeline(self, request: SceneRunRequest) -> Pipeline:
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
                GMICloudImageProvider(api_key=self._secret("gmi_api_key")),
                model=self.config.talemotion_image_model,
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
        provider = GMICloudVideoProvider(
            api_key=self._secret("gmi_api_key"),
            models=self._video_registry(),
        )
        return (
            Pipeline(
                "talemotion-scene-animation",
                tenant_id=_safe_segment(request.project_id),
                project_id=request.project_id,
                max_concurrency=1,
            )
            .from_result(image_result)
            .metadata(
                talemotion_scene_id=request.scene_id,
                aspect_ratio=request.aspect_ratio,
            )
            .step(
                provider,
                model=self.config.talemotion_video_model,
                prompt=request.visual_prompt,
                modality=Modality.VIDEO,
                duration=request.duration_seconds,
                aspect_ratio=request.aspect_ratio,
                image=image_reference,
            )
        )

    def _video_registry(self):
        registry = GMICloudVideoProvider.models_default().fork()
        model = self.config.talemotion_video_model
        if model.startswith("wan") and model.endswith("-i2v"):
            base = registry.get(model)
            registry.register(
                replace(
                    base,
                    model_id=model,
                    param_aliases={**base.param_aliases, "image": "img_url"},
                )
            )
        return registry

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
                        "GMICloud is generating the scene keyframe."
                        if kind == "image"
                        else "GMICloud is animating the scene keyframe."
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
        model: str,
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
        key = self._key_from_url(asset.url, expected_prefix=expected_prefix)
        return SceneRunAsset(
            kind=kind,
            media_type=asset.media_type,
            asset_url=asset.url,
            sha256=asset.sha256,
            storage_object_key=key,
            file_size_bytes=asset.size_bytes,
            model=model,
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
            self._key_from_url(
                manifest_url,
                expected_prefix=expected_prefix,
            ),
        )

    def _sink(self, prefix: str) -> ObjectStorageSink:
        return ObjectStorageSink(
            self._backend(),
            prefix=prefix,
            key_strategy=KeyStrategy.HIERARCHICAL,
        )

    def _backend(self) -> S3StorageBackend:
        return S3StorageBackend.for_backblaze(
            self.config.b2_bucket_name,
            region=self.config.b2_region,
            key_id=self._secret("b2_key_id"),
            app_key=self._secret("b2_application_key"),
            auto_lifecycle=False,
        )

    def _signed_url(self, key: str) -> str:
        backend = self._backend()
        try:
            return backend.get_url(
                key, expires_in=self.config.media_preview_ttl_seconds
            )
        finally:
            backend.close()

    def _key_from_url(self, url: str, *, expected_prefix: str) -> str:
        path = unquote(urlparse(url).path).lstrip("/")
        bucket = self.config.b2_bucket_name or ""
        if bucket and path.startswith(f"{bucket}/"):
            path = path[len(bucket) + 1 :]
        prefix_at = path.find(f"{expected_prefix}/")
        if prefix_at >= 0:
            path = path[prefix_at:]
        if not path.startswith(f"{expected_prefix}/"):
            raise SceneMediaError(
                code="storage_failed",
                message="The stored asset is outside its TaleMotion run prefix.",
                retryable=False,
            )
        return path

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
                "The media provider could not generate this scene.",
                error.error_code
                in {
                    ProviderErrorCode.TIMEOUT,
                    ProviderErrorCode.SERVER_ERROR,
                    ProviderErrorCode.UNKNOWN,
                },
            )
        if isinstance(error, (StorageError, SinkError)):
            return SceneMediaError(
                "storage_failed",
                "The generated media could not be stored in Backblaze B2.",
                True,
            )
        return SceneMediaError(
            "unknown_error",
            "Scene generation failed unexpectedly.",
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

    def _secret(self, field: str) -> str:
        value = getattr(self.config, field)
        if value is None:
            raise SceneMediaError(
                "missing_configuration",
                "Real scene generation is not configured.",
                False,
            )
        return value.get_secret_value()


class GenblazeStoryboardGenerator:
    """Generate TaleMotion storyboard JSON through a Genblaze chat connector."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config

    def generate(
        self,
        *,
        topic: str,
        additional_direction: str,
        historical_accuracy_note: str | None,
        visual_style: str,
        duration_seconds: int,
    ) -> HistoricalStoryboardDraft:
        missing = self.config.missing_storyboard_configuration()
        if missing:
            raise SceneMediaError(
                "missing_configuration",
                "Storyboard generation is not configured. "
                f"Missing: {', '.join(missing)}.",
                False,
            )
        prompt = self._prompt(
            topic=topic,
            additional_direction=additional_direction,
            historical_accuracy_note=historical_accuracy_note,
            visual_style=visual_style,
            duration_seconds=duration_seconds,
        )
        try:
            response = chat(
                self.config.talemotion_storyboard_model or "",
                prompt=prompt,
                system=(
                    "You are TaleMotion's historical storyboard planner. "
                    "Return only the requested structured storyboard."
                ),
                response_format=HistoricalStoryboardDraft,
                temperature=0.4,
                max_tokens=3000,
                api_key=self._gmi_key(),
                timeout=120,
            )
            return HistoricalStoryboardDraft.model_validate_json(response.text)
        except SceneMediaError:
            raise
        except Exception as error:
            mapped = GenblazeSceneGenerator(self.config)._map_error(error)
            raise mapped from error

    def _gmi_key(self) -> str:
        if self.config.gmi_api_key is None:
            raise SceneMediaError(
                "missing_configuration",
                "Storyboard generation is not configured.",
                False,
            )
        return self.config.gmi_api_key.get_secret_value()

    @staticmethod
    def _prompt(
        *,
        topic: str,
        additional_direction: str,
        historical_accuracy_note: str | None,
        visual_style: str,
        duration_seconds: int,
    ) -> str:
        return f"""
Create exactly four scenes for a {duration_seconds}-second vertical historical
documentary about: {topic}

Additional direction: {additional_direction or "None"}
Historical accuracy note: {historical_accuracy_note or "None"}
Visual style: {visual_style}

Each scene needs a concise title, narration, a production-ready visual prompt,
duration_seconds, and position. Positions must be exactly 1, 2, 3, 4, and the
durations should total {duration_seconds} seconds (within two seconds).

Historical and visual requirements:
- historically plausible Southeast Asian architecture, landscapes, clothing,
  weapons, trade goods, and social context;
- Majapahit-era maritime culture and Southeast Asian jong ships when relevant;
- no European ships, clothing, or architecture unless the topic and period
  historically justify their presence;
- one consistent cinematic style across all four scenes;
- strong vertical 9:16 composition with clear foreground, middle ground, and
  background;
- narration must make a coherent factual progression without claiming
  certainty where evidence is disputed.
""".strip()
