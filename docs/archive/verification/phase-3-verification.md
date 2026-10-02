# Phase 3 Verification

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

Date: 2026-09-22

## Implemented

- Service types and Internet, Cable, and Combo plans with exact centavo values, validation, activation state, and optimistic versions.
- Transactional subscriber and service-account number sequences.
- Subscribers with addresses, contacts, collection-area and collector links, lifecycle status, and optimistic updates.
- Service accounts with plan-rate snapshots, installation addresses, validated lifecycle transitions, and append-only service history events.
- Collection areas, routes, collectors, and effective collector assignments. A database constraint prevents multiple active collector assignments for one service account.
- Server-side subscriber search across account number, normalized name, contact, and address, with bounded pagination.
- Permission-protected Fastify endpoints for listing, creating, updating, activating, deactivating, and assigning Phase 3 records.
- Electron workflows for subscriber search/creation/profile, service-account creation, plan setup, and collection master setup.
- Exact-money display without conversion through JavaScript floating-point numbers.

## Database artifacts

Migration `database/migrations/0001_stale_archangel.sql` defines the Phase 3 master and history tables plus number sequences. Migration `database/migrations/0002_special_justice.sql` enables `pg_trgm` and adds GIN trigram indexes for subscriber name, contact, and address search.

`database/seeds/02-master-data.ts` deterministically prepares:

- 3 service types and 7 plans: 3 Internet, 2 Cable, and 2 Combo.
- 3 collection areas and routes, plus 2 collectors.
- 50 synthetic subscribers and 60 synthetic service accounts.

The seed is idempotent by stable identifiers and is not run automatically.

## Automated result

Commands:

```powershell
corepack pnpm --dir source check
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed for desktop, API, shared contracts, and database tooling.
- 18 tests passed: 13 API/domain tests, 4 shared contract tests, and 1 Electron security test.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Drizzle migration structure validation passed with `Everything's fine`.
- Regression coverage distinguishes initial activation from reconnection and rejects invalid service lifecycle transitions.

## Unaccepted live gates

- Install or connect PostgreSQL 16 or newer and apply migrations `0000` through `0002` to a clean database.
- Confirm the deployment database role may install or use `pg_trgm`.
- Run the security and master-data seeds with a private bootstrap password.
- Verify the 50 subscribers and 60 service accounts, number generation, profile history, optimistic conflicts, and active-assignment constraint against PostgreSQL.
- Capture `EXPLAIN (ANALYZE, BUFFERS)` evidence for account, name, contact, and address searches at target-like volume.
- Exercise the Phase 3 workflows in the packaged Electron client, including permission denial and multi-client editing.
- Add browser/Electron CRUD end-to-end coverage once the live database test environment exists.

Phase 4 must not be represented as financially accepted until the Phase 3 live gates pass and the billing, due-date, numbering, penalty, discount, and void rules identified in the plan are approved. The official laboratory PDF is still absent.
