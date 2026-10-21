# start_dev.ps1 — One-command local dev startup
# Usage: .\scripts\start_dev.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"

Write-Host ">>> Activating venv..." -ForegroundColor Cyan
& "$backend\venv\Scripts\Activate.ps1"

Write-Host ">>> Preparing database..." -ForegroundColor Cyan
Set-Location $backend
python bootstrap_database.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Database bootstrap failed!" -ForegroundColor Red
    exit 1
}

Write-Host ">>> Database OK. Starting server..." -ForegroundColor Green
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
