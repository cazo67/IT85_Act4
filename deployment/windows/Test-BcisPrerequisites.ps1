[CmdletBinding()]
param(
  [int]$ApiPort = 4100,
  [string]$PostgresBin = "C:\Program Files\PostgreSQL\16\bin"
)

$ErrorActionPreference = "Stop"
$results = @()

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $script:results += [PSCustomObject]@{ Check = $Name; Passed = $Passed; Detail = $Detail }
}

$node = Get-Command node -ErrorAction SilentlyContinue
Add-Check "Node.js" ($null -ne $node) $(if ($node) { (node --version) } else { "Node.js 22-24 is required." })

$pgDump = Join-Path $PostgresBin "pg_dump.exe"
$pgRestore = Join-Path $PostgresBin "pg_restore.exe"
Add-Check "pg_dump" (Test-Path -LiteralPath $pgDump -PathType Leaf) $pgDump
Add-Check "pg_restore" (Test-Path -LiteralPath $pgRestore -PathType Leaf) $pgRestore

$listener = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
Add-Check "API port" ($null -eq $listener) $(if ($listener) { "Port $ApiPort is already listening." } else { "Port $ApiPort is available." })

$results | Format-Table -AutoSize
if ($results.Where({ -not $_.Passed }).Count -gt 0) { exit 1 }
