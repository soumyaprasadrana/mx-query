"""Per-tenant MCP lifecycle: warmup gate + warm client pool + idle reaper.

Adapted from `maximo-playbook-platform/src/playbook/core/mcp/manager.py`'s
`MetadataManager` (per-user there, per-tenant here — MQB-002). Each tenant's
Maximo metadata is synced once into `<tenant_data_root>/<tenant_id>/data`
(+ a sibling `logs` dir). `ensure_ready` spawns a short-lived LOADER client,
polls `mcp_server_status` until the catalog is indexed and no sync is in
progress, then shuts the loader down. Readiness is cached and reported to the
UI via `TenantStatus`.

After sync, a tenant's tool calls share ONE warm client (`get_run_client`),
kept connected across proxy requests. The pool owns its lifecycle — closed on
tenant deletion (`shutdown_tenant`), reaped when idle (`sweep_idle`), and on
app shutdown (`shutdown_all`).

`parse_status()` is NOT copied from the source project — it parsed an
already-normalized shape that project's own loader produced. This project
parses the REAL raw `mcp_server_status` response (confirmed live against a
running 1.4.1 server): `{server:{...}, sync:{inProgress, currentStageName,
progress, ...}, database:{counts:{object_structures, ...}}, ...}`.
"""
from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.mcp.client import MaximoMCPClient
from app.observability import get_logger

logger = get_logger("app.mcp.manager")

NOT_STARTED = "not_started"
LOADING = "loading"
READY = "ready"
ERROR = "error"


@dataclass
class TenantStatus:
    tenant_id: str
    state: str = NOT_STARTED
    stage: str | None = None
    percentage: float | None = None
    object_structures: int | None = None
    elapsed_ms: float | None = None
    message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "state": self.state,
            "stage": self.stage,
            "percentage": self.percentage,
            "object_structures": self.object_structures,
            "elapsed_ms": self.elapsed_ms,
            "message": self.message,
        }


def _dig(obj: Any, keys: tuple[str, ...]) -> Any:
    """First value under any of `keys`, searched depth-first (payloads nest,
    and exact key names can drift across maximo-mcp-server patch versions)."""
    if isinstance(obj, dict):
        for k in keys:
            if k in obj and obj[k] is not None:
                return obj[k]
        for v in obj.values():
            found = _dig(v, keys)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _dig(item, keys)
            if found is not None:
                return found
    return None


def parse_status(snapshot: Any) -> tuple[int | None, bool, str | None, float | None]:
    """Pull (object_structures, in_progress, stage, percentage) from a real
    `mcp_server_status` snapshot. Pure + defensive (shape varies by version)."""
    object_structures = _dig(snapshot, ("object_structures",))
    in_progress = _dig(snapshot, ("inProgress", "in_progress"))
    stage = _dig(snapshot, ("currentStageName", "currentStage", "stage"))
    pct = _dig(snapshot, ("progress", "percentage", "percent", "pct"))
    try:
        os_count = int(object_structures) if object_structures is not None else None
    except (TypeError, ValueError):
        os_count = None
    try:
        pct_f = float(pct) if pct is not None else None
    except (TypeError, ValueError):
        pct_f = None
    return os_count, bool(in_progress), (stage if isinstance(stage, str) else None), pct_f


@dataclass
class TenantConfig:
    """The per-tenant knobs a client needs to spawn — decrypted, in-memory only."""

    url: str
    api_key: str
    dev_mode: bool = True
    readonly: bool = True
    copilot_mode: bool = False
    # "none" | "local" | "openai" — see maximo-mcp-server's confirmed config
    # reference (docs/pm/STATUS.md). "local" runs an on-box embedder, no
    # external API key needed, so it's a safe per-tenant default (most
    # systems can run it) — the package itself defaults to "none".
    embeddings_mode: str = "local"


@dataclass
class _WarmClient:
    client: MaximoMCPClient
    last_used: float


