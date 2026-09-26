$ErrorActionPreference = "Stop"

function Assert-NativeSuccess([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

corepack pnpm --dir source typecheck
Assert-NativeSuccess "Workspace typecheck"
corepack pnpm --dir source --filter "@bcis/api" test
Assert-NativeSuccess "API tests"
corepack pnpm --dir source --filter "@bcis/desktop" test
Assert-NativeSuccess "Desktop tests"
corepack pnpm --dir source --filter "@bcis/shared" test
Assert-NativeSuccess "Shared-package tests"
corepack pnpm --dir source build
Assert-NativeSuccess "Production builds"

$env:DATABASE_URL = "postgresql://placeholder:placeholder@127.0.0.1:5432/bcis"
corepack pnpm --dir source --filter "@bcis/api" db:check
Assert-NativeSuccess "Drizzle schema consistency check"

Write-Host "Static acceptance passed. Live PostgreSQL, Electron E2E, printing, restore, installer, and three-client gates are separate." -ForegroundColor Green
