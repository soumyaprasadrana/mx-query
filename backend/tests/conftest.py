"""Shared fixtures. Every test gets an isolated tenant db under pytest's own
`tmp_path` — never the real `backend/data/tenants.db` (AGENTS.md rule 6). This
is baked into the `app` fixture itself, not left to each test to remember, so
a future test can't accidentally regress onto live data.

Module-level singletons (`app.mcp.manager`'s warm-client pool, `app.admin`'s
session dict, `app.llm.sessions`'s session dict, `get_settings`'s lru_cache)
are reset per test — none of them know about pytest, so without this, state
from one test (a warm client, an admin session) leaks into the next.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

ADMIN_PASSWORD = "test-admin-pw"


@pytest.fixture()
def scratch_db_path(tmp_path):
    return str(tmp_path / f"test-{uuid.uuid4().hex}.db")


@pytest.fixture()
def app(scratch_db_path, monkeypatch):
    monkeypatch.setenv("MQB_TENANT_DB_PATH", scratch_db_path)
    monkeypatch.setenv("MQB_ADMIN_PASSWORD", ADMIN_PASSWORD)

    from app.config import get_settings
    get_settings.cache_clear()

    import app.mcp.manager as manager_mod
    manager_mod._manager = None

    import app.admin as admin_mod
    admin_mod._sessions.clear()

    import app.llm.sessions as sessions_mod
    sessions_mod._sessions.clear()

    from app.app import create_app
    return create_app()


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_client(client):
    """A client already holding a live admin session cookie."""
    res = client.post("/api/admin/login", json={"password": ADMIN_PASSWORD})
    assert res.status_code == 200
    return client


@pytest.fixture()
def fake_mcp_client(monkeypatch):
    """Replaces the real spawn path (`npx` + a live Maximo instance) with an
    in-memory fake, for tests that only care about the registry/proxy
    contract, not a real MCP round trip. No test in this suite should spawn
    a real subprocess — CI has no Maximo instance to talk to."""
    import app.mcp.manager as manager_mod

    calls: list[dict] = []

    class FakeMCPClient:
        def __init__(self, **kwargs):
            calls.append(kwargs)
            self.is_connected = True

        async def connect(self):
            pass

        async def server_status(self):
            # Real shape: sync.progress is {percentComplete, ...}, not a
            # flat number (see app/mcp/manager.py's parse_status).
            return {
                "object_structures": 7,
                "inProgress": False,
                "currentStageName": "done",
                "progress": {"percentComplete": 100},
            }

        async def call_tool(self, name, args):
            return {"tool": name, "args": args, "op_success": True}

        async def aclose(self):
            self.is_connected = False

    def fake_build_client(self, tenant_id, cfg, *, force_reconcile=False):
        return FakeMCPClient(force_reconcile=force_reconcile)

    monkeypatch.setattr(manager_mod.TenantMcpManager, "_build_client", fake_build_client)
    return calls


def create_tenant(client, **overrides) -> dict:
    body = {
        "name": "Test Tenant",
        "url": "http://localhost:9080/maximo",
        "apiKey": "test-api-key-value",
        **overrides,
    }
    res = client.post("/api/tenants", json=body)
    assert res.status_code == 201, res.text
    return res.json()
