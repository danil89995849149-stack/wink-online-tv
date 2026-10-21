$ErrorActionPreference = "Continue"

$repoName = "wink-online-tv"
$user = "danil89995849149-stack"

Write-Host "=== Push to GitHub: $user/$repoName ===" -ForegroundColor Cyan
git -c credential.helper="" push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "=== PUSH SUCCESSFUL! ===" -ForegroundColor Green
    Write-Host "Repository: https://github.com/$user/$repoName" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Push failed" -ForegroundColor Red
}