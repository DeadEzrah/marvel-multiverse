param(
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$system = Get-Content 'system.json' -Raw | ConvertFrom-Json
$version = $system.version
$tag = "release-$version"
$zipName = "marvel-multiverse-$version.zip"
$zipPath = Join-Path $repoRoot $zipName
$staging = Join-Path $env:TEMP "marvel-multiverse-release-$version"

npm run validate:release
npm run validate:effects
npm run build

if (Test-Path $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging | Out-Null

$directories = @('assets', 'css', 'fonts', 'icons', 'lang', 'lib', 'packs', 'templates', 'ui')
foreach ($directory in $directories) {
    Copy-Item -Path (Join-Path $repoRoot $directory) -Destination $staging -Recurse -Force
}

$sourcePackData = Join-Path $staging 'packs\_source'
if (Test-Path $sourcePackData) {
    Remove-Item -LiteralPath $sourcePackData -Recurse -Force
}

$files = @(
    'marvel-multiverse-compiled.mjs.map',
    'CHANGELOG.md',
    'LICENSE.txt',
    'README.md',
    'system.json',
    'template.json'
)
foreach ($file in $files) {
    Copy-Item -Path (Join-Path $repoRoot $file) -Destination $staging -Force
}
Copy-Item -Path (Join-Path $repoRoot 'marvel-multiverse-compiled.mjs') `
    -Destination (Join-Path $staging 'marvel-multiverse.mjs') -Force

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -CompressionLevel Optimal

if ($Publish) {
    gh release create $tag $zipPath 'system.json' `
        --repo 'DeadEzrah/marvel-multiverse' `
        --title "Marvel Multiverse $version" `
        --notes-file 'CHANGELOG.md'
}

Write-Output "Release package ready: $zipPath"
