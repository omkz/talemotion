from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.asset import Asset, AssetStatus, AssetType
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import Project
from app.models.render import Render, RenderStatus

PASSWORD = "correct horse battery staple"


def user_client(
    session_factory: sessionmaker[Session],
    *,
    email: str,
) -> TestClient:
    def override_database():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_database
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "name": email.split("@")[0]},
    )
    assert response.status_code == 201
    csrf = client.cookies.get("talemotion_csrf")
    assert csrf
    client.headers["X-CSRF-Token"] = csrf
    return client


def test_resources_are_hidden_from_other_users(
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
) -> None:
    owner = user_client(
        session_factory, email=f"owner-{uuid4().hex}@example.com"
    )
    stranger = user_client(
        session_factory, email=f"stranger-{uuid4().hex}@example.com"
    )
    try:
        created = owner.post("/api/v1/projects", json=project_payload)
        assert created.status_code == 201
        project = created.json()
        project_id = project["id"]
        chapter_id = project["chapters"][0]["id"]
        scene = owner.post(
            f"/api/v1/chapters/{chapter_id}/scenes",
            json={
                "title": "Owned scene",
                "narration": "Narration",
                "visual_prompt": "Visual prompt",
                "duration_seconds": 5,
            },
        )
        assert scene.status_code == 201
        scene_id = scene.json()["id"]
        with session_factory() as session:
            persisted_project = session.get(Project, project_id)
            assert persisted_project is not None
            job = GenerationJob(
                user_id=persisted_project.user_id,
                project_id=project_id,
                scene_id=scene_id,
                type=JobType.SCENE_GENERATION,
                status=JobStatus.COMPLETED,
                progress=100,
                current_stage="completed",
                input_payload={},
            )
            asset = Asset(
                user_id=persisted_project.user_id,
                project_id=project_id,
                scene_id=scene_id,
                type=AssetType.IMAGE,
                status=AssetStatus.AVAILABLE,
                version=1,
                generation_parameters={},
                storage_object_key=(
                    f"talemotion/projects/{project_id}/scenes/{scene_id}/image.png"
                ),
            )
            session.add_all((job, asset))
            session.flush()
            render = Render(
                user_id=persisted_project.user_id,
                project_id=project_id,
                job_id=job.id,
                asset_id=asset.id,
                version=1,
                status=RenderStatus.COMPLETED,
            )
            session.add(render)
            session.commit()
            job_id = job.id
            asset_id = asset.id
            render_id = render.id

        assert stranger.get(f"/api/v1/projects/{project_id}").status_code == 404
        assert stranger.get(f"/api/v1/chapters/{chapter_id}").status_code == 404
        assert stranger.get(f"/api/v1/scenes/{scene_id}").status_code == 404
        generation = stranger.post(
            f"/api/v1/scenes/{scene_id}/generations",
            json={"duration_seconds": 5, "generate_video": True},
        )
        assert generation.status_code == 404
        assert stranger.get(f"/api/v1/jobs/{job_id}").status_code == 404
        assert stranger.get(f"/api/v1/assets/{asset_id}").status_code == 404
        assert (
            stranger.post(f"/api/v1/assets/{asset_id}/preview-url").status_code
            == 404
        )
        assert stranger.get(f"/api/v1/renders/{render_id}").status_code == 404
        assert (
            stranger.post(f"/api/v1/renders/{render_id}/preview-url").status_code
            == 404
        )
    finally:
        owner.close()
        stranger.close()
        app.dependency_overrides.clear()
