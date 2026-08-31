# Security policy

## Reporting a vulnerability

This project handles real credentials server-side: Maximo tenant API keys and,
if an admin configures one, an LLM provider API key (OpenAI/Anthropic/etc.) —
both encrypted at rest with the same mechanism. If you find a security issue —
credential handling, encryption, tenant isolation, the admin auth gate,
injection through the MCP tool-call proxy, or anything else — please report it
privately rather than opening a public issue.

Open a GitHub security advisory on this repository ("Security" tab → "Report a
vulnerability"), or contact the maintainer directly. Please include:

- A description of the issue and its impact
- Steps to reproduce, if possible
- Which component is affected (backend proxy, tenant registry, LLM config,
  admin auth, frontend, or the upstream `maximo-mcp-server` dependency)

We'll acknowledge reports as promptly as possible and credit reporters in the fix,
unless you'd prefer to stay anonymous.

## Scope notes

- **Credential storage.** Tenant Maximo API keys and any admin-configured LLM
  provider API key are both encrypted at rest with AES-256-GCM (see
  `backend/app/crypto.py`). If
  you find a path where a raw key is logged, returned in an API response
  (including error messages), or written to disk unencrypted, that's a valid
  report even before this project has a formal release. `MQB_SESSION_ENCRYPTION_KEY`
  is blank by default (falls back to a machine-local derived key) — fine for
  single-user local dev, **must** be set explicitly for any shared/production
  deployment, since the fallback key is derivable from the hostname.
- **Admin authentication.** There is no per-user account system — a single
  shared password (`MQB_ADMIN_PASSWORD`) gates the LLM/theme config-write
  endpoints. Leaving this env var unset disables the admin login endpoint
  entirely (404s, not a wrong-password 401) rather than accepting a blank
  password — a deployment that never sets one has no login surface at all. If
  you find a way to reach an admin-gated endpoint without a valid session
  cookie, that's a valid report.
- **Tenant isolation.** Each tenant's Maximo credentials, MCP process, and
  synced metadata directory are isolated per tenant id. A saved query or
  theme pack is scoped (or global, for theme) but never contains credentials
  — those are not sensitive in the same sense as the API keys above.
- Issues in `maximo-mcp-server` itself (the upstream dependency this project
  proxies to) should be reported to that project, not here.

## Frontend notes

The browser never holds the Maximo API key (create-tenant sends it once; the
proxy keeps it encrypted server-side). `localStorage` holds tenant id, theme
pack, and walkthrough marks (`mqb.*`) only. XSS that can read those values can
switch tenant *in this browser* but should not be able to exfiltrate the key
if the API never echoes it. If you find the key in a frontend bundle, a
network response the UI is allowed to see, or `localStorage`, that is in
scope — report it as above.
