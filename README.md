# BCIS Subscription Billing and Collection System

BCIS targets three Windows Electron clients connected to one Fastify API and PostgreSQL server. Only the server accesses the database.

## Current status

Partial; not finally accepted. The 2026-09-28 audit confirmed PostgreSQL 18/5433, API readiness, 13 applied migrations, a persisted Cash/reversal slice and 55 passing automated tests. A backup and NSIS artifact exist. Policy-dependent features, isolated restore, clean installation, printing, complete demo data and three-PC acceptance remain open. Packaged-origin CORS and other reliability findings are recorded in the [defect log](docs/defect-log.md).

For implementation across sessions, use only the [approved phased plan](BCIS_COMPLETION_PLAN.md) and the [current handoff/progress record](BCIS_PROGRESS_AND_DOCUMENTATION.md). The [official activity](BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md) defines the required features; the [detailed checklist](BCIS_Development_Status_Checklist.md) is a supporting reference. Historical phase numbers are not completion claims.

## Prerequisites and setup

Node.js 22–24 under the current project policy, Corepack, and PostgreSQL 16+ are required. The current local integration target is PostgreSQL 18 on port 5433; the API uses 4100.

On a fresh checkout only, copy each .env.example to its corresponding .env if that file does not already exist. Preserve existing local configuration. Configure server-only database/bootstrap secrets privately; keep PostgreSQL administrator, application role and BCIS owner passwords separate.

```powershell
corepack pnpm --dir source install
```

Follow [database preparation](database/README.md) to migrate and seed the intended synthetic environment. Do not run seeds against production/customer data.

Run in separate terminals:

```powershell
corepack pnpm --dir source dev:api
corepack pnpm --dir source dev:desktop
```

Only one API process can listen on 127.0.0.1:4100. EADDRINUSE means another process already owns that address; inspect it and health endpoints before starting another instance.

The desktop defaults to http://127.0.0.1:4100. LAN clients need the server's approved API address and matching desktop/CSP/server-origin configuration; see [deployment](docs/deployment/windows-lan.md). The current packaged client is not yet accepted.

## Verification and navigation

```powershell
& .\tests\Run-StaticAcceptance.ps1
```

This required static gate includes builds and does not replace PostgreSQL integration, Electron E2E, restore, installer, printing or three-PC evidence.

- [Documentation index](docs/README.md): active guides, ownership and archive inventory.
- [Test guide](tests/README.md) and [AT-01–AT-12](tests/acceptance/AT-01-AT-12.md).
- [Synthetic report samples](reports-samples/README.md).
- source/apps/desktop: main/preload and renderer.
- source/apps/api: API, domain modules and schema.
- source/packages/shared: safe contracts and serialization.
- database: migrations 0000–0014, controlled migration script and synthetic seeds; 0013 adds route-sheet snapshots and 0014 adds the REMITTED batch state. Apply both before using the updated collection-batch workflow.

Archived prompts and phase results under docs/archive/ are historical evidence, not active execution instructions.
