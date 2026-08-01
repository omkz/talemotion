from collections.abc import Callable, Mapping
from dataclasses import dataclass

from genblaze_core.pipeline.result import PipelineResult
from genblaze_core.providers import BaseProvider

VideoInputFactory = Callable[[PipelineResult, str], Mapping[str, object]]


@dataclass(frozen=True, slots=True)
class MediaProviderAdapter:
    provider: BaseProvider
    inherit_parent_result: bool = False
    video_input_factory: VideoInputFactory | None = None

    def video_inputs(
        self,
        *,
        image_result: PipelineResult,
        signed_image_url: str,
    ) -> Mapping[str, object]:
        if self.video_input_factory is None:
            return {}
        return self.video_input_factory(image_result, signed_image_url)
