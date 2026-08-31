from __future__ import annotations

from tests.conftest import create_tenant


def test_create_tenant_never_returns_the_api_key(client, fake_mcp_client):
    tenant = create_tenant(client)
    assert "apiKey" not in tenant
    assert "api_key_encrypted" not in tenant
    assert tenant["name"] == "Test Tenant"
    assert tenant["devMode"] is True
    assert tenant["readonly"] is True
    assert tenant["copilotMode"] is False


def test_list_tenants_includes_created(client, fake_mcp_client):
    tenant = create_tenant(client)
    res = client.get("/api/tenants")
    assert res.status_code == 200
    assert any(t["id"] == tenant["id"] for t in res.json())


def test_get_tenant_404_for_unknown_id(client):
    res = client.get("/api/tenants/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_delete_tenant_removes_it(client, fake_mcp_client):
    tenant = create_tenant(client)
    res = client.delete(f"/api/tenants/{tenant['id']}")
    assert res.status_code == 204
    assert client.get(f"/api/tenants/{tenant['id']}").status_code == 404


def test_status_self_heals_a_not_started_tenant(client, fake_mcp_client):
    """A tenant status query before any warmup ran (e.g. after a backend
    restart) kicks off warmup instead of getting stuck `not_started`."""
    tenant = create_tenant(client)
    res = client.get(f"/api/tenants/{tenant['id']}/status")
    assert res.status_code == 200
    body = res.json()
    assert body["tenant_id"] == tenant["id"]
    assert "mcp_connected" in body


def test_wake_connects_the_warm_client(client, fake_mcp_client):
    tenant = create_tenant(client)
    res = client.post(f"/api/tenants/{tenant['id']}/wake")
    assert res.status_code == 200
    assert res.json()["mcp_connected"] is True


def test_resync_returns_a_status_snapshot(client, fake_mcp_client):
    """The route itself just kicks off a background warmup task and returns
    immediately — whether force_reconcile actually reached the spawn is
    covered separately (test_resync_actually_forces_reconcile below), since
    asserting on a fire-and-forget task right after the HTTP response would
    be a race (the task may not have run a single tick yet)."""
    tenant = create_tenant(client)
    res = client.post(f"/api/tenants/{tenant['id']}/resync")
    assert res.status_code == 200
    assert res.json()["tenant_id"] == tenant["id"]


def test_resync_404s_for_unknown_tenant(client):
    assert client.post("/api/tenants/does-not-exist/resync").status_code == 404


async def test_resync_actually_forces_reconcile(app, fake_mcp_client):
    """Manager-level test, awaited directly rather than through the
    fire-and-forget route, so it can't race the background task."""
    from app.mcp.manager import TenantConfig, get_mcp_manager

    manager = get_mcp_manager()
    cfg = TenantConfig(url="http://localhost:9080/maximo", api_key="k")
    await manager.ensure_ready("t1", cfg, force_reconcile=True)
    assert any(c.get("force_reconcile") for c in fake_mcp_client)
