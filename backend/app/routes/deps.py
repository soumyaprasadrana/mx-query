"""Shared route helpers: resolve a tenant id to a DB row / decrypted MCP config."""
from __future__ import annotations

from fastapi import HTTPException

from app import crypto, db
from app.errors import error_body
from app.mcp.manager import TenantConfig


def get_tenant_or_404(tenant_id: str) -> db.Tenant:
    tenant = db.get_tenant(tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail=error_body("not_found", f"no tenant '{tenant_id}'"))
    return tenant


def tenant_mcp_config(tenant: db.Tenant) -> TenantConfig:
    return TenantConfig(
        url=tenant.url,
        api_key=crypto.decrypt_secret(tenant.api_key_encrypted),
        dev_mode=tenant.dev_mode,
        readonly=tenant.readonly,
        copilot_mode=tenant.copilot_mode,
        embeddings_mode=tenant.embeddings_mode,
    )
