#!/usr/bin/env bash
# Boots the maximo-mcp-oslc-query-builder app (single deployable).
#
# Creates/updates the backend venv, builds the frontend, then starts the
# FastAPI backend, which serves the built frontend itself at `/` (API at
# `/api/*`, interactive docs at `/api/docs`).
#
# Usage:
#   ./start.sh                    # port 8000
#   PORT=8123 ./start.sh
#   RELOAD=1 ./start.sh           # auto-restart backend on source changes
#   SKIP_FRONTEND_BUILD=1 ./start.sh   # e.g. running `npm run dev` separately

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
PORT="${PORT:-8000}"

# Windows venvs put the interpreter in Scripts/, POSIX ones in bin/.
if [ -f "$VENV/Scripts/python.exe" ]; then
    PY="$VENV/Scripts/python.exe"
elif [ -f "$VENV/bin/python" ]; then
    PY="$VENV/bin/python"
else
    echo "No venv found - creating one at $VENV ..."
    python -m venv "$VENV"
    if [ -f "$VENV/Scripts/python.exe" ]; then PY="$VENV/Scripts/python.exe"; else PY="$VENV/bin/python"; fi
    "$PY" -m pip install -q --upgrade pip
fi

echo "Installing/updating backend dependencies ..."
"$PY" -m pip install -q -e "$BACKEND[dev]"

# Release zip ships frontend/dist prebuilt with no frontend/src - skip the
# Node build step entirely in that case (no Node needed at all to run it).
if [ -d "$FRONTEND/dist" ] && [ ! -d "$FRONTEND/src" ]; then
    echo "Prebuilt frontend/dist found - skipping the Node build step."
elif [ "${SKIP_FRONTEND_BUILD:-}" != "1" ]; then
    if [ ! -d "$FRONTEND/node_modules" ]; then
        echo "Installing frontend dependencies ..."
        (cd "$FRONTEND" && npm install)
    fi
    echo "Building frontend ..."
    (cd "$FRONTEND" && npm run build)
fi

# config.py's tenant_data_root/tenant_db_path are relative paths (./data/...),
# so uvicorn must run with the backend dir as cwd.
cd "$BACKEND"

UVICORN_ARGS=(-m uvicorn app.app:app --host 127.0.0.1 --port "$PORT")
if [ "${RELOAD:-}" = "1" ]; then
    UVICORN_ARGS+=(--reload)
fi

echo
echo "Starting backend on http://127.0.0.1:$PORT  (docs at /api/docs)"
echo "Ctrl+C to stop."
echo
exec "$PY" "${UVICORN_ARGS[@]}"
