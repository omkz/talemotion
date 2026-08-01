from typing import TYPE_CHECKING

from app.media import RenderMediaGateway, SceneMediaGenerator, StoryboardGenerator
from app.providers import ProviderCapability, ProviderError, ProviderSelection
from app.providers.catalog import provider_entry

if TYPE_CHECKING:
    from app.core.config import AppConfig


class ProviderFactory:
    def __init__(self, config: "AppConfig") -> None:
        self.config = config

    def storyboard(
        self, selection: ProviderSelection
    ) -> StoryboardGenerator:
        _validate_factory_selection(
            selection,
            capability=ProviderCapability.STORYBOARD,
            adapter_kind="pydantic_ai",
        )
        from app.providers.storyboard import PydanticAIStoryboardGenerator

        return PydanticAIStoryboardGenerator(
            self.config, selection=selection
        )

    def scene_media(
        self,
        selections: dict[ProviderCapability, ProviderSelection],
    ) -> SceneMediaGenerator:
        for capability in (ProviderCapability.IMAGE, ProviderCapability.VIDEO):
            _validate_factory_selection(
                selections[capability],
                capability=capability,
                adapter_kind="genblaze",
            )
        from app.providers.media import GenblazeSceneGenerator

        return GenblazeSceneGenerator(self.config, selections)

    def render_media(
        self,
        selections: dict[ProviderCapability, ProviderSelection],
    ) -> RenderMediaGateway:
        for capability in (ProviderCapability.TTS, ProviderCapability.MUSIC):
            if capability not in selections:
                continue
            _validate_factory_selection(
                selections[capability],
                capability=capability,
                adapter_kind="genblaze",
            )
        from app.providers.media import GenblazeRenderMediaGateway

        return GenblazeRenderMediaGateway(self.config, selections)


def create_provider_factory(config: "AppConfig") -> ProviderFactory:
    return ProviderFactory(config)


def _validate_factory_selection(
    selection: ProviderSelection,
    *,
    capability: ProviderCapability,
    adapter_kind: str,
) -> None:
    if selection.capability is not capability:
        raise ProviderError(
            "unsupported_parameters",
            "The provider selection capability does not match the operation.",
            False,
        )
    entry = provider_entry(capability, selection.provider)
    if entry.adapter_kind != adapter_kind:
        raise ProviderError(
            "unsupported_parameters",
            "The selected provider adapter does not support this operation.",
            False,
        )
