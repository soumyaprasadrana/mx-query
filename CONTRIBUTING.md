# Contributing

mxQuery's backend is an MCP tool-call proxy, not a domain REST API. The frontend must not reconstruct OSLC URLs or filter semantics — call `POST /api/tenants/{id}/tools/{toolName}` and render the payload.

PRs that add `/query`, `/os/:name/schema`, or any other bespoke Maximo endpoint will be asked to rework.

User guide: [docs site](https://soumyaprasadrana.github.io/mx-query/). Local preview: `cd docs-site && npm ci && npm run docs:dev`.

## Frontend

Node 20+. From `frontend/`:

```bash
npm ci
npm test         # Vitest — no Maximo, no tenant db
npm run dev      # Vite on :5173, proxies /api to :8000
npm run build    # tsc -b && vite build → dist/ (gitignored)
```

A backend must already be listening on `http://127.0.0.1:8000` for `npm run dev`. Production is the backend serving `frontend/dist` (`./start.ps1` / `./start.sh`).

UI expectations:

- `npm test` and `npm run build` stay green. Tests live next to the modules they cover (`src/**/*.test.ts`) and must not call a real Maximo or boot `tenants.db`.
- Do not add client-side OSLC / query-string builders. `frontend/src/api.ts` `callTool()` is the only execute path.
- Do not add FastAPI routes from a frontend change. If the UI seems to need one, it is probably another MCP tool call.
- Do not commit `frontend/dist/`, `node_modules/`, or tenant data.
- Keep tenant id in `localStorage` (`mqb.tenantId`); do not put API keys in the browser. Routes live in `frontend/src/lib/nav.ts`.
- Brand assets are `frontend/public/logo.svg` (icon), `logo-light.svg`, `logo-dark.svg`. Do not replace the `mxQ` mark without discussing it first.

## Backend

Python 3.11+. From `backend/`:

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows; source .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
uvicorn app.app:app --reload --port 8000
```

Lint and test before opening a PR (CI runs the same commands):

```bash
ruff check app tests
pytest -q
```

**Never run pytest, a debug script, or a manual `TestClient` session against a real `backend/data/tenants.db`.** It holds configured tenants' encrypted Maximo API keys and any admin-set LLM/theme config. Point `MQB_TENANT_DB_PATH` at a scratch file:

```bash
MQB_TENANT_DB_PATH=/tmp/mqb-test.db pytest -q                    # bash
$env:MQB_TENANT_DB_PATH="$env:TEMP\mqb-test.db"; pytest -q       # PowerShell
```

`backend/tests/conftest.py` already does this for the test suite. The env var above is only for a script outside pytest.

Keep UI changes in `frontend/`. Keep proxy / MCP / sqlite changes in `backend/`.

## Docs site

```bash
cd docs-site
npm ci
npm run docs:dev
npm run docs:build
```

## Commit style

Small, focused commits. Describe why, not only what.

## Code of conduct

This project follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
