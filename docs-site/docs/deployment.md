# Deployment

Run the app as one HTTP service on port 8000 (UI + `/api`). Choose Docker or the source scripts.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

The image is a two-stage build: a Node stage compiles the frontend, and the
runtime stage is Python **and** Node together. `maximo-mcp-server` is
installed globally at build time and spawned directly per tenant — not
resolved via `npx` at runtime, which would redo that install (and its
native `better-sqlite3` module build) on every tenant's first connection.

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

## Adding or resyncing a tenant from the CLI

First-time metadata sync on a large Maximo instance (schema loading is one
HTTP request per object structure) can take well past 20-30 minutes. Doing
that through the web UI works — the sync isn't bound to the request, only
progress polling is — but a terminal you can walk away from is often more
convenient than a browser tab. `app.cli` runs the exact same sync loop the
web UI drives, in the foreground, printing progress until it finishes:

```bash
docker run --rm -v mxquery-data:/data soumyaprasadrana/mx-query:latest \
  python -m app.cli add-tenant --name "Prod" --url https://host/maximo --api-key ...
```

Mounting the same `mxquery-data` volume as your running container means it
writes into the exact same tenant registry and per-tenant data directory —
the running server picks up the result the next time it checks that
tenant's status, no restart needed. Also available: `resync <tenant-id>`
(force a full re-sync of an existing tenant) and `list-tenants`.

## No long-lived background process per tenant

Each tenant's `maximo-mcp-server` process is spawned on demand and reaped
after an idle window — there's no daemon sitting around per tenant. If
Maximo's schema changes and you want mxQuery to pick it up immediately
rather than waiting, a resync action is available per tenant from the UI —
it closes the current connection and forces a full metadata re-sync rather
than waiting for the next natural reconnect.
