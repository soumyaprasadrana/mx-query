# Changelog

## 1.2.3

- Fix: warmup progress `percentage` was always `null`. The real field is
  `sync.progress.percentComplete` (a nested object) — the status parser
  matched the wrapper `progress` key itself first and silently dropped it
  on the `float()` conversion
- Fix: first-time metadata sync used one flat 600s timeout regardless of
  Maximo instance size, so any large environment (schema loading is one
  HTTP request per object structure) got killed mid-sync. Replaced with a
  stall detector — errors out only once the sync reports no change for
  `MQB_MCP_WARMUP_STALL_TIMEOUT_S` (default 300s) — plus a generous outer
  ceiling `MQB_MCP_WARMUP_TIMEOUT_S` (default 7200s) as a last resort, both
  configurable via env
- Docs: honest sync-time expectation on the warmup screen ("20-30+ minutes
  on large environments" instead of "a few minutes")

## 1.2.2

- Fix: connecting a tenant against the published Docker image failed —
  `maximo-mcp-server` was resolved via `npx` at runtime, which re-downloads
  and rebuilds its native `better-sqlite3` dependency from a cold cache on
  every spawn, and fails outright with no compiler toolchain on the runtime
  image (`prebuild-install` + `node-gyp` both failing, `SIGTERM`)
- The image now `npm install -g`s the pinned `maximo-mcp-server` at build
  time; the backend spawns that global binary directly when present,
  falling back to `npx` only for from-source runs with no global install

## 1.2.1

- Fix `backend.yml`: `runner` context is only valid in a step's `env:`, not a job's — CI was rejecting the workflow file outright
- Fix `release.yml`: unquoted colon in a step name broke YAML parsing
- Fix `ModuleNotFoundError: No module named 'tests'` in CI (`backend/tests` needed `__init__.py`)
- GitHub Releases now attach the built frontend as a zip, not just GitHub's auto-generated source archive
- Docs: added a `docker run` / no-clone `docker-compose.yml` path alongside the existing build-from-source instructions

## 1.2.0

First public release.

- Wizard, builder, and saved-query library against a live Maximo tenant
- Multi-tenant MCP proxy (`POST /api/tenants/{id}/tools/{toolName}`)
- `GET /api/version` — product semver plus the pinned `maximo-mcp-server` spec
- Optional Assist (admin-configured LLM via litellm)
- Docker image and GitHub Pages user guide
