# Test and Acceptance Guide

Run the required static gate from the repository root:

```powershell
& .\tests\Run-StaticAcceptance.ps1
```

It runs source-integrity checks, serialized typechecks, automated tests, production builds and Drizzle consistency. It writes build outputs; use focused non-emitting/no-cache checks for a read-only audit.

For current Gate 3–5 evidence, read the Current handoff in [the progress record](../BCIS_PROGRESS_AND_DOCUMENTATION.md). Static checks do not run guarded PostgreSQL or Electron workflow tests by default.

```powershell
corepack pnpm --dir source --filter @bcis/api exec vitest run --maxWorkers=1 --isolate=false --testTimeout=15000 --hookTimeout=15000 --no-cache
corepack pnpm --dir source --filter @bcis/desktop exec vitest run --no-cache
corepack pnpm --dir source --filter @bcis/shared exec vitest run --no-cache
corepack pnpm --dir source typecheck
& .\tests\Test-SubmissionReadiness.ps1
& .\tests\Test-SubmissionReadiness.ps1 -RequireFinalArtifacts
```

Final-artifact mode currently fails at missing screenshots. It stops at the first missing item; this does not establish that every later artifact exists. The checker requires the retained root completion plan.

Use the [AT matrix](acceptance/AT-01-AT-12.md), [demo checklist](acceptance/demo-checklist.md) and [dated progress](../BCIS_PROGRESS_AND_DOCUMENTATION.md). Keep future sanitized evidence under tests/evidence/YYYY-MM-DD with environment, command output, assertions, actor role, result and checksums; capture UI evidence under tests/screenshots. Do not commit credentials, customer records, backups or proof images.

Tests must be isolated from development/production databases. Static success and the existing local financial snapshot do not establish installed-client, printer, full restore or three-PC acceptance.

## Gate 5 isolated backup/restore drill

Create an **empty**, disposable PostgreSQL 18 database named `bcis_restore_test` with owner `bcis_app`. It must be separate from both `bcis` and `bcis_test`. The opt-in test will replace its contents; never point it at customer data or the sole retained database. The ignored API `.env` must already contain the local `bcis_app` connection to `127.0.0.1:5433/bcis`; the `bcis_test` database must be migrated and seeded through migration 0018 (19 migration records).

From the repository root in PowerShell, construct test-only URLs from that ignored configuration without printing the password:

```powershell
$line = Get-Content -LiteralPath 'source/apps/api/.env' | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'Missing ignored DATABASE_URL' }
$dev = [Uri]($line.Substring('DATABASE_URL='.Length).Trim().Trim('"'))
if ($dev.Host -ne '127.0.0.1' -or $dev.Port -ne 5433 -or $dev.AbsolutePath -ne '/bcis') { throw 'Unexpected development database identity' }
$target = [System.UriBuilder]::new($dev)
$target.Path = 'bcis_test'
$env:BCIS_TEST_DATABASE_URL = $target.Uri.AbsoluteUri
$target.Path = 'bcis_restore_test'
$env:BCIS_RESTORE_DATABASE_URL = $target.Uri.AbsoluteUri
$env:BCIS_RESTORE_CONFIRMATION = 'RESTORE bcis_restore_test'
& .\tests\Invoke-Gate5CleanSetup.ps1
corepack pnpm --dir source --filter @bcis/api exec vitest run test/gate5-backup-postgres.test.ts --maxWorkers=1 --isolate=false --testTimeout=120000 --hookTimeout=15000
```

The clean-setup script refuses an already populated target, migrates/seeds only the dedicated database, checks migration repeatability and required synthetic counts, and keeps its generated bootstrap password out of Git and output. The subsequent restore test **replaces that disposable target's contents** with a verified custom archive from `bcis_test`; it posts one synthetic Cash payment after snapshot export and compares restored invoice/payment/ledger counts and centavo totals plus the pre-write daily-collections report. Omit the two restore environment variables to run archive verification only; the restore case then skips. Record the test output, archive SHA-256 and the database identities in sanitized AT-12 evidence. This does not replace installed-client, printing or LAN checks.

## Gate 5 Playwright Electron smoke and Cash workflow

Use only migrated/seeded `bcis_test`. Start the isolated API on `127.0.0.1:4110` with `DATABASE_URL` set to the guarded test URL, `BCIS_API_PORT=4110`, and `BCIS_ALLOWED_ORIGINS=http://localhost:5173`. Start Electron development mode with `VITE_BCIS_API_BASE_URL=http://127.0.0.1:4110`, `BCIS_API_ORIGIN=http://127.0.0.1:4110`, and `--remoteDebuggingPort 9236`; clear `ELECTRON_RUN_AS_NODE` only in that process. In a third terminal, set `BCIS_TEST_DATABASE_URL` using the guarded URL construction above and run:

```powershell
corepack pnpm --dir source --filter @bcis/api exec tsx test/gate5-playwright-smoke.ts
```

The script requires a ready API and an actual Electron renderer at `localhost:5173`/CDP `9236`. It tests unavailable login, Owner login, dashboard and navigation, API failure/recovery, UI subscriber/service creation, billing finalization, partial Cash payment, receipt, persisted invoice/allocation/ledger, report and audit records, renderer reload and sign-out. It creates synthetic `bcis_test` records only, deactivates its synthetic actor, and writes a Playwright trace under ignored `tests/screenshots` **only on failure**. Stop the isolated API and Electron processes after the run. This is unpackaged desktop evidence; installed-client acceptance remains separate.
