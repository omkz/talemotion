from fastapi.testclient import TestClient


def historical_payload(title: str = "The Rise of Majapahit") -> dict[str, object]:
    return {
        "mode": "historical_documentary",
        "brief": {
            "mode": "historical_documentary",
            "topic": "The rise of the Majapahit empire",
            "additional_direction": "Focus on maritime trade.",
            "source_notes": "Use established historical sources.",
        },
        "output": output_payload(title),
        "historical_accuracy_note": "Avoid anachronistic European ships.",
    }


def microdrama_payload() -> dict[str, object]:
    return {
        "mode": "microdrama",
        "brief": {
            "mode": "microdrama",
            "premise": "A palace guard discovers a royal secret.",
            "main_character": "Aruna",
            "genre": "Mystery",
            "desired_ending": "A tense unresolved choice.",
        },
        "output": output_payload("A Palace Guard's Secret"),
    }


def product_payload() -> dict[str, object]:
    return {
        "mode": "product_advertisement",
        "brief": {
            "mode": "product_advertisement",
            "product_name": "Kopi Senja",
            "product_description": "A clean single-origin coffee.",
            "main_benefit": "Bright flavor without bitterness.",
            "target_audience": "Design-conscious coffee drinkers.",
            "call_to_action": "Brew a calmer morning.",
        },
        "output": output_payload("Minimalist Coffee Ad"),
    }


def output_payload(title: str) -> dict[str, object]:
    return {
        "title": title,
        "language": "English",
        "duration": 45,
        "aspect_ratio": "9:16",
        "visual_style": "Cinematic Realistic",
        "narration_style": "Documentary",
        "scene_count": 5,
        "captions_enabled": True,
        "music_enabled": True,
    }


def create_project(
    client: TestClient,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    response = client.post("/api/v1/projects", json=payload or historical_payload())
    assert response.status_code == 201
    return response.json()


def test_create_historical_project_and_default_chapter(
    client: TestClient,
) -> None:
    project = create_project(client)

    assert project["id"].startswith("project_")
    assert project["status"] == "draft"
    assert project["generation_progress"] == 0
    assert project["thumbnail_url"] is None
    assert project["deleted_at"] is None
    assert len(project["chapters"]) == 1
    chapter = project["chapters"][0]
    assert chapter["id"].startswith("chapter_")
    assert chapter["title"] == "Main"
    assert chapter["position"] == 1
    assert chapter["status"] == "draft"
    assert chapter["scenes"] == []


def test_create_microdrama_project(client: TestClient) -> None:
    project = create_project(client, microdrama_payload())

    assert project["mode"] == "microdrama"
    assert project["brief"]["premise"].startswith("A palace guard")


def test_create_product_advertisement_project(client: TestClient) -> None:
    project = create_project(client, product_payload())

    assert project["mode"] == "product_advertisement"
    assert project["brief"]["product_name"] == "Kopi Senja"


def test_reject_mismatched_project_mode_and_brief(client: TestClient) -> None:
    payload = historical_payload()
    payload["mode"] = "microdrama"

    response = client.post("/api/v1/projects", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_project_brief"


def test_list_and_search_projects(client: TestClient) -> None:
    historical = create_project(client)
    product = create_project(client, product_payload())

    listing = client.get("/api/v1/projects")
    search = client.get("/api/v1/projects", params={"search": "Kopi Senja"})

    assert listing.status_code == 200
    assert {item["id"] for item in listing.json()["items"]} == {
        historical["id"],
        product["id"],
    }
    assert [item["id"] for item in search.json()["items"]] == [product["id"]]


def test_get_and_update_project(client: TestClient) -> None:
    project = create_project(client)

    fetched = client.get(f"/api/v1/projects/{project['id']}")
    updated = client.patch(
        f"/api/v1/projects/{project['id']}",
        json={
            "output": {
                "title": "Majapahit: An Ocean Empire",
                "duration": 60,
                "aspect_ratio": "16:9",
            },
            "historical_accuracy_note": None,
        },
    )

    assert fetched.status_code == 200
    assert updated.status_code == 200
    body = updated.json()
    assert body["output"]["title"] == "Majapahit: An Ocean Empire"
    assert body["output"]["duration"] == 60
    assert body["output"]["aspect_ratio"] == "16:9"
    assert body["output"]["language"] == "English"
    assert body["historical_accuracy_note"] is None
    assert body["chapters"][0]["target_duration_seconds"] == 60


def test_soft_delete_hides_project(client: TestClient) -> None:
    project = create_project(client)

    deleted = client.delete(f"/api/v1/projects/{project['id']}")
    fetched = client.get(f"/api/v1/projects/{project['id']}")
    listing = client.get("/api/v1/projects")

    assert deleted.status_code == 204
    assert fetched.status_code == 409
    assert fetched.json()["error"]["code"] == "project_deleted"
    assert listing.json()["items"] == []


def test_project_list_cursor_pagination(client: TestClient) -> None:
    create_project(client, historical_payload("One"))
    create_project(client, historical_payload("Two"))

    first = client.get("/api/v1/projects", params={"limit": 1}).json()
    second = client.get(
        "/api/v1/projects",
        params={"limit": 1, "cursor": first["next_cursor"]},
    ).json()

    assert first["has_more"] is True
    assert first["next_cursor"] is not None
    assert second["has_more"] is False
    assert first["items"][0]["id"] != second["items"][0]["id"]
