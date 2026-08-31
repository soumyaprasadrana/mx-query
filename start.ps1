<#
.SYNOPSIS
    Boots the maximo-mcp-oslc-query-builder app (single deployable).

    Creates/updates the backend venv, builds the frontend, then starts the
    FastAPI backend, which serves the built frontend itself at `/` (API at
    `/api/*`, interactive docs at `/api/docs`).

.PARAMETER Port
    Port to listen on. Default 8000.

.PARAMETER Reload
    Pass to auto-restart uvicorn on source changes (backend dev convenience;
    does not rebuild the frontend on frontend source changes — use
    `npm run dev` in frontend/ for that instead).

.PARAMETER SkipFrontendBuild
    Skip the npm install/build step (e.g. you're running `npm run dev`
    separately against this backend via the Vite proxy).

.EXAMPLE
    ./start.ps1
    ./start.ps1 -Port 8123 -Reload
    ./start.ps1 -SkipFrontendBuild
#>
param(
    [int]$Port = 8000,
    [switch]$Reload,
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venv = Join-Path $backend ".venv"
$venvPython = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "No venv found - creating one at $venv ..."
    python -m venv $venv
    if ($?) { & $venvPython -m pip install -q --upgrade pip }
}

Write-Host "Installing/updating backend dependencies ..."
& $venvPython -m pip install -q -e "$backend[dev]"
if (-not $?) { throw "pip install failed" }

# Single-deployable mode: the backend serves frontend/dist itself
# (app.py's _mount_frontend). Build it unless the caller opts out (e.g. a
# `npm run dev` + Vite proxy workflow instead).
if (-not $SkipFrontendBuild) {
    if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
        Write-Host "Installing frontend dependencies ..."
        Push-Location $frontend
        try { npm install } finally { Pop-Location }
    }
    Write-Host "Building frontend ..."
    Push-Location $frontend
    try { npm run build } finally { Pop-Location }
    if (-not $?) { throw "frontend build failed" }
}

# config.py's tenant_data_root/tenant_db_path are relative paths (./data/...),
# so uvicorn must run with the backend dir as cwd.
Push-Location $backend
try {
    $uvicornArgs = @("-m", "uvicorn", "app.app:app", "--host", "127.0.0.1", "--port", "$Port")
    if ($Reload) { $uvicornArgs += "--reload" }

    Write-Host ""
    Write-Host "Starting backend on http://127.0.0.1:$Port  (docs at /api/docs)"
    Write-Host "Ctrl+C to stop."
    Write-Host ""
    & $venvPython @uvicornArgs
} finally {
    Pop-Location
}
