# Install and first tenant

You need a Maximo instance you can reach over HTTPS and an API key for that instance.

## Docker

One command, using the image built by the [release workflow](https://hub.docker.com/r/soumyaprasadrana/mx-query). Set up the tenant first, then start the app - the tenant sync then runs to completion in its own short-lived container instead of racing a browser tab and a request timeout, which matters most on a large Maximo instance:

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

**Use the same `MQB_SESSION_ENCRYPTION_KEY` in both commands, and set it explicitly.** Leaving it unset falls back to a key derived from the container's own hostname - and every `docker run` is a separate container with a different random hostname. The first command would then encrypt that tenant's Maximo API key with one key; the long-running server container would try to decrypt it with a different one and fail, permanently, for that tenant. This is not a "recommended for production" nicety here - a single unset key breaks the exact two-command flow above on the very first try. Generate one real value (`openssl rand -hex 32` works) and reuse it for every `docker run` against this same `mxquery-data` volume.

Skip the first command to use the in-browser setup wizard instead - both work, and `add-tenant`/`resync`/`list-tenants` are available from the CLI any time afterward against the same volume and key (see [Deployment](/deployment)).

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The image includes Python and Node - `maximo-mcp-server` is installed globally at build time and started directly per tenant. `mxquery-data` persists the tenant registry and synced metadata across restarts (`docker rm` keeps it, `docker volume rm mxquery-data` deletes it).

Or `docker-compose.yml`, without cloning the repo:

```yaml
services:
  mxquery:
    image: soumyaprasadrana/mx-query:latest
    ports:
      - "8000:8000"
    environment:
      MQB_SESSION_ENCRYPTION_KEY: change-me
      # Only needed if Assist should point at a real provider instead of
      # the weak local default - see Configuration.
      # MQB_LLM_MODEL: openai/gpt-4o-mini
      # MQB_LLM_API_KEY: sk-...
    volumes:
      - mxquery-data:/data
    restart: unless-stopped

volumes:
  mxquery-data:
```

```bash
docker compose up -d
# Add a tenant against the same compose-managed volume any time:
docker compose run --rm mxquery python -m app.cli add-tenant --name "Prod" --url https://your-host/maximo --api-key your-api-key
```

`MQB_SESSION_ENCRYPTION_KEY` above must still be a real, fixed value in the compose file (or `.env`) for the same reason as the plain `docker run` case - `docker compose run` also starts a fresh, separate container for that one command.

## Build from source with Docker

If you want to build the image yourself instead of pulling `soumyaprasadrana/mx-query`:

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
cp .env.example .env
docker compose up --build
```

## From source, no Docker

Two ways to get the app: `git clone` (Node 20+ and Python 3.11+, builds the frontend), or download `mxQuery-<version>.zip` from [Releases](https://github.com/soumyaprasadrana/mx-query/releases) - backend source plus an already-built frontend, Python 3.11+ only, no Node needed.

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
./start.ps1     # Windows PowerShell
./start.sh      # macOS / Linux / Git Bash
```

That builds the UI once and starts the backend, which serves `frontend/dist` on port 8000. API docs: `/api/docs`. Running the release zip instead, the scripts detect the prebuilt `frontend/dist` (no `frontend/src` alongside it) and skip the build step entirely.

Unlike Docker, a local install's machine-derived encryption key (used when `MQB_SESSION_ENCRYPTION_KEY` is unset) is your one machine's hostname every time, not a fresh random container id - it stays stable across runs, so this is fine for a single-machine solo try. Set `MQB_SESSION_ENCRYPTION_KEY` explicitly in `backend/.env` anyway for anything you would mind losing - see [Configuration](/configuration).

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

1. **Connect a tenant.** Name, Maximo URL (for example `https://your-host/maximo`), API key. Read-only is on by default. Submit. Already added it from the CLI above? Skip to step 3.
2. **Wait for warmup.** mxQuery syncs object-structure metadata once. The query UI is blocked until that finishes. Cancel deletes a tenant that never became ready.
3. **Home.** Choose Wizard, Builder, or Saved Queries.

Switch tenant from Home if you have more than one Maximo. Tenant id stays in this browser (`localStorage`). It is not a shareable link.

If warmup never finishes, check the Maximo URL and key, and that the host can reach Maximo. Forced resync is available later from the UI if metadata is stale, or from the CLI (`resync <tenant-id>`) without going through the browser at all.

Next: [Screens and Back](/guide/screens).
