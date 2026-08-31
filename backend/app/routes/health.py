"""Health + version. `/version` is deliberately minimal — app name/semver
plus the pinned `maximo-mcp-server` compatibility fact, no git sha/
environment/python-version — this is a public endpoint a customer's UI
badge or a status page hits, not a debug surface. The MCP package/version
split IS worth exposing here even under that "no dev stuff" bar: it's a
real product compatibility fact (which OSLC/tool-schema fixes this
deployment actually has — see docs/DECISIONS.md MQB-005's version history),
not an internal debugging detail."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


def _parse_npm_spec(spec: str) -> tuple[str, str]:
    """`"@scope/name@1.2.3"` -> `("@scope/name", "1.2.3")`. Splits on the
    LAST `@`, not the first — a scoped package name itself starts with one
    (`@soumyaprasadrana/maximo-mcp-server`), so `partition` would cut in the
    wrong place."""
    name, sep, ver = spec.rpartition("@")
    return (name, ver) if sep else (spec, "")


@router.get("/version")
async def version() -> dict:
    settings = get_settings()
    mcp_package, mcp_version = _parse_npm_spec(settings.mcp_npm_spec)
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "mcpServer": {"package": mcp_package, "version": mcp_version},
    }
