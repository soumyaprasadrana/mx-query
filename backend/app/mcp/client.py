"""Maximo MCP stdio client - one per-tenant `maximo-mcp-server` process.

Adapted from `maximo-playbook-platform/src/playbook/core/mcp/client.py`
(docs/DECISIONS.md MQB-002). That project is single-Maximo-tenant and reads
`url`/`dev_mode`/`readonly`/`copilot_mode` off one global `Settings` object;
this project is multi-tenant with per-tenant toggles (MQB-003), so every one
of those becomes a per-instance constructor override here instead.

Config surface (env vars + CLI flags) and version pin (currently `1.4.6`, not
the source project's `1.4.1` - see `config.py`'s `mcp_npm_spec` and
docs/DECISIONS.md MQB-005 for the current pin and why each bump happened)
were verified against the real published package
`@soumyaprasadrana/maximo-mcp-server`'s README (`npm view
...@<version> readme`) and a live `mcp_server_status` call - not assumed
from docs/ARCHITECTURE.md's prose. See docs/pm/STATUS.md for the full
discrepancy notes. `1.4.3` added `extendsObject` on `maximo://object/{name}`
for relationship-inheritance walks (SR -> TICKET); `1.4.4` added
`tlrange`/`tlattribute` timeline date-math filters on `os_query_builder`;
`1.4.5` added a parent-level `domaininternalwhere` (synonym-domain internal-
value filter - `childOptions[].domaininternalwhere` already existed
child-scoped); `1.4.6` is a docs-only patch (no tool/schema change).

Spawn target (`_server_params`): a global install (`shutil.which`) is used
directly when present AND its `--version` output matches the pinned spec -
the Docker image `npm install -g`s the pinned spec at build time for
exactly this - falling back to on-demand `npx -y <spec>` otherwise. Never
rely on npx alone in a container: it re-resolves and rebuilds
`better-sqlite3`'s native module from a cold cache on every single spawn,
which is slow even when it works and fails outright on a runtime image with
no compiler toolchain. The version check is load-bearing, not paranoia: a
from-source dev machine with an unrelated/stale global install under the
same bin name (e.g. an old `npm install -g` from earlier manual testing)
would otherwise get silently preferred over npx and spawned with CLI flags
its old version doesn't understand - reproduced for real (a leftover 1.2.0
global install answering to 1.4.6-era flags, immediate anyio
ExceptionGroup) before this guard existed.

Lifecycle (unchanged from the source - this is the load-bearing part): a
single background task (`_run`) enters both the `stdio_client` and
`ClientSession` async contexts, signals ready, then blocks until `aclose()`
sets a stop event - at which point the `async with` unwinds IN THAT SAME
TASK. Unwinding elsewhere raises "Attempted to exit cancel scope in a
different task" and ORPHANS the npx/node process tree on Windows; unwinding
in the owner task lets mcp>=2.0 tree-kill the server via a Windows Job
Object. `call_tool` is cross-task safe (the session's anyio streams are not
task-bound) - only the lifecycle is owner-task-only.

That same error was also reachable a second way, independent of which task
owns `_run`: `_run` used to apply its connect timeouts with
`asyncio.wait_for(coro, timeout=...)`, which wraps a bare coroutine in a
brand new Task (`ensure_future`) rather than running it inline. Since
`stdio_client(...)`'s body opens an `anyio.create_task_group()`, that task
group got ENTERED from the throwaway wait_for task but EXITED later from
`_run`'s own task (`AsyncExitStack.__aexit__` resumes the generator
directly, no wait_for involved) - the exact same anyio cancel-scope
mismatch, but self-inflicted by `_run` on its very first connect attempt,
not by a caller unwinding from the wrong place. Fixed by using
`asyncio.timeout()` instead, which sets a deadline on the calling task
rather than spawning one.
"""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from contextlib import AsyncExitStack
from functools import lru_cache
from typing import Any, Literal

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.config import get_settings
from app.mcp.errors import MCPConnectionError, MCPToolError
from app.observability import get_logger

logger = get_logger("app.mcp")

QueryMode = Literal["strict", "loose"]

_QUERY_TOOL = "os_query_builder"

# Fixed across versions (`npm view @soumyaprasadrana/maximo-mcp-server bin`) -
# not derived from mcp_npm_spec, which carries the version.
_MCP_BIN_NAME = "maximo-mcp-server"


def parse_npm_spec(spec: str) -> tuple[str, str]:
    """`"@scope/name@1.2.3"` -> `("@scope/name", "1.2.3")`. Splits on the
    LAST `@`, not the first - a scoped package name itself starts with one
    (`@soumyaprasadrana/maximo-mcp-server`), so `partition` would cut in the
    wrong place. Shared with routes/health.py's `/api/version`."""
    name, sep, ver = spec.rpartition("@")
    return (name, ver) if sep else (spec, "")


