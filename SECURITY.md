# Security policy

## Reporting a vulnerability

This project handles real Maximo tenant credentials (API keys), stored encrypted at
rest server-side. If you find a security issue — credential handling, encryption,
tenant isolation, injection through the MCP tool-call proxy, or anything else — please
report it privately rather than opening a public issue.

Open a GitHub security advisory on this repository ("Security" tab → "Report a
vulnerability"), or contact the maintainer directly. Please include:

- A description of the issue and its impact
- Steps to reproduce, if possible
- Which component is affected (backend proxy, tenant registry, frontend, or the
  upstream `maximo-mcp-server` dependency)

We'll acknowledge reports as promptly as possible and credit reporters in the fix,
unless you'd prefer to stay anonymous.

## Scope notes

- Tenant API keys are encrypted at rest (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)).
  If you find a path where a raw key is logged, returned in an API response, or
  written to disk unencrypted, that's a valid report even before this project has a
  formal release.
- Issues in `maximo-mcp-server` itself (the upstream dependency this project proxies
  to) should be reported to that project, not here.
