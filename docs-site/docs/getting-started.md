# Install and first tenant

You need a Maximo instance you can reach over HTTPS and an API key for that instance.

## Docker

```bash
git clone https://github.com/soumyaprasadrana/mx-query.git
cd mxquery
cp .env.example .env
docker compose up --build
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The image includes Python and Node. Each tenant starts `maximo-mcp-server` with `npx` at runtime.

Set `MQB_SESSION_ENCRYPTION_KEY` in `.env` for anything that is not a throwaway local try. See [Configuration](/configuration).

## From source

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
