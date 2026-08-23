$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot 'packs'
$targetDir = Join-Path $env:LOCALAPPDATA 'FoundryVTT\Data\systems\marvel-multiverse\packs'

if (-not (Test-Path $sourceDir)) {
    throw "Source compendium folder not found: $sourceDir"
}

if (Test-Path $targetDir) {
    Remove-Item $targetDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Get-ChildItem $sourceDir -Directory | Where-Object { $_.Name -ne '_source' } | ForEach-Object {
    $src = $_.FullName
    $dst = Join-Path $targetDir $_.Name

    Copy-Item -Path $src -Destination $targetDir -Recurse -Force
    Write-Host "Synced: $($_.Name)"
}

Write-Host "`nFoundry pack sync complete."
Write-Host "Target: $targetDir"
