"""FastAPI application factory + lifespan.

Adapted from `maximo-playbook-platform/src/playbook/api/app.py`: an app
FACTORY (`create_app`) so tests/scripts can build an app without a live
server, a lifespan that inits the tenant db and starts the idle-reaper task,
a correlation-id middleware, and `_mount_frontend` serving the built SPA
(no-op until Phase 2 builds `frontend/dist`).
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import error_body
from app.llm import sessions as assist_sessions
from app.mcp.manager import get_mcp_manager
from app.observability import configure_logging, get_logger, new_correlation_id, set_correlation_id
from app import db

logger = get_logger("app.api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("startup_begin app=%s version=%s", settings.app_name, settings.app_version)

    db.init_db()
    logger.info("db_ready path=%s", settings.tenant_db_path)

    manager = get_mcp_manager()
    reaper = asyncio.create_task(_warm_client_reaper(manager, settings.mcp_warm_idle_s))
    assist_reaper = asyncio.create_task(_assist_session_reaper(settings.assist_session_idle_s))
    logger.info("startup_complete")
    try:
        yield
    finally:
        reaper.cancel()
        assist_reaper.cancel()
        with suppress(asyncio.CancelledError):
            await reaper
        with suppress(asyncio.CancelledError):
            await assist_reaper
        await manager.shutdown_all()
        logger.info("shutdown_complete")


async def _warm_client_reaper(manager, idle_s: float) -> None:
    """Periodically close warm MCP clients idle beyond `idle_s`."""
    interval = max(60, min(idle_s, 300))
    while True:
        await asyncio.sleep(interval)
        try:
            reaped = await manager.sweep_idle(idle_s)
            if reaped:
                logger.info("mcp_warm_clients_reaped tenants=%s", reaped)
        except Exception as exc:  # noqa: BLE001 - sweeper must not die
            logger.warning("mcp_reaper_error error=%s", exc)


async def _assist_session_reaper(idle_s: float) -> None:
    """Periodically drop Assist conversation sessions idle beyond `idle_s`
    (see `app/llm/sessions.py`) — same shape as `_warm_client_reaper`, a
    shorter default interval since the idle window itself is much shorter
    ("a wizard session," minutes, not the MCP pool's default 30 minutes)."""
    interval = max(30, min(idle_s, 120))
    while True:
        await asyncio.sleep(interval)
        try:
            reaped = assist_sessions.sweep_idle(idle_s)
            if reaped:
                logger.info("assist_sessions_reaped count=%s", reaped)
        except Exception as exc:  # noqa: BLE001 - sweeper must not die
            logger.warning("assist_session_reaper_error error=%s", exc)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Multi-tenant MCP tool-call proxy for the Maximo OSLC query builder.",
        docs_url=f"{settings.api_prefix}/docs",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        """FastAPI's default handler wraps `exc.detail` under a `"detail"`
        key, which breaks `errors.py`'s stable `{"error": {...}}` envelope
        for the handful of routes (`deps.get_tenant_or_404`,
        `admin.require_admin`) that already raise `HTTPException` with a
        pre-built error-body `detail`. Re-serve it unwrapped so the frontend's
        `ApiError` parsing (which reads `body.error`) works for these too."""
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return JSONResponse(status_code=exc.status_code, content=error_body("http_error", str(exc.detail)))

    @app.middleware("http")
    async def correlation_id_mw(request: Request, call_next):
        cid = request.headers.get("x-correlation-id") or new_correlation_id()
        set_correlation_id(cid)
        response = await call_next(request)
        response.headers["x-correlation-id"] = cid
        return response

    from app.routes import admin, assist, health, llm, saved_queries, tenants, theme, tools

    app.include_router(health.router, prefix=settings.api_prefix, tags=["health"])
    app.include_router(tenants.router, prefix=settings.api_prefix, tags=["tenants"])
    app.include_router(tools.router, prefix=settings.api_prefix, tags=["tools"])
    app.include_router(assist.router, prefix=settings.api_prefix, tags=["assist"])
    app.include_router(llm.router, prefix=settings.api_prefix, tags=["llm"])
    app.include_router(admin.router, prefix=settings.api_prefix, tags=["admin"])
    app.include_router(theme.router, prefix=settings.api_prefix, tags=["theme"])
    app.include_router(saved_queries.router, prefix=settings.api_prefix, tags=["saved-queries"])

    if settings.serve_frontend:
        _mount_frontend(app, settings.api_prefix)
    return app


def _mount_frontend(app: FastAPI, api_prefix: str) -> None:
    """Serve the built SPA (frontend/dist) at `/` with a client-side-routing
    fallback. Registered after the API routers, so `/api/*` still wins.
    No-op (with a log warning) until Phase 2 builds the frontend.
    """
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    index = dist / "index.html"
    if not index.exists():
        logger.warning("frontend_not_built dist=%s", dist)
        return

    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    prefix = api_prefix.strip("/")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path == prefix or full_path.startswith(prefix + "/"):
            return JSONResponse(
                status_code=404,
                content={"error": {"code": "not_found", "message": f"no route /{full_path}"}},
            )
        candidate = dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)

    logger.info("frontend_mounted dist=%s", dist)


app = create_app()