class TenantMcpManager:
    """Owns per-tenant metadata readiness, data dirs, and warm MCP clients."""

    def __init__(self) -> None:
        self._status: dict[str, TenantStatus] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._clients: dict[str, _WarmClient] = {}
        self._client_locks: dict[str, asyncio.Lock] = {}
        self._warmup_tasks: dict[str, asyncio.Task] = {}

    def data_dir_for(self, tenant_id: str) -> Path:
        root = Path(get_settings().tenant_data_root)
        return (root / tenant_id / "data").resolve()

    def logs_dir_for(self, tenant_id: str) -> Path:
        root = Path(get_settings().tenant_data_root)
        return (root / tenant_id / "logs").resolve()

    def get_status(self, tenant_id: str) -> TenantStatus:
        return self._status.get(tenant_id, TenantStatus(tenant_id=tenant_id))

    def is_warm(self, tenant_id: str) -> bool:
        """Whether a connected warm client exists RIGHT NOW for this tenant.

        Distinct from `TenantStatus.state == "ready"`, which only reflects
        that the initial metadata sync finished once — the warm client can
        still be gone (idle-reaped by `sweep_idle`, or never spawned since a
        backend restart) even when the tenant is otherwise "ready". The
        frontend uses this to show a "reconnecting, this may take a moment"
        notice instead of a tool call just hanging on a cold spawn.
        """
        entry = self._clients.get(tenant_id)
        return entry is not None and entry.client.is_connected

    def _lock(self, tenant_id: str) -> asyncio.Lock:
        if tenant_id not in self._locks:
            self._locks[tenant_id] = asyncio.Lock()
        return self._locks[tenant_id]

    def _client_lock(self, tenant_id: str) -> asyncio.Lock:
        if tenant_id not in self._client_locks:
            self._client_locks[tenant_id] = asyncio.Lock()
        return self._client_locks[tenant_id]

    def _build_client(self, tenant_id: str, cfg: TenantConfig, *, force_reconcile: bool = False) -> MaximoMCPClient:
        data_dir = self.data_dir_for(tenant_id)
        logs_dir = self.logs_dir_for(tenant_id)
        data_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)
        return MaximoMCPClient(
            url=cfg.url,
            api_key=cfg.api_key,
            data_dir=str(data_dir),
            logs_dir=str(logs_dir),
            dev_mode=cfg.dev_mode,
            readonly=cfg.readonly,
            copilot_mode=cfg.copilot_mode,
            embeddings_mode=cfg.embeddings_mode,
            force_reconcile=force_reconcile,
        )

    async def get_run_client(self, tenant_id: str, cfg: TenantConfig) -> MaximoMCPClient:
        """Return the tenant's **warm** connected client, creating it on first
        use. Reused across proxy calls — the pool owns its lifecycle, so the
        caller must NOT `aclose()` it. A dead/disconnected client is
        transparently replaced. Serialized per tenant so concurrent first
        calls spawn only one server."""
        async with self._client_lock(tenant_id):
            entry = self._clients.get(tenant_id)
            if entry is not None and entry.client.is_connected:
                entry.last_used = time.monotonic()
                return entry.client
            if entry is not None:  # stale/dead -> drop and rebuild
                await self._safe_close(tenant_id, entry.client)
                self._clients.pop(tenant_id, None)

            client = self._build_client(tenant_id, cfg)
            await client.connect()  # MCPConnectionError bubbles to the caller
            self._clients[tenant_id] = _WarmClient(client=client, last_used=time.monotonic())
            logger.info("mcp_warm_client_started tenant=%s", tenant_id)
            return client

    def start_warmup(self, tenant_id: str, cfg: TenantConfig, *, force_reconcile: bool = False) -> None:
        """Kick off `ensure_ready` in the background, tracked so a delete mid-
        warmup can cancel it instead of leaking the loader's node process.
        `force_reconcile=True` is the on-demand "force resync" action
        (`POST /tenants/{id}/resync`) — bypasses the cached-ready short
        circuit and tells the spawned server to redo a full metadata sync
        regardless of what it thinks is already current."""
        task = self._warmup_tasks.get(tenant_id)
        if task is not None and not task.done():
            if not force_reconcile:
                return  # already warming up, nothing more to do
            task.cancel()  # an explicit force-resync request preempts a stale in-flight warmup
        task = asyncio.create_task(self._run_warmup(tenant_id, cfg, force_reconcile=force_reconcile))
        self._warmup_tasks[tenant_id] = task

    async def _run_warmup(self, tenant_id: str, cfg: TenantConfig, *, force_reconcile: bool = False) -> None:
        try:
            await self.ensure_ready(tenant_id, cfg, force=force_reconcile, force_reconcile=force_reconcile)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - status carries the error, this just logs
            logger.error("tenant_warmup_failed tenant=%s error=%s", tenant_id, exc)
        finally:
            self._warmup_tasks.pop(tenant_id, None)

    async def shutdown_tenant(self, tenant_id: str) -> None:
        """Close and drop the tenant's warm client (delete / logout), and
        cancel any in-flight warmup so its loader process doesn't leak.
        Idempotent."""
        warmup = self._warmup_tasks.pop(tenant_id, None)
        if warmup is not None and not warmup.done():
            warmup.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await warmup

        entry = self._clients.pop(tenant_id, None)
        if entry is not None:
            await self._safe_close(tenant_id, entry.client)
            logger.info("mcp_warm_client_stopped tenant=%s", tenant_id)
        self._status.pop(tenant_id, None)

    async def sweep_idle(self, max_idle_s: float) -> list[str]:
        """Close warm clients idle longer than `max_idle_s`. Returns the
        tenant ids reaped."""
        now = time.monotonic()
        stale = [tid for tid, e in self._clients.items() if now - e.last_used > max_idle_s]
        for tid in stale:
            entry = self._clients.pop(tid, None)
            if entry is not None:
                await self._safe_close(tid, entry.client)
        return stale

    async def shutdown_all(self) -> None:
        """Cancel every in-flight warmup and close every warm client (app
        shutdown)."""
        for tid in list(self._warmup_tasks):
            task = self._warmup_tasks.pop(tid, None)
            if task is not None and not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await task
        for tid in list(self._clients):
            entry = self._clients.pop(tid, None)
            if entry is not None:
                await self._safe_close(tid, entry.client)

    async def _safe_close(self, tenant_id: str, client: MaximoMCPClient) -> None:
        try:
            await client.aclose()
        except Exception as exc:  # noqa: BLE001 - best-effort teardown
            logger.warning("mcp_warm_client_close_error tenant=%s error=%s", tenant_id, exc)

    async def ensure_ready(
        self, tenant_id: str, cfg: TenantConfig, force: bool = False, force_reconcile: bool = False
    ) -> TenantStatus:
        """Ensure the tenant's metadata is synced. Runs the loader once
        (serialized per tenant); reuses an already-ready state / synced dir
        unless `force` (redo our own readiness check) or `force_reconcile`
        (also tell the spawned server to fully re-sync, not just verify)."""
        async with self._lock(tenant_id):
            current = self._status.get(tenant_id)
            if current and current.state == READY and not force and not force_reconcile:
                return current
            return await self._load(tenant_id, cfg, force_reconcile=force_reconcile)

    async def _load(self, tenant_id: str, cfg: TenantConfig, *, force_reconcile: bool = False) -> TenantStatus:
        settings = get_settings()
        status = TenantStatus(
            tenant_id=tenant_id, state=LOADING,
            message="Starting forced metadata resync" if force_reconcile else "Starting metadata sync",
        )
        self._status[tenant_id] = status
        started = time.perf_counter()

        if force_reconcile:
            # The warm client (if any) and this loader would otherwise both
            # touch the same on-disk metadata db concurrently — one idle,
            # one actively resyncing. Close it first; the next tool-call
            # proxy request respawns a fresh warm client against the
            # now-current data once this loader finishes and exits.
            entry = self._clients.pop(tenant_id, None)
            if entry is not None:
                await self._safe_close(tenant_id, entry.client)
                logger.info("mcp_warm_client_stopped_for_resync tenant=%s", tenant_id)

        loader = self._build_client(tenant_id, cfg, force_reconcile=force_reconcile)
        try:
            try:
                await loader.connect()
            except Exception as exc:  # noqa: BLE001 - surface as error state
                status.state = ERROR
                status.message = f"MCP loader failed to start: {exc}"
                logger.error("metadata_loader_failed tenant=%s error=%s", tenant_id, exc)
                return status

            deadline = started + settings.mcp_warmup_timeout_s
            while True:
                try:
                    snapshot = await loader.server_status()
                    os_count, in_progress, stage, pct = parse_status(snapshot)
                except Exception as exc:  # noqa: BLE001 - probe error, keep waiting
                    logger.warning("metadata_probe_error tenant=%s error=%s", tenant_id, exc)
                    os_count, in_progress, stage, pct = None, True, None, None

                status.object_structures = os_count
                status.stage = stage
                status.percentage = pct
                status.elapsed_ms = (time.perf_counter() - started) * 1000.0

                if os_count is not None and os_count > 0 and not in_progress:
                    status.state = READY
                    status.message = f"Ready - {os_count} object structures indexed"
                    logger.info("metadata_ready tenant=%s object_structures=%d", tenant_id, os_count)
                    return status

                status.message = f"Syncing metadata{f' ({stage})' if stage else ''}"
                if time.perf_counter() >= deadline:
                    status.state = ERROR
                    status.message = f"Metadata sync timed out after {settings.mcp_warmup_timeout_s}s"
                    logger.error("metadata_timeout tenant=%s", tenant_id)
                    return status
                await asyncio.sleep(3)
        finally:
            # Shut the loader down regardless — the warm client (if requested
            # later) reconnects against the same already-synced data dir.
            await loader.aclose()


_manager: TenantMcpManager | None = None


def get_mcp_manager() -> TenantMcpManager:
    global _manager
    if _manager is None:
        _manager = TenantMcpManager()
    return _manager
