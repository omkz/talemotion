from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "talemotion-backend",
        "version": "0.1.0",
    }


def test_generated_openapi_includes_domain_routes(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/projects" in paths
    assert "/api/v1/chapters/{chapter_id}" in paths
    assert "/api/v1/scenes/{scene_id}" in paths
    assert "/api/v1/jobs/{job_id}" in paths


def test_dependency_health_with_postgres_and_redis(client: TestClient) -> None:
    response = client.get("/api/v1/health/dependencies")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "dependencies": {"database": "ok", "redis": "ok"},
    }
