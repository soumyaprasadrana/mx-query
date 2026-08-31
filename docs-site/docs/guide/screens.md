# Screens and Back

mxQuery is a single-page app. The URL is the current screen, so the browser Back button moves between Home, Wizard, Builder, and Library instead of leaving the site.

| Path | Screen |
|---|---|
| `/` | Home, or the tenant picker if this browser has no session |
| `/setup` | New Maximo connection |
| `/wizard` | Guided query |
| `/builder` | Query builder |
| `/builder/report` | Read-only report for a saved query |
| `/library` | Saved queries |

Tenant id is stored as `mqb.tenantId` in `localStorage`. Do not put it in the path; a shared `/wizard` URL without that session opens the picker.

Wizard **steps** are not separate routes. In-wizard Back is the button on the page. Browser Back from `/wizard` returns to the previous screen (usually Home).

The logo mark in the header returns to Home. Next to the wordmark: product version and the pinned `maximo-mcp-server` version from `GET /api/version`. Wizard, Builder, and Library stay in memory after the first visit, so Back restores in-progress work. Live execute in the builder pauses while that screen is hidden.

Theme (Iris by default) and Assist live in the header. Settings (LLM, theme packs) require the admin password when `MQB_ADMIN_PASSWORD` is set.
