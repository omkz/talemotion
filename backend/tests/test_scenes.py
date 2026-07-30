from fastapi.testclient import TestClient

from tests.test_projects import create_project


def chapter_id_for(client: TestClient) -> str:
    project = create_project(client)
    return project["chapters"][0]["id"]


def scene_payload(title: str, position: int | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": title,
        "narration": f"Narration for {title}",
        "visual_prompt": f"Visual prompt for {title}",
        "duration_seconds": 8,
    }
    if position is not None:
        payload["position"] = position
    return payload


def add_scene(
    client: TestClient,
    chapter_id: str,
    title: str,
    position: int | None = None,
) -> dict[str, object]:
    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json=scene_payload(title, position),
    )
    assert response.status_code == 201
    return response.json()


def test_get_chapter_and_add_scene(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    scene = add_scene(client, chapter_id, "Opening")
    chapter = client.get(f"/api/v1/chapters/{chapter_id}")

    assert scene["status"] == "draft"
    assert scene["position"] == 1
    assert scene["id"].startswith("scene_")
    assert chapter.status_code == 200
    assert [item["id"] for item in chapter.json()["scenes"]] == [scene["id"]]


def test_insert_scene_at_specific_position(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    first = add_scene(client, chapter_id, "First")
    second = add_scene(client, chapter_id, "Second")
    inserted = add_scene(client, chapter_id, "Inserted", position=2)

    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()

    assert [scene["id"] for scene in chapter["scenes"]] == [
        first["id"],
        inserted["id"],
        second["id"],
    ]
    assert [scene["position"] for scene in chapter["scenes"]] == [1, 2, 3]


def test_get_and_update_scene(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    scene = add_scene(client, chapter_id, "Original")

    fetched = client.get(f"/api/v1/scenes/{scene['id']}")
    updated = client.patch(
        f"/api/v1/scenes/{scene['id']}",
        json={"title": "Revised", "duration_seconds": 12},
    )

    assert fetched.status_code == 200
    assert updated.status_code == 200
    assert updated.json()["title"] == "Revised"
    assert updated.json()["duration_seconds"] == 12
    assert updated.json()["narration"] == scene["narration"]


def test_duplicate_scene_after_source(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    source = add_scene(client, chapter_id, "Reveal")
    add_scene(client, chapter_id, "Ending")

    duplicated = client.post(f"/api/v1/scenes/{source['id']}/duplicate")
    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()

    assert duplicated.status_code == 201
    assert duplicated.json()["title"] == "Reveal Copy"
    assert duplicated.json()["status"] == "draft"
    assert [scene["title"] for scene in chapter["scenes"]] == [
        "Reveal",
        "Reveal Copy",
        "Ending",
    ]


def test_delete_scene_normalizes_positions(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    add_scene(client, chapter_id, "First")
    middle = add_scene(client, chapter_id, "Middle")
    last = add_scene(client, chapter_id, "Last")

    response = client.delete(f"/api/v1/scenes/{middle['id']}")
    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()

    assert response.status_code == 204
    assert [scene["title"] for scene in chapter["scenes"]] == ["First", "Last"]
    assert [scene["position"] for scene in chapter["scenes"]] == [1, 2]
    assert client.get(f"/api/v1/scenes/{last['id']}").status_code == 200


def test_reorder_scenes(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    first = add_scene(client, chapter_id, "First")
    second = add_scene(client, chapter_id, "Second")
    third = add_scene(client, chapter_id, "Third")

    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes/reorder",
        json={"scene_ids": [third["id"], first["id"], second["id"]]},
    )

    assert response.status_code == 200
    assert [scene["id"] for scene in response.json()["scenes"]] == [
        third["id"],
        first["id"],
        second["id"],
    ]
    assert [scene["position"] for scene in response.json()["scenes"]] == [1, 2, 3]


def test_reject_invalid_scene_reorder(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)
    first = add_scene(client, chapter_id, "First")
    add_scene(client, chapter_id, "Second")

    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes/reorder",
        json={"scene_ids": [first["id"], first["id"]]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_scene_order"


def test_not_found_error_and_request_id(client: TestClient) -> None:
    response = client.get(
        "/api/v1/scenes/scene_missing",
        headers={"X-Request-ID": "req_from_test"},
    )

    assert response.status_code == 404
    assert response.headers["X-Request-ID"] == "req_from_test"
    assert response.json() == {
        "error": {
            "code": "scene_not_found",
            "message": "Scene not found.",
            "details": {"scene_id": "scene_missing"},
            "request_id": "req_from_test",
        }
    }


def test_validation_errors_use_error_envelope(client: TestClient) -> None:
    chapter_id = chapter_id_for(client)

    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json=scene_payload("   "),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.headers["X-Request-ID"].startswith("req_")
