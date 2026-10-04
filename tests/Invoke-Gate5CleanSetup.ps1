param()

$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}

$targetText = $env:BCIS_RESTORE_DATABASE_URL
if (-not $targetText -or $env:BCIS_RESTORE_CONFIRMATION -ne 'RESTORE bcis_restore_test') {
  throw 'Set BCIS_RESTORE_DATABASE_URL and BCIS_RESTORE_CONFIRMATION=RESTORE bcis_restore_test before the clean-setup rehearsal.'
}
$target = [Uri]$targetText
if ($target.Scheme -notin @('postgresql', 'postgres') -or $target.Host -ne '127.0.0.1' -or $target.Port -ne 5433 -or $target.AbsolutePath -ne '/bcis_restore_test') {
  throw 'Only the dedicated PostgreSQL 18 database 127.0.0.1:5433/bcis_restore_test is allowed.'
}
$credentials = $target.UserInfo.Split(':', 2)
if ($credentials.Count -ne 2 -or [Uri]::UnescapeDataString($credentials[0]) -ne 'bcis_app') {
  throw 'The restore test must use the bcis_app role.'
}
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) { throw 'PostgreSQL 18 psql.exe was not found.' }
$sourceDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\source')).Path

try {
  $env:PGHOST = '127.0.0.1'
  $env:PGPORT = '5433'
  $env:PGUSER = 'bcis_app'
  $env:PGPASSWORD = [Uri]::UnescapeDataString($credentials[1])
  $env:DATABASE_URL = $targetText
  $identity = & $psql --dbname=bcis_restore_test --no-password --no-psqlrc --tuples-only --no-align --command="select current_database(), current_user, (select pg_get_userbyid(datdba) from pg_database where datname=current_database()), (select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema'));"
  Assert-NativeSuccess 'Restore-target identity preflight'
  if ($identity.Trim() -ne 'bcis_restore_test|bcis_app|bcis_app|0') {
    throw 'The restore target must be an empty bcis_restore_test database owned by bcis_app.'
  }

  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $env:BCIS_BOOTSTRAP_ADMIN_PASSWORD = [Convert]::ToBase64String($bytes)
  $env:BCIS_BOOTSTRAP_ADMIN_USERNAME = 'owner'

  corepack pnpm --dir $sourceDirectory db:migrate
  Assert-NativeSuccess 'Clean target migrations'
  corepack pnpm --dir $sourceDirectory db:seed-security
  Assert-NativeSuccess 'Clean target security seed'
  corepack pnpm --dir $sourceDirectory db:seed-master-data
  Assert-NativeSuccess 'Clean target synthetic master-data seed'
  corepack pnpm --dir $sourceDirectory db:migrate
  Assert-NativeSuccess 'Repeat migration no-op'

  $counts = & $psql --dbname=bcis_restore_test --no-password --no-psqlrc --tuples-only --no-align --command="select (select count(*) from drizzle.__drizzle_migrations), (select count(*) from roles), (select count(*) from service_plans), (select count(*) from subscribers), (select count(*) from service_accounts), (select count(*) from users where normalized_username='owner' and must_change_password);"
  Assert-NativeSuccess 'Clean target assertions'
  $parts = $counts.Trim().Split('|')
  if ($parts.Count -ne 6 -or [int]$parts[0] -ne 19 -or [int]$parts[1] -lt 7 -or [int]$parts[2] -lt 7 -or [int]$parts[3] -lt 50 -or [int]$parts[4] -lt 60 -or [int]$parts[5] -ne 1) {
    throw 'Clean target migration, seed or forced-change Owner assertions failed.'
  }
  Write-Host 'Gate 5 clean test setup passed: 19 migrations; roles, plans, 50 subscribers, 60 services, forced-change Owner. The temporary bootstrap password was not recorded.'
} finally {
  Remove-Item Env:BCIS_BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BCIS_BOOTSTRAP_ADMIN_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGHOST -ErrorAction SilentlyContinue
  Remove-Item Env:PGPORT -ErrorAction SilentlyContinue
  Remove-Item Env:PGUSER -ErrorAction SilentlyContinue
}
