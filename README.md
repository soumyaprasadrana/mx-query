# mxQuery

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/public/logo-dark.svg" />
    <img src="frontend/public/logo-light.svg" alt="mxQuery" width="440" height="120" />
  </picture>
</p>

<p align="center">
  Visual OSLC query studio for IBM Maximo.
</p>

<p align="center">
  <img src="docs-site/docs/public/og.png" alt="mxQuery flow: search OS, load schema, hop and filter, then the Maximo OSLC GET URL. Stack: Browser to mxQuery to maximo-mcp-server to Maximo." width="800" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0" /></a>
  <a href="https://github.com/soumyaprasadrana/mx-query/releases/latest"><img src="https://img.shields.io/github/v/release/soumyaprasadrana/mx-query?label=release" alt="Latest release" /></a>
  <a href="https://hub.docker.com/r/soumyaprasadrana/mx-query"><img src="https://img.shields.io/docker/v/soumyaprasadrana/mx-query?label=docker&logo=docker" alt="Docker" /></a>
  <a href="backend/pyproject.toml"><img src="https://img.shields.io/badge/python-3.11%2B-3776AB.svg" alt="Python 3.11+" /></a>
  <a href="frontend/package.json"><img src="https://img.shields.io/badge/node-20%2B-339933.svg" alt="Node 20+" /></a>
  <a href="https://github.com/soumyaprasadrana/mx-query/actions/workflows/frontend.yml"><img src="https://github.com/soumyaprasadrana/mx-query/actions/workflows/frontend.yml/badge.svg" alt="Frontend CI" /></a>
  <a href="https://github.com/soumyaprasadrana/mx-query/actions/workflows/backend.yml"><img src="https://github.com/soumyaprasadrana/mx-query/actions/workflows/backend.yml/badge.svg" alt="Backend CI" /></a>
  <a href="https://soumyaprasadrana.github.io/mx-query/"><img src="https://img.shields.io/badge/docs-GitHub%20Pages-7C3AED.svg" alt="Documentation" /></a>
  <a href="https://github.com/soumyaprasadrana/maximo-mcp-server"><img src="https://img.shields.io/badge/mcp-maximo--mcp--server-7C3AED.svg" alt="maximo-mcp-server" /></a>
</p>

