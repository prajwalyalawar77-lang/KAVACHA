"""Smoke tests for metadata, authentication and permission enforcement."""

from tests.conftest import register_user


def test_health_and_service_metadata(client):
    health = client.get("/api/health")
    assert health.status_code in (200, 503)
    body = health.get_json()
    assert body["success"] is True
    assert "checks" in body["data"]

    meta = client.get("/api/meta")
    assert meta.status_code == 200
    data = meta.get_json()["data"]
    assert data["service"] == "KAVACHA"
    assert len(data["modules"]) == 6
    assert data["security"]["document_urls_public"] is False


def test_registration_login_and_profile(client):
    headers, user = register_user(client, "alice@example.com", "public")
    assert user["role"] == "public"

    duplicate = client.post("/api/auth/register", json={
        "full_name": "Alice Again", "email": "alice@example.com",
        "password": "Passw0rd123", "role": "public",
    })
    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"]["code"] == "email_taken"

    bad_login = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-pass"})
    assert bad_login.status_code == 401
    assert bad_login.get_json()["error"]["code"] == "invalid_credentials"

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.get_json()["data"]["user"]["email"] == "alice@example.com"

    updated = client.patch("/api/auth/me", json={"full_name": "Alice Cooper", "retention_days": 14}, headers=headers)
    assert updated.status_code == 200
    assert updated.get_json()["data"]["user"]["full_name"] == "Alice Cooper"
    assert updated.get_json()["data"]["user"]["retention_days"] == 14

    weak = client.post("/api/auth/password", json={"current_password": "Passw0rd123", "new_password": "short"}, headers=headers)
    assert weak.status_code == 422

    changed = client.post("/api/auth/password", json={"current_password": "Passw0rd123", "new_password": "N3wPassw0rd"}, headers=headers)
    assert changed.status_code == 200
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "N3wPassw0rd"}).status_code == 200


def test_anonymous_requests_are_rejected(client):
    assert client.get("/api/documents").status_code == 401
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/admin/overview").status_code == 401
    assert client.get("/api/documents/1/preview").status_code == 401


def test_role_guards_enforced_by_api(client):
    headers, _ = register_user(client, "bob@example.com", "public")

    industrial = client.get("/api/industrial/dashboard", headers=headers)
    assert industrial.status_code == 403
    assert industrial.get_json()["error"]["code"] == "forbidden"

    admin = client.get("/api/admin/overview", headers=headers)
    assert admin.status_code == 403

    suppliers = client.get("/api/industrial/suppliers", headers=headers)
    assert suppliers.status_code == 403
