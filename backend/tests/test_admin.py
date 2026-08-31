from __future__ import annotations

from tests.conftest import ADMIN_PASSWORD


def test_session_reports_disabled_when_no_password_set(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setenv("MQB_ADMIN_PASSWORD", "")
    get_settings.cache_clear()
    res = client.get("/api/admin/session")
    assert res.json() == {"enabled": False, "authenticated": False}


def test_login_disabled_404s_when_no_password_set(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setenv("MQB_ADMIN_PASSWORD", "")
    get_settings.cache_clear()
    res = client.post("/api/admin/login", json={"password": "anything"})
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "admin_disabled"


def test_login_wrong_password_401s(client):
    res = client.post("/api/admin/login", json={"password": "wrong"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "invalid_password"


def test_login_success_sets_a_working_session(client):
    res = client.post("/api/admin/login", json={"password": ADMIN_PASSWORD})
    assert res.status_code == 200
    assert res.json() == {"authenticated": True}
    assert client.get("/api/admin/session").json() == {"enabled": True, "authenticated": True}


def test_logout_clears_the_session(admin_client):
    res = admin_client.post("/api/admin/logout")
    assert res.json() == {"authenticated": False}
    assert admin_client.get("/api/admin/session").json()["authenticated"] is False


def test_admin_gated_endpoint_rejects_without_session(client):
    res = client.put("/api/llm/config", json={"provider": "openai", "model": "openai/gpt-4o-mini"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "admin_auth_required"