@lru_cache(maxsize=8)
def _global_bin_matches_pinned_version(bin_path: str, pinned_spec: str) -> bool:
    """Whether the binary shutil.which found actually reports the version we
    pinned - cached per (path, spec) pair so this runs at most once per
    process, not on every connect.

    A stale, unrelated global install under this same bin name is a real,
    silent hazard on any host that isn't the Docker image we control: it
    would otherwise be preferred over npx with zero verification, and a
    version mismatch against the CLI flags this app passes (--force-
    reconcile, --embeddings-mode, ...) can crash the server immediately with
    an opaque anyio ExceptionGroup instead of a clear error - exactly what
    happened against a real local machine that had a leftover 1.2.0 global
    install from earlier manual testing while 1.4.6 was pinned. Only trust
    the global binary when it reports the exact pinned version; anything
    else (mismatch, --version failing, hanging) falls back to npx, which
    always resolves the pinned spec correctly regardless of what else is on
    PATH.
    """
    _, expected_version = parse_npm_spec(pinned_spec)
    if not expected_version:
        return False
    try:
        result = subprocess.run(
            [bin_path, "--version"], capture_output=True, text=True, timeout=10
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return expected_version in result.stdout


class MaximoMCPClient:
    """A single long-lived stdio session to one tenant's `maximo-mcp-server`.

    A dedicated owner task (`_run`) enters and exits the transport contexts,
    so `connect()`, `aclose()`, and `call_tool()` may all be called from any
    task on the same event loop - the caller only signals the owner task.
    """

    def __init__(
        self,
        *,
        url: str,
        api_key: str,
        data_dir: str,
        logs_dir: str,
        dev_mode: bool = True,
        readonly: bool = True,
        copilot_mode: bool = False,
        strict_tool_schema: bool = False,
        embeddings_mode: str = "local",
        force_reconcile: bool = False,
        npm_spec: str | None = None,
        init_timeout: float = 60.0,
    ) -> None:
        settings = get_settings()
        self.npm_spec = npm_spec or settings.mcp_npm_spec
        self.init_timeout = init_timeout

        self._url = url
        self._api_key = api_key
        self._data_dir = data_dir
        self._logs_dir = logs_dir
        self._dev_mode = dev_mode
        self._readonly = readonly
        self._copilot_mode = copilot_mode
        self._strict_tool_schema = strict_tool_schema
        self._embeddings_mode = embeddings_mode
        # `--force-reconcile` (package flag, confirmed via `npm view
        # ...@1.4.6 readme`): a full metadata re-sync on this one spawn,
        # regardless of whether the server thinks its synced data is already
        # current. Only ever set true for a manager-driven resync loader
        # (manager.py's `ensure_ready(..., force_reconcile=True)`), never on
        # the normal warm-client/proxy spawn path.
        self._force_reconcile = force_reconcile

        # Lifecycle is owned by a single background task (see connect/_run/aclose)
        # so the stdio_client + ClientSession contexts are entered AND exited in
        # the same task - the only way anyio's cancel scopes unwind cleanly and
        # the server is tree-killed instead of orphaned.
        self._session: ClientSession | None = None
        self._tools: dict[str, dict[str, Any]] = {}
        self._connected = False
        self._owner_task: asyncio.Task | None = None
        self._ready: asyncio.Event | None = None
        self._stop: asyncio.Event | None = None
        self._connect_error: Exception | None = None

    # -- lifecycle -----------------------------------------------------------

    @property
    def is_connected(self) -> bool:
        return self._connected

    def _server_params(self) -> StdioServerParameters:
        # Secrets go via ENV (not argv, which is visible in process listings);
        # non-secret dirs/toggles go via CLI flags (per the package's own
        # confirmed --maximo-url/--data-dir/... config reference).
        settings = get_settings()
        env: dict[str, str] = {"MAXIMO_URL": self._url, "MAXIMO_API_KEY": self._api_key}

        flags: list[str] = ["--data-dir", self._data_dir, "--logs-dir", self._logs_dir]
        if self._dev_mode:
            flags.append("--dev-mode")  # required for mcp_server_status (warmup gate)
        if self._readonly:
            flags.append("--readonly")
        if self._copilot_mode:
            flags.append("--copilot-mode")
        if self._strict_tool_schema:
            flags.append("--strict-tool-schema")
        if self._embeddings_mode and self._embeddings_mode != "none":
            # Confirmed config surface (docs/pm/STATUS.md): --embeddings-mode
            # none|local|openai, default none. "local" runs an on-box
            # embedder (no external API key needed) - most systems can run
            # it, so it's this app's per-tenant default rather than the
            # package's own off-by-default.
            flags += ["--embeddings-mode", self._embeddings_mode]
        if self._force_reconcile:
            flags.append("--force-reconcile")
        # Deliberately no --reconcile-sync: fire-and-forget sync (the package
        # default) lets mcp_server_status report live stage/percentage for the
        # warmup screen instead of blocking the stdio handshake until done.

        if settings.mcp_cli_path:
            # Local dev: `node <cli.js> <flags>`.
            return StdioServerParameters(command="node", args=[settings.mcp_cli_path, *flags], env=env)
        global_bin = None if settings.mcp_force_npx else shutil.which(_MCP_BIN_NAME)
        if global_bin and _global_bin_matches_pinned_version(global_bin, self.npm_spec):
            # The Docker image `npm install -g`s this at build time (see
            # Dockerfile) so tenants never trigger an on-demand npm/npx
            # install at runtime - that path re-resolves and rebuilds
            # better-sqlite3's native module from a cold cache on every
            # spawn, which is slow and fails outright on a runtime image
            # with no compiler toolchain. The version check guards against
            # an unrelated/stale global install elsewhere on PATH (e.g. a
            # dev machine with an old manual `npm install -g` from earlier
            # testing) silently winning over npx and getting spawned with
            # CLI flags it doesn't understand.
            return StdioServerParameters(command=global_bin, args=flags, env=env)
        if global_bin:
            logger.warning(
                "mcp_global_bin_version_mismatch path=%s pinned=%s - falling back to npx",
                global_bin, self.npm_spec,
            )
        # No matching global install found: fall back to on-demand
        # resolution via npx (SDK resolves npx -> npx.cmd on Windows),
        # which always resolves the pinned spec correctly.
        return StdioServerParameters(command="npx", args=["-y", self.npm_spec, *flags], env=env)

    async def server_status(self) -> Any:
        """Raw `mcp_server_status` snapshot (needs --dev-mode or --readonly).
        Bypasses the sync guard, so it works during an active metadata sync -
        used for the warmup gate."""
        return await self.call_tool("mcp_server_status", {})

    async def connect(self) -> None:
        """Spawn the server, initialize the session, and cache the tool list.

        Runs inside `_run` on a dedicated task; this method just starts it and
        waits until ready (or failed). Raises MCPConnectionError on any
        failure (hard-fail, no silent degrade).
        """
        if self._connected:
            return
        logger.info("mcp_connect_start npm_spec=%s", self.npm_spec)
        self._ready = asyncio.Event()
        self._stop = asyncio.Event()
        self._connect_error = None
        self._owner_task = asyncio.create_task(self._run())

        try:
            await asyncio.wait_for(self._ready.wait(), timeout=self.init_timeout + 5)
        except TimeoutError as exc:
            await self._cancel_owner()
            raise MCPConnectionError("Timed out connecting to MCP server") from exc
        except asyncio.CancelledError:
            # The caller (e.g. a warmup task) was cancelled while we were
            # waiting on the owner task to come up. Without this, the owner
            # task - and the node/npx process it owns - would keep running
            # after connect() unwinds, orphaned on Windows.
            await self._cancel_owner()
            raise

        if self._connect_error is not None:
            await self._cancel_owner()
            err = self._connect_error
            logger.error("mcp_connect_failed error=%s type=%s", err, type(err).__name__)
            raise MCPConnectionError(f"Failed to connect to MCP server: {err}") from err

        logger.info(
            "mcp_connect_ok tool_count=%d query_mode=%s", len(self._tools), self.detect_query_mode()
        )

    async def _run(self) -> None:
        """Own the stdio + session contexts for the client's lifetime.

        Enters both contexts, signals ready, then blocks until `aclose` sets
        the stop event - at which point the `async with` unwinds in THIS
        task, tree-killing the server (mcp>=2.0 Windows Job Object).

        Timeouts here MUST use `asyncio.timeout()`, never `asyncio.wait_for()`
        on a bare coroutine: `wait_for` wraps its argument in a brand new Task
        (`ensure_future`) and runs it there - so `stdio_client(...)`'s
        `async with anyio.create_task_group()` would be ENTERED from that
        throwaway task, while `AsyncExitStack.__aexit__` later resumes and
        EXITS the same generator directly from this method's own task. anyio
        cancel scopes track their owning task and raise "Attempted to exit
        cancel scope in a different task than it was entered in" on that
        mismatch - reproduced locally against a real tenant, first connect
        attempt, well under either timeout, so it wasn't ever the timeout
        firing that triggered it. `asyncio.timeout()` sets a deadline on the
        CURRENT task instead of spawning one, so entry and exit stay on this
        task throughout.
        """
        assert self._ready is not None and self._stop is not None
        try:
            async with AsyncExitStack() as stack:
                async with asyncio.timeout(self.init_timeout):
                    read, write = await stack.enter_async_context(stdio_client(self._server_params()))
                session = await stack.enter_async_context(ClientSession(read, write))
                async with asyncio.timeout(self.init_timeout):
                    await session.initialize()
                await self._load_tools(session)
                self._session = session
                self._connected = True
                self._ready.set()
                await self._stop.wait()  # keep contexts alive until shutdown
        except Exception as exc:  # noqa: BLE001 - surfaced via _connect_error
            self._connect_error = exc
            self._ready.set()
        finally:
            self._connected = False
            self._session = None

    async def _load_tools(self, session: ClientSession) -> None:
        result = await session.list_tools()
        tools: dict[str, dict[str, Any]] = {}
        for tool in result.tools:
            schema = getattr(tool, "input_schema", None) or getattr(tool, "inputSchema", None)
            tools[tool.name] = {
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": schema or {},
            }
        self._tools = tools

    async def aclose(self) -> None:
        """Signal the owner task to unwind (tree-killing the server). Idempotent."""
        if self._owner_task is None:
            return
        logger.info("mcp_shutdown_start")
        if self._stop is not None:
            self._stop.set()
        try:
            await asyncio.wait_for(asyncio.shield(self._owner_task), timeout=15)
        except Exception as exc:  # noqa: BLE001 - best-effort teardown (incl. timeout)
            logger.warning("mcp_shutdown_error error=%s", exc)
            await self._cancel_owner()
        finally:
            self._owner_task = None
            self._session = None
            self._connected = False
            logger.info("mcp_shutdown_ok")

    async def _cancel_owner(self) -> None:
        """Force-cancel the owner task (last resort)."""
        task = self._owner_task
        self._owner_task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except Exception as exc:  # noqa: BLE001 - cancellation teardown
                logger.debug("mcp_owner_cancelled error=%s", exc)
        self._connected = False
        self._session = None

    # -- introspection -------------------------------------------------------

    @property
    def tools(self) -> dict[str, dict[str, Any]]:
        return self._tools

    def get_tool_schema(self, name: str) -> dict[str, Any]:
        if name not in self._tools:
            raise KeyError(f"tool not found: {name} (have: {sorted(self._tools)})")
        return self._tools[name]["input_schema"]

    def detect_query_mode(self) -> QueryMode:
        """Detect strict vs loose OSLC arg shape from the live query-tool schema
        (never hardcode it - the shape is schema-driven, per MQB-004)."""
        schema = self._tools.get(_QUERY_TOOL, {}).get("input_schema") or {}
        props = schema.get("properties", {})
        select = props.get("select", {})
        select_is_array = select.get("type") == "array"
        has_child_selects = "childSelects" in props
        if select_is_array and has_child_selects:
            return "strict"
        return "loose"

    # -- calling -------------------------------------------------------------

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        """Call one tool and return its parsed payload.

        On a tool-reported error, raise MCPToolError carrying the unchanged
        payload. Never fabricate a result.
        """
        if not self._connected or self._session is None:
            raise MCPConnectionError("MCP client is not connected")
        logger.info("mcp_tool_call tool=%s arg_keys=%s", name, sorted(arguments))
        try:
            result = await self._session.call_tool(name, arguments)
        except Exception as exc:
            # The underlying process died mid-call (e.g. bad Maximo URL) - the
            # SDK raises its own untyped MCPError here. Convert to our typed
            # error so callers get the clean envelope, not a raw 500.
            self._connected = False
            logger.error("mcp_call_transport_error tool=%s error=%s", name, exc)
            raise MCPConnectionError(f"MCP transport error calling '{name}': {exc}") from exc
        payload = _extract_payload(result)
        if getattr(result, "is_error", False):
            logger.error("mcp_tool_error tool=%s", name)
            raise MCPToolError(name, payload)
        logger.info("mcp_tool_ok tool=%s", name)
        return payload


def _extract_payload(result: Any) -> Any:
    """Turn a CallToolResult into a plain Python object.

    Prefer `structured_content` (already JSON); otherwise decode the text
    content, parsing JSON when it is JSON and returning the raw string when it
    is not. Multiple content items are returned as a list.
    """
    structured = getattr(result, "structured_content", None)
    if structured is not None:
        return structured

    content = getattr(result, "content", None)
    if content is None:
        return result

    items: list[Any] = []
    for item in content:
        text = getattr(item, "text", None)
        if text is not None:
            items.append(_maybe_json(text))
        elif hasattr(item, "data"):
            items.append(item.data)
        else:
            items.append(item)

    if len(items) == 1:
        return items[0]
    return items


def _maybe_json(text: str) -> Any:
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return text
