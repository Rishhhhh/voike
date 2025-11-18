# Windows bootstrap for VOIKE
# Run from PowerShell as Administrator:  powershell -ExecutionPolicy Bypass -File scripts\install_voike_windows.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host 'winget is required on Windows 11 / latest builds. Install winget first.' -ForegroundColor Yellow
        exit 1
    }

    Write-Host 'Installing Node.js 20, Git, and VS Build Tools via winget (if missing)...'
    winget install -e --id OpenJS.NodeJS.LTS -h  --accept-package-agreements --accept-source-agreements | Out-Null
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements | Out-Null

    Write-Host 'Ensuring Docker Desktop is installed...'
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements | Out-Null

    Write-Host 'Starting Docker Desktop (this may take a moment)...'
    Start-Process -FilePath "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe" -WindowStyle Hidden
    Start-Sleep -Seconds 15

    Write-Host 'Installing pnpm globally...'
    npm install -g pnpm@9

    if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
        Copy-Item .env.example .env
    }

    Write-Host 'Installing backend dependencies...'
    npm install

    Write-Host 'Preparing CLI...'
    Push-Location cli
    npm install
    npm run build
    npm link
    Pop-Location

    Write-Host 'Building backend...'
    npm run build

    Write-Host 'Starting Docker compose (backend + Postgres)...'
    docker compose pull
    docker compose up -d --build

    Write-Host 'VOIKE is running. Use "voike --help" or "npm run dev" to start developing.' -ForegroundColor Green
} finally {
    Pop-Location
}
