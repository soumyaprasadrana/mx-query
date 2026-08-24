# Contributing

Thanks for taking a look at this project. It's early — planning-stage as of this
writing — so the most useful contributions right now are design feedback on
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md),
not code.

## Before opening a PR

1. Read [`AGENTS.md`](AGENTS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —
   this project has a specific architectural stance (backend as MCP tool-call proxy,
   not a domain REST API) and PRs that add bespoke endpoints will be asked to rework.
2. Check [`docs/ROADMAP.md`](docs/ROADMAP.md) for the current phase — work that jumps
   ahead of the current phase's gate is harder to review in isolation.
3. If your change touches an open question in [`docs/pm/BACKLOG.md`](docs/pm/BACKLOG.md),
   open an issue to discuss first rather than deciding it inside a PR.

## Development

Backend: Python (FastAPI). Frontend: React + TypeScript. Both live under `backend/`
and `frontend/`; the backend serves the built frontend in production. Setup
instructions will be added once Phase 1 lands real dependencies.

## Commit style

Small, focused commits. Reference the roadmap phase or ADR (`MQB-NNN`) a change
belongs to when relevant.

## Code of conduct

This project follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
