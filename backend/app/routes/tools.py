"""The one generic tool-call proxy endpoint (docs/DECISIONS.md MQB-001).

No per-tool bespoke endpoints. `args` is forwarded to the tenant's live MCP
client unchanged; the tool's response is returned unchanged.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app import db
from app.errors import error_response
from app.mcp.errors import MCPConnectionError, MCPToolError
from app.mcp.manager import get_mcp_manager
from app.routes.deps import get_tenant_or_404, tenant_mcp_config

router = APIRouter()


@router.post("/tenants/{tenant_id}/tools/{tool_name}")
async def call_tool(
    tool_name: str,
    args: dict[str, Any] | None = None,
    tenant: db.Tenant = Depends(get_tenant_or_404),
):
    manager = get_mcp_manager()
    cfg = tenant_mcp_config(tenant)
    try:
        client = await manager.get_run_client(tenant.id, cfg)
        return await client.call_tool(tool_name, args or {})
    except MCPToolError as exc:
        return error_response(502, "mcp_tool_error", str(exc), detail=exc.detail)
    except MCPConnectionError as exc:
        return error_response(503, "mcp_connection_error", str(exc))
