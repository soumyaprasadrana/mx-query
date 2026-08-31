from __future__ import annotations


def test_default_falls_back_to_env_ollama(client):
    res = client.get("/api/llm/config")
    body = res.json()
    assert body["configured"] is True
    assert body["source"] == "env"
    assert body["model"] == "ollama/qwen2.5:1.5b"


def test_assist_health_reflects_configured_state(client):
    res = client.get("/api/assist/health")
    assert res.json()["available"] is True


def test_put_requires_admin(client):
    res = client.put("/api/llm/config", json={"provider": "openai", "model": "openai/gpt-4o-mini", "apiKey": "sk-x"})
    assert res.status_code == 401


def test_put_then_get_reflects_db_override(admin_client):
    res = admin_client.put(
        "/api/llm/config", json={"provider": "openai", "model": "openai/gpt-4o-mini", "apiKey": "sk-x"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "openai"
    assert body["model"] == "openai/gpt-4o-mini"
    assert body["source"] == "db"
    assert "apiKey" not in body  # never returned once saved

    again = admin_client.get("/api/llm/config")
    assert again.json()["source"] == "db"


def test_put_blank_api_key_keeps_previous_key(admin_client):
    admin_client.put("/api/llm/config", json={"provider": "openai", "model": "openai/gpt-4o-mini", "apiKey": "sk-x"})
    # Re-save with no apiKey field at all — should not wipe the stored key.
    res = admin_client.put("/api/llm/config", json={"provider": "openai", "model": "openai/gpt-4.1-mini"})
    assert res.status_code == 200
    assert res.json()["model"] == "openai/gpt-4.1-mini"

    from app import db
    row = db.get_llm_config()
    from app import crypto
    assert crypto.decrypt_secret(row.api_key_encrypted) == "sk-x"


def test_delete_falls_back_to_env_again(admin_client):
    admin_client.put("/api/llm/config", json={"provider": "openai", "model": "openai/gpt-4o-mini", "apiKey": "sk-x"})
    res = admin_client.delete("/api/llm/config")
    assert res.status_code == 204
    assert admin_client.get("/api/llm/config").json()["source"] == "env"


def test_delete_requires_admin(client):
    assert client.delete("/api/llm/config").status_code == 401
