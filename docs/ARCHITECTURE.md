# Architecture

## Core idea

The backend is **not** a domain REST API (`GET /os/:name/schema`, `POST /query`, ...).
It is a thin, multi-tenant **MCP tool-call proxy**: one HTTP endpoint that accepts
`{tenantId, tool, args}` and forwards it to that tenant's live `maximo-mcp-server`
process, returning the tool's response unchanged. All OSLC/metadata knowledge lives in
`maximo-mcp-server` (and, transitively, in Maximo itself) — never duplicated in this
backend or in the frontend. This is the single biggest structural difference from the
`maximo-oslc-builder` prototype, which had bespoke REST endpoints per feature *and* a
client-side `buildOslcParams()` reimplementing URL construction — both gone here.

## Components

### Backend (Python)

- **Tenant registry** — CRUD for `{id, name, url, apiKey}` + per-tenant toggles
  (`copilotMode`, `devMode` default **on**, `readonly` default **on** — see
  [DECISIONS.md](DECISIONS.md#mqb-002)). API key encrypted at rest (reuse the
  AES-256-GCM pattern from `maximo-playbook-platform/src/playbook/services/crypto.py`
  — already built, already reasoned about).
- **Per-tenant MCP client pool** — one warm `MaximoMCPClient` per configured tenant,
  spawned on first use (or eagerly on tenant creation), kept alive across requests.
  **Reuse, don't rewrite**: adapt
  `maximo-playbook-platform/src/playbook/core/mcp/client.py` (the owner-task stdio
  lifecycle that avoids orphaned node processes on Windows — a real, previously-paid-for
  lesson, see that file's own docstring) and
  `maximo-playbook-platform/src/playbook/core/mcp/manager.py` (the warmup-gate /
  `ensure_ready` polling pattern, and the warm-client-pool-with-idle-reaper pattern
  added in PBD-015). Both are proven, tested, and directly applicable — this project
  should start by **copying and adapting**, not designing from scratch.
- **Tool-call proxy endpoint** — `POST /api/tenants/{id}/tools/{toolName}` (exact
  shape TBD at implementation time) forwards `args` to `client.call_tool(toolName,
  args)` and returns the raw payload. No per-tool bespoke endpoints.
- **Tenant lifecycle endpoints** — create/list/delete tenant, `GET /tenants/{id}/status`
  (readiness: `not_started|loading(stage,pct)|ready|error`, mirroring
  `maximo-playbook-platform`'s `/api/auth/status` contract exactly).
- **Serves the built frontend** — single deployable, backend serves the React SPA at
  `/` once built (reuse the pattern already implemented in
  `maximo-playbook-platform/src/playbook/api/app.py`'s `_mount_frontend`).

### Frontend (React + TypeScript)

- **No OSLC/query-building logic client-side.** Every schema lookup, query build, and
  execute is a `POST /api/tenants/{id}/tools/{toolName}` call. The "URL preview" panel
  renders `os_query_builder`'s own returned `url`/`structured.params` — it does not
  reconstruct them.
- **Startup screen**: configure a tenant (name, URL, API key, copilot/dev/readonly
  toggles) → submit → poll tenant status → block on a warmup screen until `ready` →
  enter the builder.
- **Query builder**: feature-parity component set (see
  [Feature inventory](#feature-inventory-from-maximo-oslc-builder) below), rewired to
  call MCP tools (`maximo_get_metadata`, `os_query_builder`, `ws_load`,
  `ws_get_records`, and the write/`ws_*` tools for the Form Builder) instead of a
  bespoke backend.
- **`childOptions` UI must target the `maximo-mcp-server` 1.7.0+ shape**: an array of
  `{relationship, path?, where, orderBy?, limit?, noLimit?, searchTerms?,
  searchAttributes?, domaininternalwhere?}` — not the prototype's flat
  `{relationship: {where: "raw AND string"}}` record. This is a real UX addition, not
  just a payload reshape: the builder needs a way to let a user express `path` (pick a
  relationship chain, not just one relationship name) for anything nested past one hop
  — the prototype's `ChildWhereBuilder` had no such concept since the server-side
  capability didn't exist yet.

## Tenant lifecycle (the warmup gate)

Directly mirrors `maximo-playbook-platform`'s multi-user pivot (PBD-010/PBD-015),
scoped to one MCP-server-per-tenant here instead of one MCP-server-per-user:

1. `POST /tenants` — validate `{url, apiKey}` (e.g. `whoami`), store tenant
   (key encrypted), kick off the initial metadata sync in the background.
2. Sync = spawn `maximo-mcp-server` with `--data-dir <tenant dir> --dev-mode
   --reconcile-on-startup` (+ `--readonly`/`--copilot-mode` per tenant toggle),
   poll `mcp_server_status` until `object_structures > 0 && !sync.inProgress`.
3. `GET /tenants/{id}/status` — the frontend polls this on the warmup screen; readiness
   shape matches `maximo-playbook-platform`'s `MetadataStatus.to_dict()` exactly
   (`state, stage, percentage, object_structures, elapsed_ms, message`) so the same
   warmup-screen UX (indeterminate progress + live object-structure counter — see
   `engineering/FRONTEND-REDESIGN-BRIEF.md` in that repo for the exact prior guidance
   on this screen, including "don't fake a percentage this sync mode doesn't report")
   can be reused almost verbatim.
4. Once ready, the tenant's MCP client is **kept warm** for the tool-call proxy (not
   respawned per request) — reuse the idle-reaper pattern (PBD-015) so an unused
   tenant's process is closed after a configurable idle window, not held forever.

## Tenant config toggles (explicit user requirements)

- `devMode`: **default on** (exposes `mcp_server_status`/`mcp_read_logs`, required for
  the warmup gate to function at all — do not let a user turn this off before
  first-ready).
- `readonly`: **default on** (`MCP_READONLY`; write tools registered only when a
  tenant explicitly opts out — matches this whole project's "query builder first"
  scope; the Form Builder / write path is a later, explicit opt-in per tenant).
- `copilotMode`: user-configurable per tenant, no stated default yet — **open
  question, see DECISIONS.md** (leaning default-off since it changes the advertised OS
  surface and isn't needed for the core query-builder flow).

## Feature inventory (from `maximo-oslc-builder`, read-only reference)

Component names only were reviewed (`src/components/*.tsx`, 15 files) plus a full read
of `QueryBuilderPage.tsx` (the orchestrator) to confirm data flow — deliberately not a
full line-by-line audit of every component, per an explicit token-budget constraint.
Re-read the specific component when implementing its equivalent, not before.

| Prototype component | Concept to carry over | MCP-native rewire note |
|---|---|---|
| `TenantSelectPage` | Tenant picker/config screen | Becomes the startup + warmup screens (§ above) |
| `OSSearchPanel` | Object Structure search | `maximo_get_metadata` `maximo://os/search/{q}` |
| `FieldSelector`, `FieldPickerDialog` | Parent field multi-select | Backed by `maximo://os/{os}/schema` |
| `RelatedObjectsSelector` | Child object / field picker | `maximo://os/{os}/relatedObjects` + `subschemas` |
| `WhereBuilder` | Parent WHERE conditions | Structured conditions, unchanged shape (`field, op, value`) |
| `ChildWhereBuilder` | Child WHERE (`childOptions`) | **Reshape to the 1.7.0 array+`path` schema** (see above) — the main net-new UX piece |
| `SortingBuilder` | `orderBy` rules | Unchanged concept |
| `SavedQuerySelector` | `savedQuery` + params, dynamic-value placeholders | Keep the `{{PLACEHOLDER}}` pattern — good UX, no server dependency |
| `DynamicValuesPanel` | Consolidated "fill in test values before executing" panel | Keep as-is conceptually |
| `UrlVisualizer` | Live OSLC URL preview | **Render the server's own returned URL/params** (`os_query_builder`'s response), do not reconstruct client-side |
| `ResultsPreview` | Paginated results grid, maximize | `ws_load` + `ws_get_records`, `meta.totalCount`/`hasMore` |
| `FormBuilderDialog` | Design & test a create form | `ws_init_new_record` → `ws_update_field` → `ws_preview_changes` → `ws_commit`; gated behind the tenant's `readonly` toggle |
| `AIChatPanel` | Optional per-tenant AI copilot that can drive the builder (select OS, add fields/where/sort via structured "actions") | Keep the action-dispatch pattern; the "AI" side would itself just be another MCP-tool-calling loop (design later, not blocking core query builder) |

## What's deliberately deferred

- The AI copilot panel and Form Builder are real prototype features worth keeping, but
  are **not** part of the "app ready first" MVP — see `docs/ROADMAP.md` for phasing.
  Both are additive once the core query-builder loop (tenant → schema → build → execute
  → results) works end to end.
- `copilotMode` default (open question above).
- Exact proxy endpoint shape (`POST /api/tenants/{id}/tools/{toolName}` vs. a
  single generic `/api/tools/call` with `tenantId` in the body) — pick when writing the
  backend, not architecturally significant either way.
