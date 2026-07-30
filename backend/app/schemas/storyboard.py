from pydantic import Field, model_validator

from app.schemas.common import NonEmptyText, StrictSchema


class StoryboardSceneDraft(StrictSchema):
    title: NonEmptyText = Field(max_length=200)
    narration: NonEmptyText = Field(max_length=2000)
    visual_prompt: NonEmptyText = Field(max_length=4000)
    duration_seconds: int = Field(ge=1, le=20)
    position: int = Field(ge=1, le=4)


class HistoricalStoryboardDraft(StrictSchema):
    scenes: list[StoryboardSceneDraft] = Field(min_length=4, max_length=4)

    @model_validator(mode="after")
    def validate_positions(self) -> "HistoricalStoryboardDraft":
        if [scene.position for scene in self.scenes] != [1, 2, 3, 4]:
            raise ValueError("Storyboard scene positions must be exactly 1–4.")
        return self


class CreateStoryboardRequest(StrictSchema):
    replace_existing: bool = False


class CreateProjectGenerationRequest(StrictSchema):
    generate_video: bool = True
