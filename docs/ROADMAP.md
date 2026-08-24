# Roadmap

Phased so the app is runnable end-to-end as early as possible, then grows feature
parity with the prototype. Do not start a phase until the previous one's gate passes.

Legend: `[ ]` not started, `[~]` in progress, `[x]` done.

---

## Phase 0 - Scaffolding (this pass)

- [x] Repo initialized, git, open-source scaffolding (LICENSE, CONTRIBUTING,
      CODE_OF_CONDUCT, SECURITY)
- [x] `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, this roadmap, `docs/pm/`
- [x] `backend/`, `frontend/` directory skeleton (no app code yet)

**Gate:** a new session can read `docs/` and start Phase 1 without re-deriving context.

---

## Phase 1 - Backend core: tenants + MCP proxy

- [ ] Adapt `MaximoMCPClient` (owner-task stdio lifecycle) from
      `maximo-playbook-platform/src/playbook/core/mcp/client.py`
- [ ] Tenant model + encrypted-at-rest API key storage (adapt
      `maximo-playbook-platform/src/playbook/services/crypto.py`)
- [ ] Tenant CRUD endpoints + warmup gate (adapt PBD-010/PBD-015's `ensure_ready` +
      warm-client-pool pattern from `core/mcp/manager.py`)
- [ ] `GET /tenants/{id}/status` matching `MetadataStatus.to_dict()` shape
- [ ] Generic tool-call proxy endpoint

**Gate:** can create a tenant via HTTP, poll status to `ready`, and call
`maximo_get_metadata`/`os_query_builder` through the proxy and get a real response —
proven with a script or `curl`, no frontend needed yet.

## Phase 2 - Frontend core: tenant setup + minimal query builder

- [ ] Startup screen: configure tenant → warmup screen (indeterminate progress +
      live object-structure counter, no fake percentage) → builder shell
- [ ] OS search, parent field selection, WHERE builder, execute, results grid
- [ ] Live URL/params preview rendering the server's own `os_query_builder` response
      (not client-reconstructed)
- [ ] Backend serves the built frontend (single deployable, adapt
      `maximo-playbook-platform`'s `_mount_frontend` pattern)

**Gate:** configure a real tenant, build a simple parent-only query, execute it, see
real Maximo results — the "app ready" milestone the project owner asked for first.

## Phase 3 - Feature parity: child fields, `childOptions`, saved queries, sort

- [ ] Related-object / child-field selection (`childSelects` / `rel.` nesting)
- [ ] Child-WHERE builder targeting the 1.7.0+ `childOptions` array+`path` schema
      (MQB-004) — including a relationship-chain picker for `path`, a genuinely new
      capability the prototype didn't have
- [ ] Saved query selector + dynamic-value placeholders
- [ ] Sorting builder
- [ ] Options panel (pageSize, direct OSLC flags)

**Gate:** feature-equivalent to the prototype's core query-builder loop (minus Form
Builder / AI panel), verified against a live tenant with a real nested-relationship
filter case (the kind that motivated the 1.7.0 fix).

## Phase 4 - Form Builder (write path)

- [ ] Design & test a create form (`ws_init_new_record` → `ws_update_field` →
      `ws_preview_changes` → `ws_commit`), gated behind the tenant's `readonly` toggle
      being explicitly off

**Gate:** create a real record against a live tenant with `readonly` off, confirm it
appears in Maximo.

## Phase 5 - AI copilot panel

- [ ] Per-tenant optional AI panel that can drive the builder via structured actions
      (select OS, add fields/where/sort) — design deferred to this phase, not blocking
      earlier ones

## Phase 6 - Polish / open-source readiness

- [ ] Packaging (single deployable build), CI, README polish, screenshots
- [ ] Resolve MQB-003's `copilotMode` default and any other open questions accumulated
      along the way (see `docs/pm/BACKLOG.md`)
