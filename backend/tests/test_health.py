from __future__ import annotations


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_version_shape(client):
    body = client.get("/api/version").json()
    assert body["name"] == "mxQuery"
    assert body["version"] == "1.3.0"
    # A real compatibility fact, not a guess — parsed from the same
    # MQB_MCP_NPM_SPEC the backend actually spawns tenants with.
    assert body["mcpServer"]["package"] == "@soumyaprasadrana/maximo-mcp-server"
    assert body["mcpServer"]["version"]  # non-empty, whatever it's pinned to
    # No dev-only leakage: no git sha, no environment, no python/node version.
    assert set(body.keys()) == {"name", "version", "mcpServer"}


def test_version_respects_npm_spec_override(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("MQB_MCP_NPM_SPEC", "@soumyaprasadrana/maximo-mcp-server@9.9.9")
    get_settings.cache_clear()
    body = client.get("/api/version").json()
    assert body["mcpServer"] == {"package": "@soumyaprasadrana/maximo-mcp-server", "version": "9.9.9"}
