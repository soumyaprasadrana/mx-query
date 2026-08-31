"""Tenant lifecycle endpoints: create/list/get/delete + status polling.

Per docs/ARCHITECTURE.md's "Tenant lifecycle (the warmup gate)": create
validates+persists+kicks off sync in the background; the frontend polls
`GET /tenants/{id}/status` on a warmup screen until `ready`.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app import crypto, db
from app.errors import error_response
from app.mcp.errors import MCPConnectionError
from app.mcp.manager import get_mcp_manager
from app.routes.deps import get_tenant_or_404, tenant_mcp_config

router = APIRouter()


class CreateTenantRequest(BaseModel):
    name: str = Field(min_length=1)
    url: str = Field(min_length=1)
    apiKey: str = Field(min_length=1)
    # Defaults per docs/DECISIONS.md MQB-003: devMode/readonly on, copilotMode off.
    devMode: bool = True
    readonly: bool = True
    copilotMode: bool = False
    # "local" runs maximo-mcp-server's on-box embedder (no external API key) —
    # most systems can run it, so it's the default here even though the
    # package itself defaults to "none" (see docs/pm/STATUS.md).
    embeddingsMode: Literal["none", "local", "openai"] = "local"


@router.post("/tenants", status_code=201)
async def create_tenant(body: CreateTenantRequest) -> dict:
    encrypted = crypto.encrypt_secret(body.apiKey)
    tenant = db.create_tenant(
        body.name,
        body.url,
        encrypted,
        dev_mode=body.devMode,
        readonly=body.readonly,
        copilot_mode=body.copilotMode,
        embeddings_mode=body.embeddingsMode,
    )
    get_mcp_manager().start_warmup(tenant.id, tenant_mcp_config(tenant))
    return tenant.public()


@router.get("/tenants")
async def list_tenants() -> list[dict]:
    return [t.public() for t in db.list_tenants()]


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant: db.Tenant = Depends(get_tenant_or_404)) -> dict:
    return tenant.public()


@router.delete("/tenants/{tenant_id}", status_code=204)
async def delete_tenant(tenant: db.Tenant = Depends(get_tenant_or_404)) -> None:
    await get_mcp_manager().shutdown_tenant(tenant.id)
    db.delete_tenant(tenant.id)


@router.get("/tenants/{tenant_id}/status")
async def tenant_status(tenant: db.Tenant = Depends(get_tenant_or_404)) -> dict:
    manager = get_mcp_manager()
    status = manager.get_status(tenant.id)
    if status.state == "not_started":
        # Self-heal: a restarted backend has no in-memory status for an
        # already-created tenant. Kick off warmup instead of leaving the UI
        # stuck on not_started forever.
        manager.start_warmup(tenant.id, tenant_mcp_config(tenant))
    body = status.to_dict()
    # Live pool state, not the cached sync-status: a "ready" tenant can still
    # have no warm client right now (idle-reaped, or backend just restarted).
    body["mcp_connected"] = manager.is_warm(tenant.id)
    return body


@router.post("/tenants/{tenant_id}/wake")
async def wake_tenant(tenant: db.Tenant = Depends(get_tenant_or_404)):
    """Proactively (re)connect the tenant's warm MCP client.

    Call this when entering the builder so a cold client respawns before the
    user's first query, instead of the first tool call silently eating the
    spawn+handshake delay. Idempotent — a no-op if already warm.
    """
    manager = get_mcp_manager()
    try:
        await manager.get_run_client(tenant.id, tenant_mcp_config(tenant))
    except MCPConnectionError as exc:
        return error_response(503, "mcp_connection_error", str(exc))
    return {"mcp_connected": True}


@router.post("/tenants/{tenant_id}/resync")
async def resync_tenant(tenant: db.Tenant = Depends(get_tenant_or_404)) -> dict:
    """On-demand force resync of this tenant's Maximo metadata — the UI
    action for when someone knows the Maximo schema changed and doesn't want
    to wait for it to naturally drift back in.

    There's no long-lived background process to "just tell to resync":
    `maximo-mcp-server` is spawned per-tenant and idle-reaped after
    `MQB_MCP_WARM_IDLE_S`, so a resync means spawning a fresh one with the
    package's own `--force-reconcile` flag (confirmed via `npm view
    @soumyaprasadrana/maximo-mcp-server@1.4.6 readme` — forces a full
    re-sync regardless of what the server thinks is already current, unlike
    the default `--reconcile-on-startup` behavior this app otherwise relies
    on). Runs in the background exactly like the initial tenant warmup —
    poll the existing `GET /tenants/{id}/status` to watch progress, same
    `state`/`stage`/`percentage` shape, no new polling endpoint needed.
    """
    manager = get_mcp_manager()
    manager.start_warmup(tenant.id, tenant_mcp_config(tenant), force_reconcile=True)
    status = manager.get_status(tenant.id)
    body = status.to_dict()
    body["mcp_connected"] = manager.is_warm(tenant.id)
    return body
