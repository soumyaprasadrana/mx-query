# Status

Last updated: 2026-08-24

## Where things stand

**Planning stage.** No application code exists yet. This session produced the
architecture and decisions docs, the roadmap, and repo/OSS scaffolding. Phase 1
(backend core) has not started.

## Done

- Repo initialized (`git init`), directory skeleton (`backend/`, `frontend/`, `docs/`)
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`
- `docs/pm/STATUS.md` (this file), `docs/pm/BACKLOG.md`
- Open-source scaffolding: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `.gitignore`
- `AGENTS.md` operating brief

## Not started

- Everything in `docs/ROADMAP.md` Phase 1 onward — backend tenant registry, MCP
  client pool, proxy endpoint, frontend startup/warmup screens, query builder UI.
- No `pyproject.toml`/`package.json` app dependencies chosen yet beyond the minimal
  skeleton stubs added alongside this doc pass.

## Open questions (see `docs/pm/BACKLOG.md` for the full list)

- `copilotMode` default (MQB-003) — not confirmed by the project owner yet.
- Exact tool-call proxy endpoint shape — deferred to implementation time,
  architecturally insignificant either way.

## Next session should start with

`docs/ROADMAP.md` Phase 1: adapt `MaximoMCPClient` and the warmup-gate/pool
manager from `maximo-playbook-platform`, build the tenant registry + encrypted
API key storage, and the generic tool-call proxy endpoint. Verify with a script
or `curl` against a real tenant before touching the frontend.
