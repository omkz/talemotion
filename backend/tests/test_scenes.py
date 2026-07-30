from fastapi.testclient import TestClient

from tests.test_projects import create_project


def add_scene(
    client: TestClient,
    chapter_id: str,
    *,
    title: str,
    position: int | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": title,
        "narration": f"Narration for {title}",
        "visual_prompt": f"Vertical historical scene for {title}",
        "duration_seconds": 8,
    }
    if position is not None:
        payload["position"] = position
    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json=payload,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_scene_crud_duplicate_and_position_normalization(
    client: TestClient,
) -> None:
    project = create_project(client)
    chapter_id = project["chapters"][0]["id"]
    first = add_scene(client, chapter_id, title="First")
    inserted = add_scene(client, chapter_id, title="Inserted", position=1)

    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()
    assert [scene["title"] for scene in chapter["scenes"]] == [
        "Inserted",
        "First",
    ]
    assert [scene["position"] for scene in chapter["scenes"]] == [1, 2]

    updated = client.patch(
        f"/api/v1/scenes/{first['id']}",
        json={"narration": "Revised narration"},
    )
    assert updated.status_code == 200
    assert updated.json()["narration"] == "Revised narration"

    duplicate = client.post(f"/api/v1/scenes/{inserted['id']}/duplicate")
    assert duplicate.status_code == 201
    assert duplicate.json()["title"] == "Inserted Copy"
    assert duplicate.json()["status"] == "draft"

    deleted = client.delete(f"/api/v1/scenes/{inserted['id']}")
    assert deleted.status_code == 204
    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()
    assert [scene["position"] for scene in chapter["scenes"]] == [1, 2]


def test_reorder_requires_every_scene_exactly_once(client: TestClient) -> None:
    project = create_project(client)
    chapter_id = project["chapters"][0]["id"]
    first = add_scene(client, chapter_id, title="First")
    second = add_scene(client, chapter_id, title="Second")

    invalid = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes/reorder",
        json={"scene_ids": [first["id"], first["id"]]},
    )
    assert invalid.status_code == 409
    assert invalid.json()["error"]["code"] == "invalid_scene_order"

    reordered = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes/reorder",
        json={"scene_ids": [second["id"], first["id"]]},
    )
    assert reordered.status_code == 200
    assert [
        scene["id"] for scene in reordered.json()["scenes"]
    ] == [second["id"], first["id"]]


def test_scene_generation_endpoint_queues_media_job(
    client: TestClient,
    dispatcher,
) -> None:
    project = create_project(client)
    scene = add_scene(client, project["chapters"][0]["id"], title="Harbor")

    response = client.post(
        f"/api/v1/scenes/{scene['id']}/generations",
        json={"stages": ["image"], "additional_instruction": None},
    )

    assert response.status_code == 202
    job = response.json()
    assert job["type"] == "scene_generation"
    assert dispatcher.calls == [("scene_generation", job["id"])]
