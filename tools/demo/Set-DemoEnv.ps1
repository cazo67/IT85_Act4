# Loads run-owned, non-repo secrets into THIS process environment only. Never prints values.
$sec = Join-Path $env:LOCALAPPDATA 'bcis-demo-secrets'
$script:RunId = (Get-Content (Join-Path $sec 'current-run.txt')).Trim()
$script:Secrets = Get-Content (Join-Path $sec "$($script:RunId).json") | ConvertFrom-Json
$script:Root = Split-Path (Split-Path $PSScriptRoot)
$script:RunDir = Join-Path $script:Root "demo-output\$($script:RunId)"
$script:PgBin = 'C:\Program Files\PostgreSQL\18\bin'
$emptyEnv = Join-Path $script:RunDir 'runtime\empty.env'
if (-not (Test-Path $emptyEnv)) { New-Item -ItemType File $emptyEnv | Out-Null }
$env:BCIS_ENV_FILE = $emptyEnv
$env:DATABASE_URL = "postgres://bcis_demo_app:$($script:Secrets.pgApp)@127.0.0.1:55432/bcis_demo"
if (-not $script:Secrets.PSObject.Properties['ownerPassword']) {
  $p = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 24 | % { [char]$_ })
  $script:Secrets | Add-Member ownerPassword $p
  $script:Secrets | ConvertTo-Json | Set-Content (Join-Path $sec "$($script:RunId).json")
}
$env:BCIS_BOOTSTRAP_ADMIN_USERNAME = 'demo.owner'
$env:BCIS_BOOTSTRAP_ADMIN_PASSWORD = $script:Secrets.ownerPassword
