# Changelog

## 1.2.1

- Fix `backend.yml`: `runner` context is only valid in a step's `env:`, not a job's — CI was rejecting the workflow file outright
- Fix `release.yml`: unquoted colon in a step name broke YAML parsing
- Fix `ModuleNotFoundError: No module named 'tests'` in CI (`backend/tests` needed `__init__.py`)
- GitHub Releases now attach the built frontend as a zip, not just GitHub's auto-generated source archive
- Docs: added a `docker run` / no-clone `docker-compose.yml` path alongside the existing build-from-source instructions

## 1.2.0

First public release.

- Wizard, builder, and saved-query library against a live Maximo tenant
- Multi-tenant MCP proxy (`POST /api/tenants/{id}/tools/{toolName}`)
- `GET /api/version` — product semver plus the pinned `maximo-mcp-server` spec
- Optional Assist (admin-configured LLM via litellm)
- Docker image and GitHub Pages user guide
