# BCIS Subscription Billing and Collection System

BCIS is a desktop billing and collection system planned for three office PCs. Electron clients communicate with one Fastify API, and only the API can access PostgreSQL or server-managed files.

## Current checkpoint

Phases 1 through 8 are implemented at code level, Phase 9 backup/deployment controls are code-prepared, and Phase 10 documentation and static QA are prepared within documented safety boundaries. The repository provides authentication and RBAC, subscriber/service master data, transactional billing and payments, receipts/reversals, route batches, historical AR aging, controlled service actions, dashboard/reports, PDF/XLSX exports, an audit viewer, verified-backup orchestration, restore safety controls, and Windows LAN guidance. Policy-blocked financial features remain disabled. This is a release candidate, not a final accepted release: live PostgreSQL recovery, completed NSIS packaging, installed printing, and three-PC acceptance are pending.

## Prerequisites

- Node.js 24 (Node 22 LTS is also supported by the project policy)
- Corepack
- PostgreSQL 16 or newer for live database readiness

The current machine does not have PostgreSQL installed. Automated tests do not require a live database, but `/api/v1/health/ready` will report unavailable until `DATABASE_URL` is configured and reachable. Commands invoke pnpm through Corepack, so a system-wide pnpm installation is not required.

## Setup

```powershell
Copy-Item source/apps/api/.env.example source/apps/api/.env
Copy-Item source/apps/desktop/.env.example source/apps/desktop/.env
corepack pnpm --dir source install
corepack pnpm --dir source check
```

Run the API and desktop in separate terminals:

```powershell
corepack pnpm --dir source dev:api
corepack pnpm --dir source dev:desktop
```

The default API URL is `http://127.0.0.1:4100`. For another LAN PC, set the desktop URL to the server PC's LAN address and configure the API host/firewall deliberately.

## Workspace

- `source/apps/desktop` — Electron main, preload, and React renderer.
- `source/apps/api` — Fastify API, server-only configuration, and PostgreSQL readiness.
- `source/packages/shared` — safe public contracts and serialization helpers.
- `database` — reviewed migrations and synthetic seeds when their phases begin.
- `docs` — architecture, deployment, technical, and user documentation.
- `tests` — acceptance procedures and evidence.

See `BCIS_IMPLEMENTATION_PLAN.md` for the approved phased roadmap and unresolved instructor decisions. Documentation navigation is in `docs/README.md`; test and acceptance navigation is in `tests/README.md`.

Checkpoint evidence is documented under `docs/architecture/phase-1-verification.md` through `docs/architecture/phase-10-verification.md`. Sanitized PDF/XLSX examples are under `reports-samples/`; Windows deployment guidance is under `docs/deployment/`.
