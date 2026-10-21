$ErrorActionPreference = "Continue"

$repoName = "wink-online-tv"
$user = "danil89995849149-stack"

# Чтение токена из .env или переменных окружения (без хранения в репозитории)
$token = $env:GITHUB_TOKEN
if (-not $token -and (Test-Path ".env")) {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*GITHUB_TOKEN\s*=\s*(.+)$") {
            $token = $matches[1].Trim()
        }
    }
}

Write-Host "=== Push to GitHub: $user/$repoName ===" -ForegroundColor Cyan
git push -u origin main