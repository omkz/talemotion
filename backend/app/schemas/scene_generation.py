from pydantic import Field

from app.schemas.common import StrictSchema


class CreateSceneGenerationRequest(StrictSchema):
    duration_seconds: int = Field(default=5, ge=1, le=60)
    generate_video: bool = True


class SignedPreviewUrlResponse(StrictSchema):
    url: str
    expires_at: str
