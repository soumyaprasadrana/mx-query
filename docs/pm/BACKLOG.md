# Backlog

Not phased/prioritized — see `docs/ROADMAP.md` for the phased build plan. This is
where open questions and deferred ideas land so they aren't lost or silently assumed.

## Open questions (need project-owner input before implementing)

- **`copilotMode` default** (MQB-003) — no default stated yet. Leaning off by
  default (changes the advertised object-structure surface, not needed for the
  core query-builder loop) but not confirmed. Ask before building the tenant
  creation form.
- **License confirmation** — `LICENSE`/README currently assume Apache-2.0 by
  analogy with `maximo-playbook-platform`. Not explicitly confirmed for this repo.
- **Tool-call proxy endpoint shape** — `POST /api/tenants/{id}/tools/{toolName}`
  vs. a single `POST /api/tools/call` with `tenantId` in the body. Pick at
  implementation time; not architecturally significant.
- **Idle-reap window** for the per-tenant MCP client pool — PBD-015's value in
  `maximo-playbook-platform` is a reasonable starting default; confirm it still
  makes sense per-tenant (likely fewer, longer-lived tenants than per-user).

## Deferred features (real, wanted, not MVP)

- AI copilot panel (`AIChatPanel` equivalent) — Phase 5.
- Form Builder / write path (`FormBuilderDialog` equivalent) — Phase 4, gated
  behind a tenant's `readonly` toggle being explicitly off.
- Full `rel.` select-string parsing so the safety default-limit applies even to a
  bare `rel.x{rel.y{...}}` traversal with zero corresponding `childOptions` entry
  — noted as a real gap in `maximo-mcp-server` 1.7.0 itself, not blocking this
  project, but relevant if the query builder UI ever lets a user select nested
  relationships without also opening the child-WHERE builder for them.

## Ideas / nice-to-haves (unscoped)

- Multi-tenant dashboard (list of configured tenants with live status) beyond the
  minimal create/select flow.
- Export a built query as a reusable "saved query" back through
  `maximo-mcp-server`'s own saved-query mechanism, not just locally in the frontend.
