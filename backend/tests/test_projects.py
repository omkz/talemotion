from fastapi.testclient import TestClient


def historical_payload(*, topic: str = "The rise of Majapahit") -> dict[str, object]:
    return {
        "mode": "historical_documentary",
        "brief": {
            "mode": "historical_documentary",
            "topic": topic,
            "additional_direction": "Focus on maritime trade.",
            "source_notes": "Distinguish evidence from later tradition.",
        },
        "output_config": {
            "title": topic,
            "language": "English",
            "duration_seconds": 30,
            "aspect_ratio": "9:16",
            "visual_style": "Cinematic Realistic",
            "narration_style": "Documentary",
            "scene_count": 4,
            "captions_enabled": True,
            "background_music_enabled": False,
        },
        "template_id": "historical-fact-short",
    }


def create_project(client: TestClient, *, topic: str = "The rise of Majapahit"):
    response = client.post("/api/v1/projects", json=historical_payload(topic=topic))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_historical_project_with_main_chapter(client: TestClient) -> None:
    project = create_project(client)

    assert project["id"].startswith("project_")
    assert project["status"] == "draft"
    assert project["brief"]["topic"] == "The rise of Majapahit"
    assert len(project["chapters"]) == 1
    assert project["chapters"][0]["title"] == "Main"
    assert project["chapters"][0]["position"] == 1


def test_non_historical_mode_is_explicitly_coming_soon(client: TestClient) -> None:
    payload = historical_payload()
    payload["mode"] = "microdrama"
    payload["brief"] = {
        "mode": "microdrama",
        "premise": "A guard discovers a secret.",
        "main_character": "The guard",
        "genre": "Drama",
        "desired_ending": "A difficult truth",
    }

    response = client.post("/api/v1/projects", json=payload)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "mode_not_available"


def test_mismatched_mode_and_brief_is_rejected(client: TestClient) -> None:
    payload = historical_payload()
    payload["mode"] = "microdrama"

    response = client.post("/api/v1/projects", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_project_brief"


def test_list_search_update_and_soft_delete(client: TestClient) -> None:
    project = create_project(client, topic="Srivijaya maritime networks")
    create_project(client, topic="The Roman Republic")

    search = client.get("/api/v1/projects", params={"search": "Srivijaya"})
    assert search.status_code == 200
    assert [item["id"] for item in search.json()["items"]] == [project["id"]]

    update = client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"title": "Srivijaya: Crossroads of the Sea"},
    )
    assert update.status_code == 200
    assert (
        update.json()["output_config"]["title"]
        == "Srivijaya: Crossroads of the Sea"
    )

    deleted = client.delete(f"/api/v1/projects/{project['id']}")
    assert deleted.status_code == 204
    missing = client.get(f"/api/v1/projects/{project['id']}")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "project_not_found"


def test_storyboard_endpoint_persists_and_dispatches_job(
    client: TestClient,
    dispatcher,
) -> None:
    project = create_project(client)

    response = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={"scene_count": 4, "additional_instruction": None},
    )

    assert response.status_code == 202
    job = response.json()
    assert job["type"] == "storyboard"
    assert job["status"] == "queued"
    assert dispatcher.calls == [("storyboard", job["id"])]

    polled = client.get(f"/api/v1/jobs/{job['id']}")
    assert polled.status_code == 200
    assert polled.json()["id"] == job["id"]


def test_missing_provider_configuration_fails_without_fake_job(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.core.config import settings

    project = create_project(client)
    monkeypatch.setattr(settings, "openai_api_key", None)

    response = client.post(
        f"/api/v1/projects/{project['id']}/storyboard",
        json={"scene_count": 4},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "provider_not_configured"


def test_request_id_is_echoed_and_included_in_errors(client: TestClient) -> None:
    response = client.get(
        "/api/v1/projects/project_missing",
        headers={"X-Request-ID": "req-test-123"},
    )

    assert response.headers["X-Request-ID"] == "req-test-123"
    assert response.json()["error"]["request_id"] == "req-test-123"
