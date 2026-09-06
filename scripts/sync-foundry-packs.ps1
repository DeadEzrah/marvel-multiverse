$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $env:LOCALAPPDATA 'FoundryVTT\Data\systems\marvel-multiverse'

$foundryProcesses = Get-Process -Name 'Foundry Virtual Tabletop' -ErrorAction SilentlyContinue
if ($foundryProcesses) {
    $processIds = ($foundryProcesses.Id | Sort-Object) -join ', '
    throw "Foundry Virtual Tabletop is running (process IDs: $processIds). Close Foundry before syncing compendium packs."
}

if (Test-Path $targetDir) {
    Remove-Item $targetDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Get-ChildItem $repoRoot -Force | Where-Object {
    $_.Name -notin @('.git', 'node_modules', '.vscode')
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $targetDir -Recurse -Force
    Write-Host "Synced: $($_.Name)"
}

$packSourceDir = Join-Path $repoRoot 'packs'
if (-not (Test-Path $packSourceDir)) {
    throw "Source compendium folder not found: $packSourceDir"
}

$packTargetDir = Join-Path $targetDir 'packs'
if (Test-Path $packTargetDir) {
    Remove-Item $packTargetDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $packTargetDir | Out-Null

Get-ChildItem $packSourceDir -Directory | Where-Object { $_.Name -ne '_source' } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $packTargetDir -Recurse -Force
    Write-Host "Synced pack: $($_.Name)"
}

Write-Host "`nFoundry system sync complete."
Write-Host "Target: $targetDir"
