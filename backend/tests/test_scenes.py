from fastapi.testclient import TestClient


def create_project(
    client: TestClient, project_payload: dict[str, object]
) -> tuple[str, str]:
    project = client.post("/api/v1/projects", json=project_payload).json()
    return project["id"], project["chapters"][0]["id"]


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


def test_scene_crud_and_position_normalization(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    _, chapter_id = create_project(client, project_payload)
    first = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes", json=scene_payload("First")
    ).json()
    third = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes", json=scene_payload("Third")
    ).json()
    second = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes",
        json=scene_payload("Second", position=2),
    ).json()
    assert second["position"] == 2
    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()
    assert [scene["title"] for scene in chapter["scenes"]] == [
        "First",
        "Second",
        "Third",
    ]

    updated = client.patch(
        f"/api/v1/scenes/{second['id']}", json={"narration": "Updated narration"}
    )
    assert updated.status_code == 200
    assert updated.json()["narration"] == "Updated narration"

    duplicate = client.post(f"/api/v1/scenes/{first['id']}/duplicate").json()
    assert duplicate["title"] == "First Copy"
    assert duplicate["position"] == 2

    assert client.delete(f"/api/v1/scenes/{third['id']}").status_code == 204
    chapter = client.get(f"/api/v1/chapters/{chapter_id}").json()
    assert [scene["position"] for scene in chapter["scenes"]] == [1, 2, 3]


def test_reorder_scenes_and_reject_invalid_order(
    client: TestClient, project_payload: dict[str, object]
) -> None:
    _, chapter_id = create_project(client, project_payload)
    scenes = [
        client.post(
            f"/api/v1/chapters/{chapter_id}/scenes", json=scene_payload(title)
        ).json()
        for title in ("A", "B", "C")
    ]
    order = [scenes[2]["id"], scenes[0]["id"], scenes[1]["id"]]
    response = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes/reorder",
        json={"scene_ids": order},
    )
    assert response.status_code == 200
    assert [scene["id"] for scene in response.json()["scenes"]] == order

    invalid = client.post(
        f"/api/v1/chapters/{chapter_id}/scenes/reorder",
        json={"scene_ids": [scenes[0]["id"], scenes[0]["id"]]},
    )
    assert invalid.status_code == 409
    assert invalid.json()["error"]["code"] == "invalid_scene_order"
