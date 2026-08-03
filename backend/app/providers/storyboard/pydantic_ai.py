from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
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
from app.models.project import ContentType
from app.providers import ProviderCapability, ProviderSelection
from app.providers.catalog import provider_entry, validate_selection
from app.providers.errors import ProviderError
from app.schemas.storyboard import (
    HistoricalStoryboardDraft,
    StoryboardProjectSnapshot,
)

SYSTEM_PROMPT = (
    "You are TaleMotion's historical storyboard planner. "
    "Return a historically grounded four-scene storyboard matching the "
    "required structured output."
)


@dataclass(frozen=True, slots=True)
class StoryApproachGuidance:
    goal: str
    scene_progression: tuple[str, str, str, str]
    narration_guidance: tuple[str, ...]
    visual_guidance: tuple[str, ...]
    ending_requirement: str


_STORY_APPROACHES: dict[ContentType, StoryApproachGuidance] = {
    ContentType.DOCUMENTARY: StoryApproachGuidance(
        goal=(
            "Create a scene-driven historical narrative that makes the event "
            "engaging while remaining factually cautious."
        ),
        scene_progression=(
            "Strong visual hook and historical situation",
            "Main tension, conflict, or challenge",
            "Turning point, reversal, or decisive development",
            "Aftermath and lasting historical significance",
        ),
        narration_guidance=(
            "Be engaging and atmospheric.",
            "Drive the narrative through events, people, and consequences.",
            "Remain historically cautious.",
            "Do not invent dialogue, certainty, or spectacle unsupported by "
            "the brief.",
            "Respect the separately requested tone.",
        ),
        visual_guidance=(
            "Use cinematic establishing imagery.",
            "Show people, environments, action, and historically meaningful "
            "details.",
            "Make the visual progression reinforce tension and consequence.",
            "Avoid generic repeated shots.",
        ),
        ending_requirement=(
            "End with the event's consequence, legacy, or historical "
            "significance."
        ),
    ),
    ContentType.EDUCATIONAL: StoryApproachGuidance(
        goal=(
            "Help the target audience clearly understand the historical "
            "topic."
        ),
        scene_progression=(
            "Introduce the topic and what the viewer will understand",
            "Establish essential context, actors, place, and chronology",
            "Explain the key event, development, or relationship",
            "Summarize the consequences and main learning takeaway",
        ),
        narration_guidance=(
            "Be clear, factual, and logically ordered.",
            "Explain unfamiliar names or concepts through context.",
            "Use dates only when they improve understanding.",
            "Use explicit transitions between ideas.",
            "Do not assume specialist knowledge unless the target audience "
            "indicates it.",
            "Respect the separately requested tone.",
        ),
        visual_guidance=(
            "Use context-rich depictions of locations, people, artefacts, "
            "routes, or chronology.",
            "Make visuals clarify the narration rather than merely add "
            "atmosphere.",
            "Map-like or comparative compositions are allowed.",
            "Do not depend on generated readable text, labels, or captions "
            "inside images.",
        ),
        ending_requirement=(
            "End with a concise summary of the most important thing the "
            "viewer should remember."
        ),
    ),
    ContentType.EXPLAINER: StoryApproachGuidance(
        goal=(
            "Answer one clear historical question through causes, mechanisms, "
            "or evidence."
        ),
        scene_progression=(
            "State one clear opening question",
            "Explain the first essential cause, factor, or condition",
            "Explain how the factors interacted or produced the outcome",
            "Answer the opening question explicitly and give the key takeaway",
        ),
        narration_guidance=(
            "Be concise, direct, and accessible.",
            "Focus on why, how, or what caused something.",
            "Avoid unnecessary biography or chronology that does not help "
            "answer the question.",
            "Make each scene move the explanation closer to the answer.",
            "Respect the separately requested tone.",
        ),
        visual_guidance=(
            "Use cause-and-effect imagery.",
            "Show comparisons, processes, routes, strategic positions, or "
            "changing conditions.",
            "Make visual relationships help explain how something happened.",
            "Do not depend on generated readable text or diagram labels.",
        ),
        ending_requirement=(
            "Explicitly answer the opening question in the final scene."
        ),
    ),
}

