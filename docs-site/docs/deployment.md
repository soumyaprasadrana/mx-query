# Deployment

Run the app as one HTTP service on port 8000 (UI + `/api`). Choose Docker or the source scripts.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

The image is a two-stage build: a Node stage compiles the frontend, and the
runtime stage is Python **and** Node together — `maximo-mcp-server` is
spawned per tenant via `npx` at runtime, not just used to build the UI, so
the running container needs both.

All persistent state (the tenant registry, encrypted keys, and each
tenant's synced metadata) lives in the `mxquery-data` volume.
`docker compose down -v` deletes it; a plain `docker compose down` keeps it.

### Reaching a host-run Ollama from the container

`127.0.0.1` from inside a container is the container itself, not your host
machine. If you're pointing `MQB_LLM_API_BASE` at Ollama running on your
host, use `host.docker.internal` — `docker-compose.yml` already sets up the
`extra_hosts` entry Linux needs for that hostname to resolve (Docker
Desktop on Mac/Windows provides it natively).

## From source

```bash
./start.ps1     # Windows PowerShell
./start.sh      # macOS / Linux / Git Bash
```

Builds the frontend once, then starts the backend, which serves the built
UI — one process, one port.

## No long-lived background process per tenant

Each tenant's `maximo-mcp-server` process is spawned on demand and reaped
after an idle window — there's no daemon sitting around per tenant. If
Maximo's schema changes and you want mxQuery to pick it up immediately
rather than waiting, a resync action is available per tenant from the UI —
it closes the current connection and forces a full metadata re-sync rather
than waiting for the next natural reconnect.
