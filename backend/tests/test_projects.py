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


def test_create_custom_video_persists_shared_defaults_and_derives_title(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/projects",
        json={
            "mode": "custom_video",
            "title": "   ",
            "topic": "Coffee beans from a mountain farm to a modern café",
            "source_notes": "Use hand sorting and a light roast.",
            "language": "en",
            "target_audience": "Coffee enthusiasts",
            "duration_seconds": 45,
            "aspect_ratio": "9:16",
            "visual_style": "Warm cinematic realism",
            "narration_style": "Calm and informative",
            "narration_enabled": True,
            "captions_enabled": False,
            "music_enabled": False,
        },
    )

    assert response.status_code == 201
    project = response.json()
    assert project["mode"] == "custom_video"
    assert project["title"] == (
        "Coffee beans from a mountain farm to a modern café"
    )
    assert project["content_type"] == "documentary"
    assert project["tone"] == "cinematic"
    assert project["additional_direction"] == ""
    assert project["historical_accuracy_note"] is None


@pytest.mark.parametrize("mode", ["microdrama", "product_advertisement"])
def test_unavailable_project_modes_remain_rejected(
    client: TestClient,
    project_payload: dict[str, object],
    mode: str,
) -> None:
    response = client.post(
        "/api/v1/projects",
        json={**project_payload, "mode": mode},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_implemented"


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


@pytest.mark.parametrize("content_type", ["documentary", "educational", "explainer"])
def test_historical_project_accepts_compatible_content_types(
    client: TestClient,
    project_payload: dict[str, object],
    content_type: str,
) -> None:
    response = client.post(
        "/api/v1/projects",
        json={**project_payload, "content_type": content_type},
    )
    assert response.status_code == 201
    assert response.json()["content_type"] == content_type


@pytest.mark.parametrize("content_type", ["fiction", "promotional"])
def test_historical_project_rejects_incompatible_content_types(
    client: TestClient,
    project_payload: dict[str, object],
    content_type: str,
) -> None:
    response = client.post(
        "/api/v1/projects",
        json={**project_payload, "content_type": content_type},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "documentary, educational, or explainer" in str(response.json())


@pytest.mark.parametrize("content_type", ["fiction", "promotional"])
def test_historical_project_rejects_incompatible_content_type_patch(
    client: TestClient,
    project_payload: dict[str, object],
    content_type: str,
) -> None:
    created = client.post("/api/v1/projects", json=project_payload).json()
    response = client.patch(
        f"/api/v1/projects/{created['id']}",
        json={"content_type": content_type},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert client.get(f"/api/v1/projects/{created['id']}").json()[
        "content_type"
    ] == "documentary"


def test_existing_persisted_valid_project_continues_to_load(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    created = client.post(
        "/api/v1/projects",
        json={**project_payload, "content_type": "explainer"},
    ).json()
    response = client.get(f"/api/v1/projects/{created['id']}")
    assert response.status_code == 200
    assert response.json()["content_type"] == "explainer"


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
            "content_type": "educational",
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
        "content_type": "educational",
        "language": "pt-BR",
        "tone": "dramatic",
        "target_audience": "Young adult readers",
        "additional_direction": "Use a mystery structure.",
    }.items() <= reopened.items()


@pytest.mark.parametrize(
    "field",
    [
        "title",
        "topic",
        "content_type",
        "language",
        "tone",
        "target_audience",
        "duration_seconds",
        "aspect_ratio",
        "visual_style",
        "narration_style",
        "captions_enabled",
        "narration_enabled",
        "music_enabled",
        "additional_direction",
    ],
)
def test_project_patch_rejects_explicit_null_for_required_fields(
    client: TestClient,
    project_payload: dict[str, object],
    field: str,
) -> None:
    created = client.post("/api/v1/projects", json=project_payload).json()
    response = client.patch(
        f"/api/v1/projects/{created['id']}", json={field: None}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_project_patch_nullable_and_omitted_field_semantics(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    created = client.post(
        "/api/v1/projects",
        json={
            **project_payload,
            "source_notes": "Temporary sources",
            "historical_accuracy_note": "Temporary accuracy note",
            "additional_direction": "Original direction",
        },
    ).json()

    response = client.patch(
        f"/api/v1/projects/{created['id']}",
        json={
            "source_notes": None,
            "historical_accuracy_note": None,
            "additional_direction": "",
        },
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["source_notes"] is None
    assert updated["historical_accuracy_note"] is None
    assert updated["additional_direction"] == ""
    assert updated["title"] == created["title"]
    assert updated["topic"] == created["topic"]
    assert updated["duration_seconds"] == created["duration_seconds"]


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
