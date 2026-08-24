# AGENTS.md -- rules for anyone (human or AI) changing this repo

Read this before your first edit. Short on purpose. Add a rule here only after it
prevents a real, repeated mistake -- don't pre-write hypothetical rules.

---

## 1. This backend is a proxy, not a domain API -- don't add bespoke endpoints

Per [`docs/DECISIONS.md`](docs/DECISIONS.md#mqb-001): no `/query`, `/os/:name/schema`,
etc. If a feature seems to need a new endpoint, first check whether it's actually a
new MCP tool call through the existing generic proxy. Bespoke endpoints reintroduce
the exact drift risk (client duplicating server logic) this project exists to avoid.

## 2. Reuse `maximo-playbook-platform`'s MCP client/pool code -- adapt, don't rewrite

Per [`docs/DECISIONS.md`](docs/DECISIONS.md#mqb-002). The owner-task stdio lifecycle
in that repo's `src/playbook/core/mcp/client.py` exists specifically because a naive
spawn leaks orphaned `--bg-sync-worker` node processes on Windows (this happened, was
debugged, cost real time -- see that repo's history). Don't re-derive process
lifecycle handling from scratch here.

## 3. `childOptions` targets the current `maximo-mcp-server` schema, not the old prototype's

Per [`docs/DECISIONS.md`](docs/DECISIONS.md#mqb-004). Before building the child-WHERE
UI, check the installed `maximo-mcp-server` version's actual `ChildOptionSchema` (it
gained `path`, `noLimit`, `searchTerms`, `searchAttributes`, `domaininternalwhere` in
1.7.0/1.4.2) -- don't copy the prototype's flat `{relationship: {where: "string"}}`
shape, it will silently no-op against a current server.

## 4. Don't assume `copilotMode`'s default

Open question, see [`docs/pm/BACKLOG.md`](docs/pm/BACKLOG.md). Ask before hardcoding
a default in the tenant creation form.

## 5. Keep `docs/pm/STATUS.md` current

Update it when a roadmap phase's gate passes or scope changes -- it's the fastest way
for a new session (human or AI) to know what's actually done vs. planned without
re-reading every doc.

---

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what to build next.
