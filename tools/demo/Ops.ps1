# Run-owned process and checkpoint operations. Dot-source after Set-DemoEnv.ps1. Never touches processes it does not own.
. "$PSScriptRoot\Set-DemoEnv.ps1"

function Get-ApiListenerPid { (Get-NetTCPConnection -LocalPort 4112 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess }

function Stop-DemoApi {
  $listener = Get-ApiListenerPid
  $recorded = Get-Content "$script:RunDir\runtime\api.pid" -ErrorAction SilentlyContinue
  foreach ($id in @($listener, $recorded) | Where-Object { $_ } | Select-Object -Unique) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
    # ownership: command line must reference this repo's API entry point or its tsx runner
    if ($p -and ($p.CommandLine -like '*apps\api\src\server.ts*' -or $p.CommandLine -like '*tsx*')) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep 2
  $left = Get-ApiListenerPid
  if ($left) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$left"; if ($p.CommandLine -like '*apps\api\src\server.ts*') { Stop-Process -Id $left -Force } }
}

function Start-DemoApi {
  if (Get-ApiListenerPid) { return }
  $env:BCIS_API_PORT = '4112'; $env:BCIS_ALLOWED_ORIGINS = 'null'; $env:NODE_ENV = 'production'
  $env:BCIS_BACKUP_ROOT = "$script:RunDir\reports\backups"; $env:BCIS_PG_DUMP_PATH = "$script:PgBin\pg_dump.exe"; $env:BCIS_PG_RESTORE_PATH = "$script:PgBin\pg_restore.exe"
  $cli = (Get-ChildItem "$script:Root\source\node_modules\.pnpm" -Directory -Filter 'tsx@*' | Select-Object -First 1).FullName + '\node_modules\tsx\dist\cli.mjs'
  $p = Start-Process node.exe -ArgumentList "`"$cli`"", "`"$script:Root\source\apps\api\src\server.ts`"" -WorkingDirectory "$script:RunDir\runtime" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$script:RunDir\logs\api.log" -RedirectStandardError "$script:RunDir\logs\api.err.log"
  $p.Id | Set-Content "$script:RunDir\runtime\api.pid"
  for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { if ((Invoke-WebRequest http://127.0.0.1:4112/api/v1/health/ready -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { return } } catch {} }
  throw 'API did not become ready'
}

function Restore-DemoCheckpoint([string]$Name) {
  Stop-DemoApi
  $env:PGPASSWORD = $script:Secrets.pgSuper
  $psql = "$script:PgBin\psql.exe"; $args0 = '-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'
  & $psql @args0 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='bcis_demo' and pid<>pg_backend_pid()" | Out-Null
  & $psql @args0 -c 'DROP DATABASE bcis_demo'
  & $psql @args0 -c 'CREATE DATABASE bcis_demo OWNER bcis_demo_app'
  $env:PGPASSWORD = $script:Secrets.pgApp
  & "$script:PgBin\pg_restore.exe" -h 127.0.0.1 -p 55432 -U bcis_demo_app -d bcis_demo --no-owner "$script:RunDir\checkpoints\$Name.dump"
  Remove-Item Env:PGPASSWORD
  Start-DemoApi
}

function New-DemoCheckpoint([string]$Name) {
  $env:PGPASSWORD = $script:Secrets.pgApp
  & "$script:PgBin\pg_dump.exe" -h 127.0.0.1 -p 55432 -U bcis_demo_app -d bcis_demo -Fc -f "$script:RunDir\checkpoints\$Name.dump"
  Remove-Item Env:PGPASSWORD
  (Get-FileHash "$script:RunDir\checkpoints\$Name.dump" -Algorithm SHA256).Hash | Set-Content "$script:RunDir\checkpoints\$Name.sha256"
}
