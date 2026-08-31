# mxQuery — single deployable image.
#
# Two-stage build: stage 1 compiles the frontend (Node, build-time only),
# stage 2 is the actual runtime. The runtime stage needs Node too, not just
# Python — `maximo-mcp-server` is installed globally below at BUILD time and
# spawned directly per tenant (backend/app/mcp/client.py), not via npx. Doing
# the npm install (and its native `better-sqlite3` module build) once here,
# with a full toolchain and network access, avoids repeating it — slowly,
# and without a compiler — on every tenant's first connection at runtime.
#
# Build from the repo root:  docker build -t mxquery .
# Run:                       docker run -p 8000:8000 -v mxquery-data:/data mxquery
# See docker-compose.yml for the env vars you'll actually want to set
# (MQB_ADMIN_PASSWORD, MQB_SESSION_ENCRYPTION_KEY, MQB_LLM_*).

FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim AS runtime

# Node is a RUNTIME dependency here (see header) — not removed after this stage.
# Keep MCP_NPM_SPEC in sync with backend/app/config.py's mcp_npm_spec default
# (docs/DECISIONS.md MQB-005 has the version history).
ARG MCP_NPM_SPEC=@soumyaprasadrana/maximo-mcp-server@1.4.6
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    # build-essential is only for better-sqlite3's node-gyp fallback if no
    # prebuilt binary matches this platform — a one-time build-time cost,
    # purged below once the global install is done.
    && npm install -g "$MCP_NPM_SPEC" \
    && npm cache clean --force \
    && apt-get purge -y --auto-remove curl gnupg build-essential \
    && rm -rf /var/lib/apt/lists/* /root/.npm

WORKDIR /app

# Copied as one layer (not split pyproject.toml-first for cache granularity)
# because setuptools needs the actual `app/` package tree present to resolve
# the install, not just the metadata file — see pyproject.toml's
# [tool.setuptools.packages.find] comment. Simpler and correct beats a
# marginal build-cache win here.
COPY backend/ backend/
RUN pip install --no-cache-dir ./backend

COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# PYTHONIOENCODING: defensive, not a fix for a known bug (see docs/DECISIONS.md's
# non-ASCII audit) — a minimal Linux image can default to an ASCII locale, and
# a third-party dependency (litellm, mcp, httpx) logging non-ASCII text
# (a provider error message, say) would otherwise crash the process on a
# plain `print`/`logging` call.
ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    MQB_TENANT_DB_PATH=/data/tenants.db \
    MQB_TENANT_DATA_ROOT=/data/tenants \
    MQB_SERVE_FRONTEND=true

# All persistent state (tenant registry, encrypted keys, per-tenant synced
# metadata) lives under /data — mount a volume here or it's gone on
# container removal.
VOLUME ["/data"]
EXPOSE 8000

WORKDIR /app/backend
CMD ["uvicorn", "app.app:app", "--host", "0.0.0.0", "--port", "8000"]