_GENERIC_HISTORICAL_APPROACH = StoryApproachGuidance(
    goal=(
        "Create a coherent four-scene historical narrative that is engaging "
        "and factually cautious."
    ),
    scene_progression=(
        "Establish the historical situation and context",
        "Develop the central events, people, or conditions",
        "Show the decisive development or turning point",
        "Conclude with the consequences and historical significance",
    ),
    narration_guidance=(
        "Form a coherent factual progression.",
        "Avoid false certainty where historical evidence is disputed.",
        "Respect the separately requested tone.",
    ),
    visual_guidance=(
        "Use cinematic, historically meaningful imagery.",
        "Give each scene a distinct visual purpose and avoid repeated shots.",
    ),
    ending_requirement=(
        "End with a clear historical consequence, conclusion, or significance."
    ),
)


def story_approach_guidance(
    content_type: ContentType,
) -> StoryApproachGuidance:
    return _STORY_APPROACHES.get(content_type, _GENERIC_HISTORICAL_APPROACH)


def _format_story_approach(
    content_type: ContentType,
) -> str:
    guidance = story_approach_guidance(content_type)
    progression = "\n".join(
        f"{position}. {instruction}"
        for position, instruction in enumerate(
            guidance.scene_progression, start=1
        )
    )
    narration = "\n".join(
        f"- {instruction}" for instruction in guidance.narration_guidance
    )
    visuals = "\n".join(
        f"- {instruction}" for instruction in guidance.visual_guidance
    )
    return f"""
Story approach: {content_type.value}
Approach goal:
{guidance.goal}

Required scene progression:
{progression}

Narration guidance:
{narration}

Visual guidance:
{visuals}

Ending requirement:
{guidance.ending_requirement}
""".strip()


def resolved_storyboard_model(config: AppConfig) -> str:
    selection = config.default_provider_selection(
        ProviderCapability.STORYBOARD
    )
    return f"{selection.provider}:{selection.model}"


def build_storyboard_prompt(
    *,
    brief: StoryboardProjectSnapshot,
) -> str:
    approach_guidance = _format_story_approach(brief.content_type)
    return f"""
Create exactly four scenes for this TaleMotion project.

Project title: {brief.title}
Topic: {brief.topic}
Content type: {brief.content_type.value}
Output language: {brief.language}
Requested tone: {brief.tone.value}
Target audience: {brief.target_audience}
Source notes: {brief.source_notes or "None provided"}
Additional direction: {brief.additional_direction or "None provided"}
Historical accuracy note: {brief.historical_accuracy_note or "None provided"}
Visual style: {brief.visual_style}
Narration style: {brief.narration_style}
Aspect ratio: {brief.aspect_ratio.value}
Narration enabled: {brief.narration_enabled}
Captions enabled: {brief.captions_enabled}
Background music enabled: {brief.music_enabled}
Target project duration: {brief.duration_seconds} seconds

{approach_guidance}

Write all scene titles and narration in {brief.language}. Apply the requested
tone to the presentation without changing the selected story approach. Use the
target audience to set complexity and framing. Treat source notes as
user-provided context, not verified evidence. Use factually cautious wording
where evidence is uncertain and do not invent citations.

Each scene needs a concise title, narration, a production-ready visual prompt,
duration_seconds, and position. Positions must be exactly 1, 2, 3, 4, and the
durations must total {brief.duration_seconds} seconds within two seconds.

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
        return _configured_provider(config, selection, api_key, name)

    return infer_model(identifier, provider_factory=provider_factory)


def _configured_provider(
    config: AppConfig,
    selection: ProviderSelection,
    api_key: str,
    provider_name: str,
) -> Provider[Any]:
    provider_class = infer_provider_class(provider_name)
    if selection.provider == "alibaba" and config.dashscope_base_url:
        return provider_class(  # type: ignore[call-arg]
            api_key=api_key,
            base_url=config.dashscope_base_url,
        )
    return provider_class(api_key=api_key)  # type: ignore[call-arg]


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


def _storyboard_model_settings(
    selection: ProviderSelection,
) -> ModelSettings:
    settings = ModelSettings(
        temperature=0.4,
        max_tokens=3000,
        timeout=120,
    )
    if selection.provider == "alibaba":
        settings["extra_body"] = {"enable_thinking": False}
    return settings


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
        brief: StoryboardProjectSnapshot,
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
                model_settings=_storyboard_model_settings(self.selection),
                retries=0,
            )
            result = agent.run_sync(
                build_storyboard_prompt(
                    brief=brief,
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
