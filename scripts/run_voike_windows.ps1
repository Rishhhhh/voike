# Simple Windows runner for VOIKE using Docker Compose.
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\run_voike_windows.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host 'Docker Desktop (or Docker CLI) is required on Windows. Please install Docker Desktop first.' -ForegroundColor Red
        exit 1
    }

    # Ensure .env exists so the compose stack has configuration.
    if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
        Write-Host 'No .env found; copying from .env.example …'
        Copy-Item .env.example .env
    }

    Write-Host 'Bringing up VOIKE (Postgres + backend + DNS POPs) via Docker Compose…'
    docker compose up -d --build

    Write-Host ''
    Write-Host 'VOIKE is running on Windows.' -ForegroundColor Green
    Write-Host '  - Backend:      http://localhost:8080'
    Write-Host '  - Healthcheck:  curl http://localhost:8080/health'
    Write-Host '  - Docs:         open http://localhost:8080/'
    Write-Host ''
    Write-Host 'To stop VOIKE, run: docker compose down' -ForegroundColor Yellow
} finally {
    Pop-Location
}

