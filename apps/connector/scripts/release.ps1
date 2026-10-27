# One-command connector release: bump version -> build -> upload to the VPS.
# Usage (PowerShell, from apps/connector):  .\scripts\release.ps1 -VpsHost 1.2.3.4
# Shops' installed connectors poll latest.yml on the backend and update themselves.
param(
  [Parameter(Mandatory = $true)][string]$VpsHost,
  [string]$VpsUser = "root",
  [string]$RemoteDir = "~/footfall/apps/api/downloads/connector",
  [string]$BackendUrl = "https://footfall.api.digitalbookofindia.com"
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

npm version patch --no-git-tag-version | Out-Null
$version = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "Building connector v$version"

$env:DBI_CONNECTOR_BACKEND_URL = $BackendUrl
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist
if ($LASTEXITCODE -ne 0) { throw "build failed" }

$target = "$VpsUser@$VpsHost"
ssh $target "mkdir -p $RemoteDir"
# exe + blockmap first, latest.yml last, so clients never see a feed pointing at a missing file
scp dist/DBI-Footfall-Connector-Setup.exe dist/DBI-Footfall-Connector-Setup.exe.blockmap "${target}:$RemoteDir/"
scp dist/latest.yml "${target}:$RemoteDir/"

Write-Host "Released v$version"
Write-Host "Download: $BackendUrl/downloads/connector/DBI-Footfall-Connector-Setup.exe"
Write-Host "Commit the version bump:  git add package.json package-lock.json; git commit -m 'chore(connector): v$version'; git push"
