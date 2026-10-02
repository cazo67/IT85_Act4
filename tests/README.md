# Test and Acceptance Guide

Run the required static gate from the repository root:

```powershell
& .\tests\Run-StaticAcceptance.ps1
```

It runs source-integrity checks, serialized typechecks, automated tests, production builds and Drizzle consistency. It writes build outputs; use focused non-emitting/no-cache checks for a read-only audit.

Latest read-only audit (2026-09-28): 48 API, 3 Electron configuration and 4 shared tests passed. All workspace typechecks and schema/source-integrity checks passed. Those Electron tests do not launch the desktop. PostgreSQL integration against a guarded bcis_test target and Playwright Electron workflows remain missing.

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
