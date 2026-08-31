# Builder

The builder is the full console: object structure, select list, WHERE, child hops, sort, execute, results.

## Object structure

Search in the top bar (Enter). Pick a hit. Schema load fills parent attributes and relationships from `maximo_get_metadata`.

## Fields

Parent columns, Suggested chips (CORE + intent tokens, not the LLM), search, `*`. Child panels repeat the same picker per hop.

## Filters

- **WHERE** on the parent (`where.conditions`). Optional OR mode.
- **Timeline** — relative window on a date attribute (for example `-3M` on `changedate`).
- **Domain internal** — `domaininternalwhere` for coded values such as status.
- **Child options** — relationship, optional `path` for nested hops, child WHERE, child search, `noLimit` where the server supports it. This matches current `maximo-mcp-server` `childOptions` (`path`, `searchTerms`, `domaininternalwhere`, …), not the old flat `{relationship: {where: "string"}}` shape.

## Run

Execute calls `os_query_builder`, then `ws_load` / `ws_get_records`. Results search is Maximo `searchTerms` (Enter or Search re-runs). Load more uses a larger page, not a separate API.

Live execute re-runs as you edit; it pauses if you leave the builder via Back.

## Import

Paste `os_query_builder` JSON (the arguments object, or `os_query_builder({...})`) or an OSLC GET URL. Lean/paging query params that are not part of the tool call are dropped. Nested `rel.NAME{...}` select is hydrated against live schema after import.

## Save and report

Save writes to this tenant's library (folder or Stash). Open a saved query as builder, results, or **report** (`/builder/report`) — report is display-only (no Save / maximize chrome).

Display flatten, table layout, and charts are stored with the query JSON as client display config. They are not extra MCP tools.
