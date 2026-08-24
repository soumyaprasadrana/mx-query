# Architecture decisions

One record per real decision. Format: **MQB-NNN**, status, decision, why. Keep honest —
supersede, don't silently rewrite.

---

## MQB-001 - Backend is an MCP tool-call proxy, not a domain REST API

**Status:** Accepted - 2026-08-24

**Decision:** The Python backend exposes no bespoke per-feature endpoints
(`/os/:name/schema`, `/query`, etc.). It exposes tenant lifecycle endpoints (create,
status, delete) plus one generic tool-call proxy that forwards `{tool, args}` to the
tenant's live MCP client and returns the response unchanged. The frontend calls MCP
tools directly (`maximo_get_metadata`, `os_query_builder`, `ws_load`, `ws_get_records`,
etc.) through that proxy — it never reimplements OSLC URL construction, metadata
resolution, or filter semantics.

**Why:** the source prototype (`maximo-oslc-builder`) duplicated Maximo query-building
logic in a client-side `buildOslcParams()` and a bespoke REST layer — two places that
can drift from what `maximo-mcp-server` actually does (and did drift: see
`maximo-mcp-server`'s own 1.7.0 fix, which the prototype predates and cannot see).
Proxying tool calls means every correctness fix in `maximo-mcp-server` reaches this app
automatically, with zero re-implementation risk.

---

## MQB-002 - Per-tenant MCP client pool, warm and idle-reaped (reuse, don't rewrite)

**Status:** Accepted - 2026-08-24

**Decision:** One `maximo-mcp-server` stdio process per configured tenant, spawned via
an adapted copy of `maximo-playbook-platform/src/playbook/core/mcp/client.py`'s
owner-task lifecycle (the only pattern proven not to orphan node processes on Windows).
Metadata sync is a one-time warmup gate per tenant (`--reconcile-on-startup`, poll
`mcp_server_status`), after which the SAME client stays warm for tool-call proxying —
not respawned per request — reusing the warm-client-pool + idle-reaper design from
`maximo-playbook-platform` PBD-015 (adapted from per-user to per-tenant).

**Why:** this exact lifecycle (spawn → warmup-poll → keep warm → idle-reap → clean
tree-kill) was already designed, built, live-tested, and fixed once (the original
per-run-spawn design was too slow for interactive use — PBD-015) in the sibling
project. Rebuilding it from scratch here would re-risk the same Windows orphaned-process
bug for no benefit — adapt, don't reinvent.

---

## MQB-003 - Tenant toggles: `devMode` and `readonly` default ON; `copilotMode` TBD

**Status:** Accepted (partial) - 2026-08-24

**Decision:** `devMode` defaults on (required for the warmup gate — `mcp_server_status`
needs it) and cannot usefully be turned off before a tenant is first ready. `readonly`
defaults on (query-builder-first scope; write tools, including the Form Builder's
commit path, are an explicit per-tenant opt-out). `copilotMode` is user-configurable
per tenant with **no default decided yet** — flagged as an open question, see
`docs/pm/BACKLOG.md`.

**Why:** stated directly by the project owner for `devMode`/`readonly`; `copilotMode`
changes the advertised Migration Manager object-structure surface and isn't needed for
the core query-builder loop, so defaulting it off is the safer lean starting point,
but wasn't explicitly confirmed — don't assume, ask before implementing the tenant
creation form.

---

## MQB-004 - `childOptions` UI targets the 1.7.0+ nested-path schema, not the prototype's shape

**Status:** Accepted - 2026-08-24

**Decision:** The child-WHERE builder produces `childOptions` as an array of
`{relationship, path?, where:{conditions:[...]}, orderBy?, limit?, noLimit?,
searchTerms?, searchAttributes?, domaininternalwhere?}` entries — the current
`maximo-mcp-server` schema — not the prototype's `{relationship: {where: "raw AND
string"}}` record shape (which predates both the array restructure in 1.3.0 and the
nested-relationship-filtering fix in 1.7.0, and would silently mis-resolve or no-op
against a current server).

**Why:** this app is being built specifically to sit on top of the now-fixed
`maximo-mcp-server`; shipping a UI that can't express the fix's headline capability
(filtering a relationship nested more than one hop deep, via `path`) would defeat much
of the point of rebuilding this tool now rather than patching the prototype.

---

## Template

```
## MQB-NNN - Title
**Status:** Proposed | Accepted | Superseded - YYYY-MM-DD
**Decision:** ...
**Why:** ...
```