Connect a Maximo instance, pick an object structure, add fields and filters, and run the query. The browser talks to [`maximo-mcp-server`](https://github.com/soumyaprasadrana/maximo-mcp-server) through a small Python proxy. It does not rebuild Maximo's query language in JavaScript.

```
Browser  ->  mxQuery (UI + MCP proxy)  ->  maximo-mcp-server  ->  Maximo
```

**Docs:** [User guide](https://soumyaprasadrana.github.io/mx-query/) | [Install](https://soumyaprasadrana.github.io/mx-query/getting-started) | [Architecture](https://soumyaprasadrana.github.io/mx-query/architecture)

## Features

- **Wizard** - one question at a time from intent to a runnable query
- **Builder** - object-structure search, parent and child columns, WHERE, nested child-row filters, sort, execute, import of tool-call JSON or an OSLC GET
- **Saved queries** - folders, tags, and open in builder, results, or a report view (per tenant)
- **Assist (optional)** - suggests names from the live tenant catalog only; off until an admin configures an LLM provider. Use a real provider, not the local default - see [Configuration](#configuration)
- **Multi-tenant** - each Maximo URL + API key is a tenant, with its own MCP process and metadata sync
- **CLI tenant management** - `python -m app.cli add-tenant`/`resync` sync a tenant to completion outside the web UI, useful for a large Maximo instance's first-time sync - see [Deployment](https://soumyaprasadrana.github.io/mx-query/deployment)
- **Read-only by default** - write / form designer is not in this release

Not in this release: nested `childSelects` / `rel.` column picking, and create/update (Form Builder).

## Quick start

You need a Maximo instance reachable over HTTPS and an API key for that instance.

### Deploy the MAXMCPMETADATA automation script (mandatory)

The metadata engine requires this script to extract object and attribute metadata from Maximo. Without it the server starts, but metadata sync fails and every tool call returns `metadata_sync_in_progress`.

- Script name: `MAXMCPMETADATA`
- Source: `https://raw.githubusercontent.com/soumyaprasadrana/maximo-mcp-server/refs/heads/main/MAXMCPMETADATA.py`

Deploy steps in Maximo Administration:

1. Go to System Configuration -> Platform Configuration -> Automation Scripts
2. Create a new script named `MAXMCPMETADATA`
3. Paste the content from the URL above
4. Activate the script - this is mandatory, otherwise metadata can never be retrieved

### Docker

Published image, no clone needed. Set up the tenant first, then start the app - for a large Maximo instance this is the more reliable order, since the sync runs to completion in its own short-lived container instead of racing a browser tab and a request timeout:

```bash
docker run --rm -v mxquery-data:/data \
  -e MQB_SESSION_ENCRYPTION_KEY=change-me \
  soumyaprasadrana/mx-query:latest \
  python -m app.cli add-tenant --name "Prod" --url https://your-host/maximo --api-key your-api-key

docker run -d --name mxquery -p 8000:8000 \
  -e MQB_SESSION_ENCRYPTION_KEY=change-me \
  -v mxquery-data:/data \
  soumyaprasadrana/mx-query:latest
```

**`MQB_SESSION_ENCRYPTION_KEY` must be set, and identical, in both commands.** Without it, the app falls back to a key derived from the container's own hostname - and every `docker run` is a separate container with a different random hostname. The first command would then encrypt that tenant's API key with one key; the second, long-running container would try to decrypt it with a different key and fail, permanently, for that tenant. Generate one real value (`openssl rand -hex 32` works) and reuse it for every `docker run` against this same `mxquery-data` volume - not something you can leave unset and get away with here, unlike a single long-lived local install.

Skip the first command to use the in-browser setup wizard instead - both work, and `add-tenant`/`resync` are available from the CLI any time afterward, same volume, same key.

Or build the image from source:

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
cp .env.example .env
docker compose up --build
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Full options, including a no-clone `docker-compose.yml`: [Install](https://soumyaprasadrana.github.io/mx-query/getting-started).

Persistent state (tenant registry, encrypted keys, synced metadata) lives in the `mxquery-data` volume. `docker compose down` keeps it; `docker compose down -v` deletes it.

The image includes Python **and** Node: `maximo-mcp-server` is installed globally at build time and spawned directly per tenant, not resolved via `npx` at runtime.

### From source, no Docker

Two ways to get the app itself: `git clone` (needs Node 20+ and Python 3.11+, builds the frontend), or download `mxQuery-<version>.zip` from [Releases](https://github.com/soumyaprasadrana/mx-query/releases) (backend source plus an already-built frontend - Python 3.11+ only, no Node needed).

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
./start.ps1     # Windows PowerShell
./start.sh      # macOS / Linux / Git Bash
```

That builds the UI (skipped automatically if you're running the release zip instead, which ships `frontend/dist` prebuilt) and starts the backend, which serves it on port 8000. API docs: `/api/docs`.

Unlike Docker, a local install's machine-derived encryption key (used when `MQB_SESSION_ENCRYPTION_KEY` is unset) stays stable across runs - it is your one machine's hostname every time, not a fresh random container id - so this is fine for a single-machine solo try. Set `MQB_SESSION_ENCRYPTION_KEY` explicitly in `backend/.env` anyway for anything you would mind losing (see [Configuration](#configuration)).

Set up a tenant from the CLI before opening the browser, same idea as the Docker flow above:

```bash
cd backend
python -m app.cli add-tenant --name "Prod" --url https://your-host/maximo --api-key your-api-key
```

Frontend-only, with a backend already on `:8000`:

```bash
cd frontend
npm ci
npm run dev
```

Do not start a second backend against the same tenant data directory.

## First run

1. **Connect a tenant** - name, Maximo URL (for example `https://your-host/maximo`), API key. Read-only is on by default. Already added it from the CLI (see Quick start above)? Skip to step 3.
2. **Wait for warmup** - object-structure metadata syncs once. The query UI waits until that finishes.
3. **Home** - Wizard, Builder, or Saved Queries.

| Path | Screen |
|---|---|
| `/` | Home, or the tenant picker if this browser has no session |
| `/setup` | New Maximo connection |
| `/wizard` | Guided query |
| `/builder` | Query builder |
| `/builder/report` | Saved-query report |
| `/library` | Saved queries |

Tenant id stays in `localStorage` (`mqb.tenantId`). It is a session, not a shareable link.

## Configuration

Environment variables use the `MQB_` prefix. Local defaults work for a first run. Full table: [Configuration](https://soumyaprasadrana.github.io/mx-query/configuration).

| Variable | Default | What it does |
|---|---|---|
| `MQB_SESSION_ENCRYPTION_KEY` | machine-derived | AES-256-GCM key for tenant API keys at rest. The machine-derived fallback is a container's own random hostname in Docker - unset means a tenant added in one `docker run` cannot be read by another. Always set this explicitly in Docker; set it for any shared host either way. |
| `MQB_ADMIN_PASSWORD` | unset | Gates Settings (LLM, theme). Blank disables the login screen entirely. |
| `MQB_LLM_MODEL` | `ollama/qwen2.5:1.5b` | Deploy-time default for Assist ([litellm](https://github.com/BerriAI/litellm) model string). Zero-setup only - too weak to give good picks. Use `openai/gpt-4o-mini` or similar for Assist to actually be worth turning on. |
| `MQB_LLM_API_KEY` / `MQB_LLM_API_BASE` | unset / `http://127.0.0.1:11434` | Provider credentials / endpoint when needed |
| `MQB_MCP_NPM_SPEC` | pinned `maximo-mcp-server` | Override the MCP server package for local testing |
| `MQB_TENANT_DB_PATH` | `./data/tenants.db` | Tenant registry + LLM/theme config (sqlite) |

`GET /api/version` returns `{ name, version, mcpServer }` - product semver and the pinned MCP npm spec.

**Do not point `MQB_TENANT_DB_PATH` at a live `tenants.db` when running tests or ad-hoc scripts.** That file holds encrypted Maximo keys and admin LLM config. Use a scratch path; see [CONTRIBUTING.md](CONTRIBUTING.md).

From Docker, `127.0.0.1` is the container. Ollama on the host needs `host.docker.internal` (`docker-compose.yml` already sets this up).

## Repository layout

```
backend/     FastAPI proxy - tenants, MCP pool, tool-call forwarder
frontend/    React + TypeScript UI (no OSLC construction)
docs-site/   Public user guide (VitePress -> GitHub Pages)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests that add bespoke query endpoints (`/query`, `/os/:name/schema`, ...) or that reconstruct OSLC in the browser will be asked to rework: every schema and execute path is `POST /api/tenants/{id}/tools/{toolName}`.

## Security

This app stores Maximo API keys (and an optional LLM key) encrypted at rest. Please report vulnerabilities privately - see [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright (c) 2026 Soumya Prasad Rana.
