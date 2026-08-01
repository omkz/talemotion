from typing import TYPE_CHECKING

from app.media import RenderMediaGateway, SceneMediaGenerator, StoryboardGenerator
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import provider_entry

if TYPE_CHECKING:
    from app.core.config import AppConfig


class ProviderFactory:
    def __init__(self, config: "AppConfig") -> None:
        self.config = config

    def storyboard(
        self, selection: ProviderSelection
    ) -> StoryboardGenerator:
        entry = provider_entry(selection.capability, selection.provider)
        if (
            selection.capability is not ProviderCapability.STORYBOARD
            or entry.adapter_kind != "pydantic_ai"
        ):
            raise ValueError("A PydanticAI storyboard selection is required.")
        from app.providers.storyboard import PydanticAIStoryboardGenerator

        return PydanticAIStoryboardGenerator(
            self.config, selection=selection
        )

    def scene_media(
        self,
        selections: dict[ProviderCapability, ProviderSelection],
    ) -> SceneMediaGenerator:
        for capability in (ProviderCapability.IMAGE, ProviderCapability.VIDEO):
            selection = selections[capability]
            entry = provider_entry(capability, selection.provider)
            if entry.adapter_kind != "genblaze":
                raise ValueError("A Genblaze media selection is required.")
        from app.providers.media import GenblazeSceneGenerator

        return GenblazeSceneGenerator(self.config, selections)

    def render_media(
        self,
        selections: dict[ProviderCapability, ProviderSelection],
    ) -> RenderMediaGateway:
        for selection in selections.values():
            entry = provider_entry(
                selection.capability, selection.provider
            )
            if entry.adapter_kind != "genblaze":
                raise ValueError("A Genblaze audio selection is required.")
        from app.providers.media import GenblazeRenderMediaGateway

        return GenblazeRenderMediaGateway(self.config, selections)


def create_provider_factory(config: "AppConfig") -> ProviderFactory:
    return ProviderFactory(config)
