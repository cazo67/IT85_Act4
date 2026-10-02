# Windows LAN Deployment Guide

This guide describes the intended three-PC laboratory topology. PostgreSQL 18/5433 and a local Cash workflow are evidenced; three-PC deployment and isolated restore are not accepted. The packaged file-origin CORS failure (D-010 in the defect log) must be resolved before installed-client acceptance. An NSIS artifact exists, but clean install/uninstall and current-source packaging remain open.

## Topology

- One designated server PC runs PostgreSQL 16+, the compiled Fastify API, PostgreSQL backup tools, and the protected backup directory.
- Three Electron clients contain only `VITE_BCIS_API_BASE_URL`; they never receive database credentials.
- Use a static/private server address. Permit the API port only from the three client addresses or the trusted lab subnet.

## Server preparation

1. Install Node.js 22–24 and PostgreSQL 16 or newer.
2. Run `deployment/windows/Test-BcisPrerequisites.ps1` from an elevated administrative review terminal.
3. Create separate Windows and PostgreSQL service accounts. Grant the API account access only to its application database, log directory, and `BCIS_BACKUP_ROOT`.
4. Copy `source/apps/api/.env.example` to a protected server-only environment file. Replace every sample secret and path.
5. Set `BCIS_API_HOST` to the server's private LAN address or `0.0.0.0`; never expose the port directly to the public Internet.
6. Apply migrations `0000` through `0014`, then run the reviewed security and master-data seeds only for the intended environment. Migration `0013` adds nullable route-sheet snapshot fields; older batches remain labelled legacy/incomplete. Migration `0014` adds the REMITTED state without rewriting older batches.
7. Build with `corepack pnpm --dir source --filter @bcis/api build` and start through a Windows service manager using `deployment/windows/Start-BcisApi.ps1` as the reviewed launch command.
8. Configure the service manager to restart on failure, capture stdout/stderr to a protected log directory, and rotate logs by size/time. Do not place passwords in launch arguments.

## Firewall and transport

Create the inbound firewall rule only after the server address, API port, and client addresses are confirmed. Prefer TLS through a trusted reverse proxy or local certificate authority. If the laboratory explicitly accepts HTTP on an isolated LAN, document that limitation and restrict the firewall scope. Never expose the PostgreSQL listener to desktop clients (local target: 5433; standard installations may use 5432).

## Client preparation

1. Set `VITE_BCIS_API_BASE_URL` to the approved server URL before building, and set the installed user's `BCIS_API_ORIGIN` to the same origin so the runtime CSP permits only that API.
2. Build the NSIS installer with `corepack pnpm --dir source --filter @bcis/desktop dist:win`.
3. Install on each PC, sign in with a separate test account, and confirm `/health/live`, `/health/ready`, role navigation, reconnect behavior, printing, and exports.

## Backup and restore drill

1. Create a backup from Administration → Backup.
2. Verify it immediately. Verification recomputes SHA-256 and asks `pg_restore --list` to parse the archive.
3. Record the manifest financial snapshot and copy the whole backup-set directory to approved offline media. The current application has no active attachment module, so the manifest explicitly records that attachments are absent.
4. On an isolated rehearsal database/server, select the verified backup, re-enter the current password, and type the displayed `RESTORE <uuid>` phrase exactly.
5. Restore runs with `--single-transaction`; BCIS enters maintenance mode and revokes every session after success.
6. Reconnect, then compare invoice/payment/ledger counts and centavo totals against the manifest. Run dashboard, aging, SOA, and collection reports.
7. Keep the production restore disabled operationally until this rehearsal succeeds and an authorized owner approves the target and downtime.

## Still-required live evidence

- Clean migration and seed transcript on PostgreSQL 16+.
- Successful backup, checksum/catalog verification, isolated restore, and financial comparison.
- API restart/recovery and log-rotation evidence.
- NSIS installation on the target Windows version.
- Three simultaneous clients, printer/export checks, firewall scope, and TLS or accepted isolated-HTTP decision.
