# Architecture

```
React (mxQuery)  --HTTP-->  Python proxy (per-tenant MCP pool)  --stdio-->  maximo-mcp-server  --HTTPS-->  Maximo
```

mxQuery's backend is a thin, multi-tenant **MCP tool-call proxy** - not a
domain REST API. It exposes tenant lifecycle endpoints (create, status,
delete) plus a generic tool-call proxy that forwards `{tool, args}` to a
tenant's live MCP client and returns the response unchanged.

The frontend calls MCP tools directly (`maximo_get_metadata`,
`os_query_builder`, `ws_load`, and others) through that proxy. It never
reimplements OSLC URL construction, metadata resolution, or filter
semantics - every correctness fix that lands in `maximo-mcp-server` reaches
mxQuery automatically, with no re-implementation risk.

## Frontend

Routes (History API). Tenant id is `localStorage`, not a URL parameter.

| Path | Screen |
|---|---|
| `/` | Home or tenant picker |
| `/setup` | New tenant |
| `/wizard` | Guided query |
| `/builder` | Builder |
| `/builder/report` | Saved-query report |
| `/library` | Saved queries |

Unknown paths fall through to `index.html` (backend `_mount_frontend`; Vite in dev). Wizard steps are not routed.

`GET /api/version` returns product name, mxQuery semver, and the pinned MCP npm spec. The UI header reads this on boot. Do not treat a number in this example as the current release - source of truth is the running proxy:

```json
{
  "name": "mxQuery",
  "version": "1.4.1",
  "mcpServer": {
    "package": "@soumyaprasadrana/maximo-mcp-server",
    "version": "1.4.6"
  }
}
```

No git SHA, environment, or runtime versions.

## Tenants

A tenant is one Maximo instance: a URL and an API key, configured once
through the UI. Each tenant gets its own `maximo-mcp-server` process
(spawned on demand, not a permanent background service) and its own synced
metadata directory. The backend polls the server's own `mcp_server_status`
tool until the initial sync completes before marking a tenant ready.

Idle tenant connections are reaped after a configurable window - there is
no long-lived per-tenant daemon. See [Configuration](/configuration) for
the relevant environment variables, and [Deployment](/deployment) for how
this affects on-demand actions like a forced metadata resync.

## Credentials

Tenant API keys, and any admin-configured LLM provider key, are encrypted
at rest with AES-256-GCM. Nothing sensitive is ever returned in an API
response once saved.

## AI Assist

The wizard's optional Assist feature routes through
[litellm](https://github.com/BerriAI/litellm), so any supported provider -
OpenAI, Anthropic, Azure OpenAI, local Ollama, or any OpenAI-compatible
endpoint - works without code changes. Assist only ever picks from a
candidate list already present in the current step; it never invents an
OSLC clause, a field name, or a relationship that doesn't exist on the
tenant.
