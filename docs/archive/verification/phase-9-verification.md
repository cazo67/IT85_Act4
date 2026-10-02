# Phase 9 Verification

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

Date: 2026-09-22

## Implemented

- Persistent backup history with running, created, verified, failed, and restored states.
- PostgreSQL custom-format backup creation through `pg_dump`, invoked directly without a command shell or credentials in command arguments.
- A versioned JSON manifest containing database byte size, SHA-256, and invoice/payment/ledger financial snapshot totals.
- Verification that re-reads the archive and manifest, compares the database and financial snapshot checksums, and asks `pg_restore --list` to parse the archive.
- Restore re-verifies the archive, requires `backup.restore`, current-password re-authentication, and the exact backup-specific `RESTORE <uuid>` phrase.
- Restore uses `--single-transaction`, maintenance-mode request blocking, no-owner/no-privilege restoration, and revokes every session after success.
- Server-side operation locking and backup-root path containment.
- Owner backup/preflight/history/verify/restore UI with explicit warnings and tool readiness.
- Runtime Electron CSP restricted to the configured API origin, while preserving context isolation, sandboxing, disabled Node integration, denied permission requests, and restricted external navigation.
- Windows prerequisite/start scripts, LAN deployment instructions, and an NSIS build command with the intended top-level `release/` target.
- Migration `0010_bouncy_stick.sql` for backup history.

## Safety boundaries

- The current application has no active attachment module. The manifest explicitly records that attachments are not included instead of falsely claiming a complete file backup.
- Only a database backup selected from server-controlled history can be restored; clients cannot submit filesystem paths or commands.
- A failed `pg_restore --single-transaction` should leave the existing database unchanged. This still requires a real destructive rehearsal on an isolated target.
- Restore revokes all sessions, so every operator must sign in against the restored security state.
- Backup files and manifests are excluded from Git and must be protected and copied to approved offline media by the operator.

## Automated result

Commands:

```powershell
corepack pnpm --dir source typecheck
corepack pnpm --dir source --filter @bcis/api test
corepack pnpm --dir source --filter @bcis/desktop test
corepack pnpm --dir source --filter @bcis/shared test
corepack pnpm --dir source build
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed across the workspace.
- 48 tests passed: 42 API/domain/export/backup tests, 4 shared tests, and 2 Electron security tests.
- Backup tests cover exact restore phrases, backup-root containment, and PostgreSQL credential environment separation.
- Electron tests cover sandbox isolation and API-origin CSP validation.
- API and Electron production builds pass; Drizzle migration validation passes.

## Packaging result

The NSIS command successfully rebuilt Electron main, preload, and renderer and began `electron-builder` packaging. The installer could not be completed in this environment because the required packaging cache/download was unavailable; no installer artifact is claimed or retained. The corrected output target is the top-level `release/` directory.

## Unaccepted live gates

- PostgreSQL and `pg_dump`/`pg_restore` are not installed on this machine, so no real backup, verification, or restore occurred.
- Apply migrations `0000` through `0010` on a clean PostgreSQL 16+ database and run both seeds.
- Perform an isolated backup/restore drill and reconcile manifest totals, dashboard, AR aging, SOA, collections, and audit records before/after.
- Confirm filesystem ACLs, offline backup copying, free-space/failure behavior, Windows service restart, and log rotation.
- Complete the NSIS build with the required packaging cache/network, install it, and test upgrades/uninstall on the target Windows version.
- Confirm the three client addresses, firewall scope, TLS or approved isolated-HTTP decision, simultaneous clients, printer, and exports.

Phase 9 is code-prepared but not accepted. Its definition of done requires infrastructure and destructive recovery evidence that cannot be safely fabricated without the target PostgreSQL/LAN environment.
