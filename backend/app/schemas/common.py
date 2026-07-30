from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

NonEmptyText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1),
]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorBody(StrictSchema):
    code: str
    message: str
    details: dict[str, object]
    request_id: str


class ErrorResponse(StrictSchema):
    error: ErrorBody
