# Maximo MCP OSLC Query Builder

A visual OSLC query builder for IBM Maximo, built directly on top of
[`maximo-mcp-server`](https://github.com/soumyaprasadrana/maximo-mcp-server) — no
bespoke REST backend re-implementing Maximo query logic. The Python backend is a
thin, multi-tenant **MCP tool-call proxy**: it spawns and owns one `maximo-mcp-server`
stdio process per configured tenant and exposes its tools to the React frontend over
HTTP. The frontend never re-implements OSLC URL construction, metadata resolution, or
filtering semantics — it calls MCP tools and renders what comes back.

This is a from-scratch, MCP-native rebuild of the ideas in the (Carbon + bespoke-REST)
`maximo-oslc-builder` prototype — same feature set (field/child-field selection, WHERE
+ child-WHERE builders, saved queries with dynamic params, sorting, a live URL
preview, results grid, an AI copilot panel, a form builder) — rewired to speak MCP
tool calls end to end, and to pick up `maximo-mcp-server`'s 1.7.0 correctness fixes
(nested-relationship `childOptions` filtering) that the prototype predates.

## Status

**Planning stage.** This repo currently holds project/architecture docs and a
scaffold only — see [`docs/pm/STATUS.md`](docs/pm/STATUS.md) for exactly what
exists vs. what's next, and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased
build plan. Implementation starts in a follow-up session.

## The pitch, in one architecture line

```
React frontend  --HTTP-->  Python backend (per-tenant MCP client pool)  --stdio-->  maximo-mcp-server (per tenant)  --HTTPS-->  Maximo
```

A "tenant" = one Maximo instance (`url` + `apiKey`), configured once via the frontend's
startup screen, held server-side, and used to spawn a dedicated `maximo-mcp-server`
process with its own metadata sync directory. The backend polls the server's own
`mcp_server_status` tool until the initial metadata sync completes (the same warmup-gate
pattern already proven in the sibling `maximo-playbook-platform` project) before
reporting the tenant ready.

Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Decisions and their
reasoning: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Repository layout

```
backend/    Python (FastAPI) — tenant registry, per-tenant MCP client pool, tool-call proxy
frontend/   React + TypeScript — query builder UI, MCP-tool-call client (no OSLC logic)
docs/       Architecture, decisions, roadmap, PM tracking (see docs/pm/)
```

## License

Apache-2.0 — see [`LICENSE`](LICENSE). Contributions welcome — see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
