# Install and first tenant

You need a Maximo instance you can reach over HTTPS and an API key for that instance.

## Docker

One command, using the image built by the [release workflow](https://hub.docker.com/r/soumyaprasadrana/mx-query):

```bash
docker run -d --name mxquery -p 8000:8000 \
  -e MQB_SESSION_ENCRYPTION_KEY=change-me \
  -v mxquery-data:/data \
  soumyaprasadrana/mx-query:latest
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The image includes Python and Node — each tenant starts `maximo-mcp-server` with `npx` at runtime. `mxquery-data` persists the tenant registry and synced metadata across restarts (`docker rm` keeps it, `docker volume rm mxquery-data` deletes it).

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
      # the weak local default — see Configuration.
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
```

Set `MQB_SESSION_ENCRYPTION_KEY` to a real value for anything that is not a throwaway local try. See [Configuration](/configuration).

## Build from source with Docker

If you want to build the image yourself instead of pulling `soumyaprasadrana/mx-query`:

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
cp .env.example .env
docker compose up --build
```

## From source, no Docker

Node 20+ and Python 3.11+.

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
./start.ps1     # Windows PowerShell
./start.sh      # macOS / Linux / Git Bash
```

That builds the UI once and starts the backend, which serves `frontend/dist` on port 8000. API docs: `/api/docs`.

Frontend-only, with a backend already on `:8000`:

```bash
cd frontend
npm ci
npm run dev
```

Do not start a second backend against the same tenant data directory.

## First run

1. **Connect a tenant.** Name, Maximo URL (for example `https://your-host/maximo`), API key. Read-only is on by default. Submit.
2. **Wait for warmup.** mxQuery syncs object-structure metadata once. The query UI is blocked until that finishes. Cancel deletes a tenant that never became ready.
3. **Home.** Choose Wizard, Builder, or Saved Queries.

Switch tenant from Home if you have more than one Maximo. Tenant id stays in this browser (`localStorage`). It is not a shareable link.

If warmup never finishes, check the Maximo URL and key, and that the host can reach Maximo. Forced resync is available later from the UI if metadata is stale.

Next: [Screens and Back](/guide/screens).
