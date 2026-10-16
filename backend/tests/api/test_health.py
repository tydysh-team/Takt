import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_has_security_headers() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_unknown_route_uses_project_error_shape() -> None:
    with TestClient(app) as client:
        response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Not Found",
            "details": [],
        }
    }


def test_openapi_is_exposed_at_configured_path_with_error_schema() -> None:
    with TestClient(app) as client:
        response = client.get("/api/openapi.json")

    assert response.status_code == 200
    document = response.json()
    assert document["paths"]["/health"]["get"]["responses"]["500"]["content"][
        "application/json"
    ]["schema"]["$ref"].endswith("/ErrorResponse")


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173"])
@pytest.mark.parametrize("private_network", [False, True])
def test_local_frontend_preflight_is_allowed(origin: str, private_network: bool) -> None:
    headers = {
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    if private_network:
        headers["Access-Control-Request-Private-Network"] = "true"

    with TestClient(app) as client:
        response = client.options("/api/v1/auth/register", headers=headers)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    if private_network:
        assert response.headers["access-control-allow-private-network"] == "true"

