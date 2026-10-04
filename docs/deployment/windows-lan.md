# Windows LAN Deployment Guide

This guide describes the intended three-PC laboratory topology. PostgreSQL 18/5433, the guarded local Cash workflow and isolated restore have evidence; three-PC deployment and installed-client acceptance do not. The API now accepts packaged `Origin: null` only when the server operator explicitly allowlists it; a read-only local health check passed, but real packaged login is still unverified. A current-source local-address NSIS candidate exists; clean install/uninstall and LAN packaging remain open. See the current handoff and Gate 6 evidence before deployment.

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
6. Before deployment, back up the intended database and review the pending append-only migrations against its current state. The current source contains migrations `0000` through `0018`; the guarded test database has 19 migration records, while normal local `bcis` has only 15. Do not run the newer migrations or reseed normal `bcis` as part of an unreviewed installer test. Run security/master-data seeds only where explicitly intended; the synthetic master-data seed can overwrite later plan prices.
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
3. Record the manifest financial snapshot and copy the whole backup-set directory to approved offline media. GCash proof bytes are stored in PostgreSQL `payment_proofs.proof_data` and are included in the database archive.
4. On an isolated rehearsal database/server, select the verified backup, re-enter the current password, and type the displayed `RESTORE <uuid>` phrase exactly.
5. Restore runs with `--single-transaction`; BCIS enters maintenance mode and revokes every session after success.
6. Reconnect, then compare invoice/payment/ledger counts and centavo totals against the manifest. Run dashboard, aging, SOA, and collection reports.
7. A guarded `bcis_test` to `bcis_restore_test` rehearsal passed locally. Keep production restore disabled operationally until the actual target, retained backup, authorized owner and downtime are separately reviewed.

## Still-required live evidence

- Reviewed migration/seed and rollback transcript for the intended non-test database.
- Production-target recovery approval; the guarded local isolated restore is evidenced separately.
- API restart/recovery and log-rotation evidence.
- NSIS installation on the target Windows version.
- Three simultaneous clients, printer/export checks, firewall scope, and TLS or accepted isolated-HTTP decision.
