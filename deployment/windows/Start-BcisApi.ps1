[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ApiDirectory,
  [Parameter(Mandatory)] [string]$EnvironmentFile
)

$ErrorActionPreference = "Stop"
$apiPath = (Resolve-Path -LiteralPath $ApiDirectory).Path
$envPath = (Resolve-Path -LiteralPath $EnvironmentFile).Path

Get-Content -LiteralPath $envPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}

Set-Location -LiteralPath $apiPath
node dist/server.js
