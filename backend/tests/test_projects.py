import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.chapter import Chapter
from app.models.project import Project
from app.repositories.auth import AuthRepository
from app.repositories.sqlalchemy import ProjectRepository
from app.schemas.project import CreateProjectRequest
from app.services.project_titles import derive_project_title
from app.services.projects import ProjectService


def test_create_project_persists_main_chapter(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    response = client.post("/api/v1/projects", json=project_payload)
    assert response.status_code == 201
    project = response.json()
    assert project["status"] == "draft"
    assert project["generation_progress"] == 0
    assert project["chapters"][0]["title"] == "Main"
    assert project["chapters"][0]["position"] == 1
    assert project["chapters"][0]["status"] == "draft"
    assert project["chapters"][0]["scenes"] == []


def test_create_project_persists_complete_creation_brief(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    payload = {
        **project_payload,
        "source_notes": "Nagarakretagama excerpt\nA disputed chronology.",
        "content_type": "educational",
        "language": "id-ID",
        "tone": "informative",
        "target_audience": "Pelajar sekolah menengah",
        "additional_direction": "Jelaskan dengan hati-hati.",
        "narration_enabled": False,
        "captions_enabled": True,
        "music_enabled": False,
    }
    response = client.post("/api/v1/projects", json=payload)
    assert response.status_code == 201
    assert {
        "source_notes": payload["source_notes"],
        "content_type": "educational",
        "language": "id-ID",
        "tone": "informative",
        "target_audience": "Pelajar sekolah menengah",
        "additional_direction": "Jelaskan dengan hati-hati.",
        "narration_enabled": False,
        "captions_enabled": True,
        "music_enabled": False,
    }.items() <= response.json().items()


@pytest.mark.parametrize(
    ("topic", "expected"),
    [
        ("The rise of maritime Majapahit", "The rise of maritime Majapahit"),
        ("  Kebangkitan   kerajaan maritim  ", "Kebangkitan kerajaan maritim"),
        ("海上シルクロードの物語", "海上シルクロードの物語"),
        ("\n\nBaris pertama yang bermakna\nBaris kedua", "Baris pertama yang bermakna"),
    ],
)
def test_working_title_derivation_preserves_language(
    topic: str, expected: str
) -> None:
    assert derive_project_title(topic) == expected


def test_working_title_truncates_without_splitting_a_word() -> None:
    title = derive_project_title("sejarah " * 80, max_length=40)
    assert len(title) <= 40
    assert title.endswith("…")
    assert title.removesuffix("…").split()[-1] == "sejarah"


def test_create_project_derives_title_without_ai_request(client: TestClient) -> None:
    response = client.post(
        "/api/v1/projects",
        json={
            "mode": "historical_documentary",
            "topic": "  Kisah   pelabuhan Nusantara. Bagian berikutnya  ",
            "title": "   ",
            "duration_seconds": 30,
        },
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Kisah pelabuhan Nusantara."


@pytest.mark.parametrize(
    "patch",
    [
        {"topic": "   "},
        {"content_type": "podcast"},
        {"tone": "hyperbolic"},
        {"language": "not_a_language"},
    ],
)
def test_project_creation_brief_validation(
    client: TestClient, project_payload: dict[str, object], patch: dict[str, str]
) -> None:
    response = client.post("/api/v1/projects", json={**project_payload, **patch})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_project_creation_brief_can_be_updated_and_reopened(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    created = client.post("/api/v1/projects", json=project_payload).json()
    response = client.patch(
        f"/api/v1/projects/{created['id']}",
        json={
            "title": "Updated title",
            "topic": "Updated topic",
            "source_notes": "Updated source context",
            "content_type": "fiction",
            "language": "pt-BR",
            "tone": "dramatic",
            "target_audience": "Young adult readers",
            "additional_direction": "Use a mystery structure.",
        },
    )
    assert response.status_code == 200
    reopened = client.get(f"/api/v1/projects/{created['id']}").json()
    assert {
        "title": "Updated title",
        "topic": "Updated topic",
        "source_notes": "Updated source context",
        "content_type": "fiction",
        "language": "pt-BR",
        "tone": "dramatic",
        "target_audience": "Young adult readers",
        "additional_direction": "Use a mystery structure.",
    }.items() <= reopened.items()


def test_legacy_language_label_is_normalized(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    response = client.post(
        "/api/v1/projects", json={**project_payload, "language": "English"}
    )
    assert response.status_code == 201
    assert response.json()["language"] == "en"


def test_project_creation_is_atomic_on_chapter_failure(
    session_factory: sessionmaker[Session],
    project_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with session_factory() as session:
        owner = AuthRepository(session).create_user(
            email="owner@example.com",
            password_hash="unused-hash",
            name="Test Owner",
        )
        session.commit()
        repository = ProjectRepository(session, owner.id)

        def fail_after_add(project: Project) -> Project:
            project.user_id = owner.id
            session.add(project)
            session.flush()
            raise RuntimeError("chapter persistence failed")

        monkeypatch.setattr(repository, "add", fail_after_add)
        with pytest.raises(RuntimeError):
            ProjectService(repository).create_project(
                CreateProjectRequest.model_validate(project_payload)
            )
    with session_factory() as session:
        assert session.scalar(select(func.count(Project.id))) == 0
        assert session.scalar(select(func.count(Chapter.id))) == 0


def test_list_search_update_and_soft_delete(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    created = client.post("/api/v1/projects", json=project_payload).json()
    response = client.get("/api/v1/projects", params={"search": "Majapahit"})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [created["id"]]

    response = client.patch(
        f"/api/v1/projects/{created['id']}",
        json={"title": "Majapahit Maritime Power", "duration_seconds": 30},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Majapahit Maritime Power"
    assert response.json()["duration_seconds"] == 30

    response = client.delete(f"/api/v1/projects/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/v1/projects/{created['id']}").status_code == 404
    assert client.get("/api/v1/projects").json()["items"] == []


def test_project_cursor_pagination(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    for index in range(3):
        payload = {**project_payload, "title": f"Project {index}"}
        assert client.post("/api/v1/projects", json=payload).status_code == 201
    first = client.get("/api/v1/projects", params={"limit": 2}).json()
    assert len(first["items"]) == 2
    assert first["has_more"] is True
    second = client.get(
        "/api/v1/projects", params={"limit": 2, "cursor": first["next_cursor"]}
    ).json()
    assert len(second["items"]) == 1
    assert second["has_more"] is False


def test_validation_and_request_id(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    invalid = {**project_payload, "duration_seconds": 60}
    response = client.post(
        "/api/v1/projects",
        json=invalid,
        headers={"X-Request-ID": "req-client-test"},
    )
    assert response.status_code == 422
    assert response.headers["X-Request-ID"] == "req-client-test"
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["request_id"] == "req-client-test"
