from __future__ import annotations

import mimetypes
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

import httpx
from genblaze_core import Asset
from genblaze_core.exceptions import ProviderError
from genblaze_core.models import VideoMetadata
from genblaze_core.models.enums import Modality, ProviderErrorCode
from genblaze_core.models.step import Step
from genblaze_core.pipeline.result import PipelineResult
from genblaze_core.providers import (
    BaseProvider,
    EnumSchema,
    IntSchema,
    ModelRegistry,
    ModelSpec,
    ProviderCapabilities,
    StringSchema,
    validate_asset_url,
    validate_chain_input_url,
)
from genblaze_core.runnable.config import RunnableConfig

from app.core.config import AppConfig
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import provider_entry
from app.providers.errors import ProviderError as TaleMotionProviderError
from app.providers.media.adapter import MediaProviderAdapter

IMAGE_MODEL = "wan2.6-t2i"
VIDEO_MODEL = "wan2.6-i2v-flash"
_IMAGE_SIZES = {"9:16": "960*1696", "16:9": "1696*960"}
_TERMINAL_STATUSES = frozenset({"SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"})
_ACTIVE_STATUSES = frozenset({"PENDING", "RUNNING"})


class QwenCloudProvider(BaseProvider):
    name = "qwencloud"
    poll_interval = 5.0

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        http_client: httpx.Client | None = None,
    ) -> None:
        super().__init__()
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=30.0)

    @classmethod
    def create_registry(cls) -> ModelRegistry:
        registry = ModelRegistry()
        registry.register(
            ModelSpec(
                model_id=IMAGE_MODEL,
                modality=Modality.IMAGE,
                param_schemas={
                    "prompt": StringSchema(min_len=1),
                    "aspect_ratio": EnumSchema(frozenset(_IMAGE_SIZES)),
                },
                param_required=frozenset({"prompt", "aspect_ratio"}),
                param_allowlist=frozenset(
                    {"prompt", "negative_prompt", "aspect_ratio"}
                ),
            )
        )
        registry.register(
            ModelSpec(
                model_id=VIDEO_MODEL,
                modality=Modality.VIDEO,
                param_schemas={
                    "prompt": StringSchema(min_len=1),
                    "duration": IntSchema(min=2, max=15),
                },
                param_required=frozenset({"prompt", "duration"}),
                param_allowlist=frozenset({"prompt", "duration"}),
            )
        )
        return registry

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            supported_modalities=[Modality.IMAGE, Modality.VIDEO],
            supported_inputs=["text", "image"],
            accepts_chain_input=True,
            models=[IMAGE_MODEL, VIDEO_MODEL],
            output_formats=["image/png", "image/jpeg", "video/mp4"],
        )

    def submit(
        self,
        step: Step,
        config: RunnableConfig | None = None,
    ) -> str:
        del config
        try:
            if step.modality is Modality.IMAGE and step.model == IMAGE_MODEL:
                response = self._submit_image(step)
            elif step.modality is Modality.VIDEO and step.model == VIDEO_MODEL:
                response = self._submit_video(step)
            else:
                raise ProviderError(
                    "QwenCloud does not support the selected model and modality.",
                    error_code=ProviderErrorCode.MODEL_ERROR,
                )
            task_id = _mapping(response.get("output")).get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise ProviderError(
                    "QwenCloud did not return a task ID.",
                    error_code=ProviderErrorCode.SERVER_ERROR,
                )
            return task_id
        except ProviderError:
            raise
        except httpx.TimeoutException as error:
            raise ProviderError(
                "QwenCloud request timed out.",
                error_code=ProviderErrorCode.TIMEOUT,
            ) from error
        except httpx.HTTPError as error:
            raise ProviderError(
                "QwenCloud request failed before receiving a valid response.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            ) from error

    def poll(
        self,
        prediction_id: Any,
        config: RunnableConfig | None = None,
    ) -> bool:
        del config
        payload = self._task(str(prediction_id))
        status = _task_status(payload)
        if status in _ACTIVE_STATUSES:
            return False
        if status in _TERMINAL_STATUSES:
            self._cache_poll_result(prediction_id, payload)
            return True
        raise ProviderError(
            f"QwenCloud returned an unrecognized task status: {status or '<empty>'}.",
            error_code=ProviderErrorCode.UNKNOWN,
        )

    def fetch_output(self, prediction_id: Any, step: Step) -> Step:
        payload = self._get_cached_poll_result(prediction_id)
        if payload is None:
            payload = self._task(str(prediction_id))
        status = _task_status(payload)
        output = _mapping(payload.get("output"))
        step.provider_payload = {
            "qwencloud": {
                "task_id": str(prediction_id),
                "task_status": status,
                "request_id": payload.get("request_id"),
                "usage": payload.get("usage"),
            }
        }
        if status != "SUCCEEDED":
            raise _failed_task_error(status, output)
        if step.modality is Modality.IMAGE:
            step.assets.append(_image_asset(output))
        elif step.modality is Modality.VIDEO:
            step.assets.append(_video_asset(output))
        else:
            raise ProviderError(
                "QwenCloud completed an unsupported output modality.",
                error_code=ProviderErrorCode.MODEL_ERROR,
            )
        self._apply_registry_pricing(step)
        return step

    def _submit_image(self, step: Step) -> dict[str, Any]:
        params = self.prepare_payload(step)
        aspect_ratio = str(params["aspect_ratio"])
        size = _IMAGE_SIZES.get(aspect_ratio)
        if size is None:
            raise ProviderError(
                f"QwenCloud image generation does not support {aspect_ratio}.",
                error_code=ProviderErrorCode.INVALID_INPUT,
            )
        payload = {
            "model": step.model,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": [{"text": str(params["prompt"])}],
                    }
                ]
            },
            "parameters": {
                "prompt_extend": True,
                "watermark": False,
                "n": 1,
                "negative_prompt": str(params.get("negative_prompt") or ""),
                "size": size,
            },
        }
        return self._request(
            "POST",
            "services/aigc/image-generation/generation",
            json=payload,
        )

    def _submit_video(self, step: Step) -> dict[str, Any]:
        params = self.prepare_payload(step)
        image = _single_image_input(step)
        validate_chain_input_url(image.url)
        payload = {
            "model": step.model,
            "input": {
                "prompt": str(params["prompt"]),
                "img_url": image.url,
            },
            "parameters": {
                "audio": False,
                "resolution": "720P",
                "prompt_extend": True,
                "watermark": False,
                "duration": params["duration"],
            },
        }
        return self._request(
            "POST",
            "services/aigc/video-generation/video-synthesis",
            json=payload,
        )

    def _task(self, task_id: str) -> dict[str, Any]:
        return self._request("GET", f"tasks/{task_id}")

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Mapping[str, object] | None = None,
    ) -> dict[str, Any]:
        try:
            response = self._client.request(
                method,
                f"{self._base_url}/{path}",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                    "X-DashScope-Async": "enable",
                },
                json=json,
                timeout=30.0,
            )
        except httpx.TimeoutException as error:
            raise ProviderError(
                "QwenCloud request timed out.",
                error_code=ProviderErrorCode.TIMEOUT,
            ) from error
        except httpx.HTTPError as error:
            raise ProviderError(
                "QwenCloud request failed before receiving a valid response.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            ) from error
        if response.is_error:
            raise _http_error(response)
        try:
            payload = response.json()
        except ValueError as error:
            raise ProviderError(
                "QwenCloud returned an invalid JSON response.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            ) from error
        if not isinstance(payload, dict):
            raise ProviderError(
                "QwenCloud returned an unexpected response shape.",
                error_code=ProviderErrorCode.SERVER_ERROR,
            )
        return payload


def create_qwencloud_image_adapter(
    config: AppConfig,
    selection: ProviderSelection,
) -> MediaProviderAdapter:
    _require_selection(selection, ProviderCapability.IMAGE)
    return MediaProviderAdapter(provider=_provider(config, selection))


def create_qwencloud_video_adapter(
    config: AppConfig,
    selection: ProviderSelection,
) -> MediaProviderAdapter:
    _require_selection(selection, ProviderCapability.VIDEO)
    return MediaProviderAdapter(
        provider=_provider(config, selection),
        inherit_parent_result=True,
        video_input_factory=_qwencloud_video_inputs,
    )


def _provider(config: AppConfig, selection: ProviderSelection) -> QwenCloudProvider:
    api_key = provider_entry(
        selection.capability, selection.provider
    ).credential(config)
    return QwenCloudProvider(
        api_key=api_key,
        base_url=config.dashscope_media_base_url,
    )


def _qwencloud_video_inputs(
    image_result: PipelineResult,
    signed_image_url: str,
) -> dict[str, object]:
    source = _result_image_asset(image_result)
    validate_chain_input_url(signed_image_url)
    return {
        "external_inputs": [
            Asset(
                url=signed_image_url,
                media_type=source.media_type,
                sha256=source.sha256,
            )
        ]
    }


def _result_image_asset(image_result: PipelineResult) -> Asset:
    for step in reversed(image_result.run.steps):
        for asset in reversed(step.assets):
            if asset.media_type.startswith("image/"):
                return asset
    raise TaleMotionProviderError(
        code="unsupported_parameters",
        message="QwenCloud video generation requires a completed image asset.",
        retryable=False,
    )


def _require_selection(
    selection: ProviderSelection,
    capability: ProviderCapability,
) -> None:
    if (
        selection.provider != "qwencloud"
        or selection.capability is not capability
    ):
        raise TaleMotionProviderError(
            code="unsupported_parameters",
            message=(
                "The QwenCloud adapter does not support the selected provider "
                f"and '{selection.capability.value}' capability combination."
            ),
            retryable=False,
        )


def _single_image_input(step: Step) -> Asset:
    images = [asset for asset in step.inputs if asset.media_type.startswith("image/")]
    if len(step.inputs) != 1 or len(images) != 1:
        raise ProviderError(
            "QwenCloud video generation requires exactly one image input.",
            error_code=ProviderErrorCode.INVALID_INPUT,
        )
    return images[0]


def _task_status(payload: Mapping[str, object]) -> str:
    status = _mapping(payload.get("output")).get("task_status")
    return str(status or "").upper()


def _mapping(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _image_asset(output: Mapping[str, object]) -> Asset:
    choices = output.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            message = _mapping(_mapping(choice).get("message"))
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for item in content:
                image_url = _mapping(item).get("image")
                if isinstance(image_url, str) and image_url:
                    validate_asset_url(image_url)
                    media_type, _ = mimetypes.guess_type(
                        urlparse(image_url).path
                    )
                    if not media_type or not media_type.startswith("image/"):
                        media_type = "image/png"
                    return Asset(url=image_url, media_type=media_type)
    raise ProviderError(
        "QwenCloud image task completed without an image URL.",
        error_code=ProviderErrorCode.SERVER_ERROR,
    )


def _video_asset(output: Mapping[str, object]) -> Asset:
    video_url = output.get("video_url")
    if not isinstance(video_url, str) or not video_url:
        raise ProviderError(
            "QwenCloud video task completed without a video URL.",
            error_code=ProviderErrorCode.SERVER_ERROR,
        )
    validate_asset_url(video_url)
    return Asset(
        url=video_url,
        media_type="video/mp4",
        video=VideoMetadata(has_audio=False, codec="h264"),
    )


def _failed_task_error(
    status: str,
    output: Mapping[str, object],
) -> ProviderError:
    code = str(output.get("code") or status or "UNKNOWN")
    message = str(output.get("message") or "The asynchronous task failed.")
    return ProviderError(
        f"QwenCloud task failed ({code}): {message}",
        error_code=_structured_error_code(code, message),
    )


def _http_error(response: httpx.Response) -> ProviderError:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    body = _mapping(payload)
    code = str(body.get("code") or f"HTTP_{response.status_code}")
    message = str(body.get("message") or "The provider request was rejected.")
    status_code = response.status_code
    if status_code in {401, 403}:
        error_code = ProviderErrorCode.AUTH_FAILURE
    elif status_code == 404:
        error_code = ProviderErrorCode.MODEL_ERROR
    elif status_code == 429:
        error_code = ProviderErrorCode.RATE_LIMIT
    elif status_code in {500, 502, 503, 504}:
        error_code = ProviderErrorCode.SERVER_ERROR
    elif status_code in {400, 402, 422}:
        error_code = _structured_error_code(code, message)
        if error_code is ProviderErrorCode.UNKNOWN:
            error_code = ProviderErrorCode.INVALID_INPUT
    else:
        error_code = _structured_error_code(code, message)
    return ProviderError(
        f"QwenCloud request failed ({code}): {message}",
        error_code=error_code,
    )


def _structured_error_code(code: str, message: str) -> ProviderErrorCode:
    text = f"{code} {message}".lower()
    if any(
        term in text
        for term in (
            "content_policy",
            "content policy",
            "datainspectionfailed",
            "inappropriate content",
            "safety",
        )
    ):
        return ProviderErrorCode.CONTENT_POLICY
    if any(term in text for term in ("insufficient", "quota", "credit")):
        return ProviderErrorCode.INVALID_INPUT
    if "model" in text and any(
        term in text for term in ("not found", "not exist", "unsupported")
    ):
        return ProviderErrorCode.MODEL_ERROR
    return ProviderErrorCode.UNKNOWN
