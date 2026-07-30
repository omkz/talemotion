from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProvenanceManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str
    project_id: str
    scene_id: str
    asset_version: int
    provider: str
    model: str
    prompt: str
    generation_parameters: dict[str, str | int | float | bool | None]
    generated_at: datetime
    sha256: str
    b2_object_key: str
    parent_asset_id: str | None
    genblaze_provenance: dict[str, object]
    disclaimer: str = (
        "This manifest records generation provenance; it does not prove "
        "real-world truth or historical accuracy."
    )
