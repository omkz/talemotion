from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.models.asset import Asset, AssetStatus, AssetType
from app.models.project import Project
from app.models.render import Render, RenderStatus


def test_asset_and_render_foundation_records_persist_without_fake_media(
    client: TestClient,
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    project = client.post("/api/v1/projects", json=project_payload).json()
    chapter_id = project["chapters"][0]["id"]
    scene = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json={
            "title": "A persisted scene",
            "narration": "",
            "visual_prompt": "",
            "duration_seconds": 8,
        },
    ).json()

    with session_factory() as session:
        persisted_project = session.get(Project, project["id"])
        assert persisted_project is not None
        asset = Asset(
            user_id=persisted_project.user_id,
            project_id=project["id"],
            scene_id=scene["id"],
            type=AssetType.IMAGE,
            status=AssetStatus.PENDING,
            version=1,
            generation_parameters={},
        )
        session.add(asset)
        session.flush()
        render = Render(
            user_id=persisted_project.user_id,
            project_id=project["id"],
            version=1,
            status=RenderStatus.QUEUED,
            asset_id=None,
        )
        session.add(render)
        session.commit()
        assert session.get(Asset, asset.id) is not None
        assert session.get(Render, render.id) is not None
        assert asset.storage_object_key is None
