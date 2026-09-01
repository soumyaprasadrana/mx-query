# Changelog

## 1.4.0

- Add Excel export of results (ExcelJS) from the builder's results table.
  Default layout is one sheet per relationship: parent sheet with parent
  columns only, child sheets linked back via a Parent column, a child-name
  cell that jumps to that parent's first row on the child sheet. Same-sheet
  outline and flat-leaves layouts are also available for PivotTables.
  Print is always landscape with repeating titles and a footer
- Add a per-hop child row limit control (`childOptions.limit`, default 50)
  with a "No cap" (`noLimit: true`) option, so nested child fetches do not
  silently get capped by the server without the user knowing
- Add a resizable split between the Query and Results panels in the
  builder (drag to resize, double-click to reset)
- Import: a dotted parent WHERE field (`asset.priority`) now unfolds into
  "filter parents by related" hops instead of failing to resolve
- Docs: updated the builder guide for all of the above, and clarified that
  a dotted parent WHERE is an EXISTS filter on related parents, distinct
  from a child-options WHERE that trims which nested rows load
- Fix: `mcp_connect_failed error=Attempted to exit cancel scope in a
  different task than it was entered in` on the very first connect
  attempt for a tenant, reproduced locally. `_run()` applied its connect
  timeouts with `asyncio.wait_for(coro, timeout=...)`, which silently
  wraps a bare coroutine in a brand new Task - so `stdio_client(...)`'s
  internal `anyio.create_task_group()` got entered from that throwaway
  task while `AsyncExitStack.__aexit__` later exited the same generator
  from `_run`'s own task. anyio's cancel scopes require the same task on
  both ends. Fixed by switching to `asyncio.timeout()`, which sets a
  deadline on the calling task instead of spawning one. Verified with an
  isolated repro reproducing the exact RuntimeError with the old code and
  confirming it's gone with the fix, before touching the real client
- Fix: fixing the above surfaced a second, real bug in v1.3.0's global-bin
  spawn logic. It trusted any `maximo-mcp-server` found via `shutil.which`
  with no version check - on a from-source dev machine with an unrelated,
  older global install left over from earlier manual testing (1.2.0, while
  1.4.6 is pinned), that stale binary got silently spawned with 1.4.6-era
  CLI flags it doesn't understand, crashing immediately
  (`unhandled errors in a TaskGroup`). The global binary is now only used
  when its own `--version` output matches the pinned spec; anything else
  falls back to npx, which always resolves the pinned version correctly.
  Reproduced and confirmed fixed against the actual stale install this was
  found on, not just in isolation

## 1.3.0

- Add a standalone CLI (`python -m app.cli`, also installed as
  `mxquery-cli`) for `add-tenant`, `resync`, and `list-tenants` - runs the
  same metadata-sync loop the web UI drives, in the foreground, printing
  progress until it finishes. No HTTP request lifecycle involved, so a
  large Maximo instance's first-time sync isn't tied to a browser tab or
  any request timeout. Point it at the same `mxquery-data` volume as a
  running container and the running server picks up the result on its next
  status check, no restart needed
- `db.py`'s sqlite connection now sets WAL journal mode and a 30s busy
  timeout, needed once the CLI and the running server can open the same
  tenant db file from two separate processes at once

## 1.2.3

- Fix: warmup progress `percentage` was always `null`. The real field is
  `sync.progress.percentComplete` (a nested object) - the status parser
  matched the wrapper `progress` key itself first and silently dropped it
  on the `float()` conversion
- Fix: first-time metadata sync used one flat 600s timeout regardless of
  Maximo instance size, so any large environment (schema loading is one
  HTTP request per object structure) got killed mid-sync. Replaced with a
  stall detector - errors out only once the sync reports no change for
  `MQB_MCP_WARMUP_STALL_TIMEOUT_S` (default 300s) - plus a generous outer
  ceiling `MQB_MCP_WARMUP_TIMEOUT_S` (default 7200s) as a last resort, both
  configurable via env
- Docs: honest sync-time expectation on the warmup screen ("20-30+ minutes
  on large environments" instead of "a few minutes")

## 1.2.2

- Fix: connecting a tenant against the published Docker image failed -
  `maximo-mcp-server` was resolved via `npx` at runtime, which re-downloads
  and rebuilds its native `better-sqlite3` dependency from a cold cache on
  every spawn, and fails outright with no compiler toolchain on the runtime
  image (`prebuild-install` + `node-gyp` both failing, `SIGTERM`)
- The image now `npm install -g`s the pinned `maximo-mcp-server` at build
  time; the backend spawns that global binary directly when present,
  falling back to `npx` only for from-source runs with no global install

## 1.2.1

- Fix `backend.yml`: `runner` context is only valid in a step's `env:`, not a job's - CI was rejecting the workflow file outright
- Fix `release.yml`: unquoted colon in a step name broke YAML parsing
- Fix `ModuleNotFoundError: No module named 'tests'` in CI (`backend/tests` needed `__init__.py`)
- GitHub Releases now attach the built frontend as a zip, not just GitHub's auto-generated source archive
- Docs: added a `docker run` / no-clone `docker-compose.yml` path alongside the existing build-from-source instructions

## 1.2.0

First public release.

- Wizard, builder, and saved-query library against a live Maximo tenant
- Multi-tenant MCP proxy (`POST /api/tenants/{id}/tools/{toolName}`)
- `GET /api/version` - product semver plus the pinned `maximo-mcp-server` spec
- Optional Assist (admin-configured LLM via litellm)
- Docker image and GitHub Pages user guide
