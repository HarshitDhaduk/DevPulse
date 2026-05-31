# setup_coral.ps1
# Run once after filling in backend/.env to register all 4 Coral sources.
# Usage: powershell -ExecutionPolicy Bypass -File setup_coral.ps1

$ErrorActionPreference = "Stop"

# Find coral: prefer PATH, then common user bin locations
$coralCmd = Get-Command coral -ErrorAction SilentlyContinue
if ($coralCmd) {
    $coral = $coralCmd.Source
} else {
    $coral = $null
    $candidates = @(
        "C:\Users\$env:USERNAME\bin\coral.exe",
        "C:\Users\$env:USERNAME\bin\coral.EXE",
        "$env:USERPROFILE\bin\coral.exe",
        "$env:USERPROFILE\bin\coral.EXE"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $coral = $c; break }
    }
}
if (-not $coral) {
    Write-Error "coral.exe not found. Add it to PATH or place it in %USERPROFILE%\bin\"
    exit 1
}

# Load .env file
$envFile = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $envFile)) {
    Write-Error "backend\.env not found. Copy backend\.env.example to backend\.env and fill in your keys."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.+)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

Write-Host "`nCoral version:" -ForegroundColor Cyan
& $coral --version

Write-Host "`nAdding GitHub source..." -ForegroundColor Cyan
$env:GITHUB_TOKEN = $env:GITHUB_TOKEN
& $coral source add github
Write-Host "GitHub: OK" -ForegroundColor Green

Write-Host "`nAdding Linear source..." -ForegroundColor Cyan
$env:LINEAR_API_KEY = $env:LINEAR_API_KEY
& $coral source add linear
Write-Host "Linear: OK" -ForegroundColor Green

Write-Host "`nAdding Slack source..." -ForegroundColor Cyan
$env:SLACK_TOKEN = $env:SLACK_TOKEN
& $coral source add slack
Write-Host "Slack: OK" -ForegroundColor Green

Write-Host "`nAdding Sentry source..." -ForegroundColor Cyan
$env:SENTRY_TOKEN = $env:SENTRY_TOKEN
$env:SENTRY_ORG = $env:SENTRY_ORG
& $coral source add sentry
Write-Host "Sentry: OK" -ForegroundColor Green

Write-Host "`nInstalled sources:" -ForegroundColor Cyan
& $coral source list

Write-Host "`nVerifying schema discovery..." -ForegroundColor Cyan
& $coral sql "SELECT schema_name, table_name FROM coral.tables ORDER BY 1, 2"

Write-Host "`nCoral setup complete!" -ForegroundColor Green
