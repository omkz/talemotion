from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import ValidationError
from pydantic_ai import Agent, ModelSettings
from pydantic_ai.exceptions import (
    ModelAPIError,
    ModelHTTPError,
    UnexpectedModelBehavior,
    UserError,
)
from pydantic_ai.models import Model, infer_model
from pydantic_ai.providers import Provider, infer_provider_class

from app.core.config import AppConfig
from app.media import SceneMediaError, StoryboardGenerator
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import provider_entry, validate_selection
from app.providers.errors import ProviderError
from app.schemas.storyboard import HistoricalStoryboardDraft

SYSTEM_PROMPT = (
    "You are TaleMotion's historical storyboard planner. "
    "Return a historically grounded four-scene storyboard matching the "
    "required structured output."
)


def resolved_storyboard_model(config: AppConfig) -> str:
    selection = config.default_provider_selection(
        ProviderCapability.STORYBOARD
    )
    return f"{selection.provider}:{selection.model}"


def build_storyboard_prompt(
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
durations must total {duration_seconds} seconds within two seconds.

Historical and visual requirements:
- historically plausible architecture, landscapes, clothing, weapons, trade
  goods, and social context;
- Southeast Asian and Majapahit maritime culture when relevant, including
  Southeast Asian jong ships when relevant;
- no European ships, clothing, or architecture unless the topic and period
  historically justify their presence;
- one consistent cinematic style across all four scenes;
- strong vertical 9:16 composition with clear foreground, middle ground, and
  background;
- narration must form a coherent factual progression and avoid false certainty
  where historical evidence is disputed.
""".strip()


def _configured_model(
    config: AppConfig, selection: ProviderSelection
) -> Model:
    identifier = f"{selection.provider}:{selection.model}"
    api_key = provider_entry(
        selection.capability, selection.provider
    ).credential(config)

    def provider_factory(name: str) -> Provider[Any]:
        provider_class = infer_provider_class(name)
        return provider_class(api_key=api_key)  # type: ignore[call-arg]

    return infer_model(identifier, provider_factory=provider_factory)


def _caused_by_timeout(error: BaseException) -> bool:
    current: BaseException | None = error
    while current is not None:
        if isinstance(current, TimeoutError):
            return True
        current = current.__cause__ or current.__context__
    return False


def map_storyboard_error(error: Exception) -> SceneMediaError:
    if isinstance(error, SceneMediaError):
        return error
    if isinstance(error, ModelHTTPError):
        if error.status_code in {401, 403}:
            return SceneMediaError(
                "provider_authentication_failed",
                "The storyboard provider rejected its configured credentials.",
                False,
            )
        if error.status_code == 429:
            return SceneMediaError(
                "provider_rate_limited",
                "The storyboard provider rate limit was reached.",
                True,
            )
        if error.status_code in {408, 504}:
            return SceneMediaError(
                "provider_timeout",
                "The storyboard provider timed out.",
                True,
            )
        return SceneMediaError(
            "provider_generation_failed",
            "The storyboard provider could not generate the storyboard.",
            error.status_code >= 500,
        )
    if isinstance(error, ModelAPIError) and _caused_by_timeout(error):
        return SceneMediaError(
            "provider_timeout",
            "The storyboard provider timed out.",
            True,
        )
    if isinstance(error, (UnexpectedModelBehavior, ValidationError)):
        return SceneMediaError(
            "invalid_storyboard_output",
            "The storyboard provider returned invalid structured output.",
            True,
        )
    if isinstance(error, UserError):
        return SceneMediaError(
            "missing_configuration",
            "Storyboard generation configuration is invalid.",
            False,
        )
    if isinstance(error, TimeoutError):
        return SceneMediaError(
            "provider_timeout",
            "The storyboard provider timed out.",
            True,
        )
    return SceneMediaError(
        "provider_generation_failed",
        "The storyboard provider could not generate the storyboard.",
        True,
    )


class PydanticAIStoryboardGenerator:
    def __init__(
        self,
        config: AppConfig,
        *,
        selection: ProviderSelection | None = None,
        model: Model | None = None,
        agent_factory: Callable[..., Agent[Any, HistoricalStoryboardDraft]] = Agent,
    ) -> None:
        self.config = config
        self.selection = selection or config.default_provider_selection(
            ProviderCapability.STORYBOARD
        )
        if self.selection.capability is not ProviderCapability.STORYBOARD:
            raise ValueError("A storyboard provider selection is required.")
        self.model = model
        self.agent_factory = agent_factory

    def generate(
        self,
        *,
        topic: str,
        additional_direction: str,
        historical_accuracy_note: str | None,
        visual_style: str,
        duration_seconds: int,
    ) -> HistoricalStoryboardDraft:
        if self.model is None:
            try:
                validate_selection(self.config, self.selection)
            except ProviderError as error:
                raise SceneMediaError(
                    error.code, error.message, error.retryable
                ) from error
        try:
            agent = self.agent_factory(
                self.model or _configured_model(self.config, self.selection),
                output_type=HistoricalStoryboardDraft,
                system_prompt=SYSTEM_PROMPT,
                model_settings=ModelSettings(
                    temperature=0.4,
                    max_tokens=3000,
                    timeout=120,
                ),
                retries=0,
            )
            result = agent.run_sync(
                build_storyboard_prompt(
                    topic=topic,
                    additional_direction=additional_direction,
                    historical_accuracy_note=historical_accuracy_note,
                    visual_style=visual_style,
                    duration_seconds=duration_seconds,
                )
            )
            return result.output
        except Exception as error:
            raise map_storyboard_error(error) from error


def create_storyboard_generator(
    config: AppConfig,
    selection: ProviderSelection | None = None,
) -> StoryboardGenerator:
    return PydanticAIStoryboardGenerator(config, selection=selection)
