# Phase 6 Verification

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

Date: 2026-09-22

## Implemented

- Collection batches with unique numbers, collector/route/date identity, optimistic versions, and a forward-only `DRAFT -> ACTIVE -> SUBMITTED -> RECONCILED -> CLOSED` lifecycle.
- Immutable route-account snapshots containing subscriber, service, and expected outstanding balances at batch creation.
- Effective collector/route assignments in the deterministic master-data seed.
- Active-batch collection posting that reuses the Phase 5 payment engine inside the same PostgreSQL transaction.
- Service-specific oldest-first invoice allocation, payment, receipt, ledger credit, batch entry, account total, batch total, and audit as one atomic command.
- Command idempotency for route collections and database uniqueness preventing one payment from being attached to multiple batches.
- Submission freezes collection recording. One append-only remittance records remitted cash and the signed difference.
- Balanced reconciliation and close, with database constraints requiring reconciled cash to match collected cash.
- Closed batches have no mutation endpoint, preserve their snapshots, and block ordinary payment reversal for linked collections.
- Electron batch list/detail, snapshot creation, lifecycle actions, collection entry, printable route sheet, remittance, difference display, reconciliation, and close workflow.

## Fail-closed policy boundary

- Shortages and overages are stored as signed differences and remain visible.
- A nonzero difference returns `DIFFERENCE_APPROVAL_REQUIRED`; the batch remains submitted and cannot close.
- Batch-linked payments return `BATCH_PAYMENT_REVERSAL_REQUIRES_RECONCILIATION` from the ordinary reversal endpoint because an approved batch-correction process has not been defined.
- Non-cash batch totals remain zero while GCash is disabled by the Phase 5 policy gate.

## Database artifacts

- `database/migrations/0007_pink_queen_noir.sql` creates batch, route-account snapshot, collection-entry, remittance, and reconciliation tables with lifecycle enums, relationships, uniqueness, value checks, and query indexes.
- `database/migrations/0008_sticky_pretty_boy.sql` tightens route accounts so collected cash cannot exceed their frozen expected amount.
- `database/seeds/02-master-data.ts` now creates effective route assignments for all 60 synthetic service accounts.

## Automated result

Commands:

```powershell
corepack pnpm --dir source check
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed for desktop, API, shared contracts, and database tooling.
- 27 tests passed: 22 API/domain tests, 4 shared contract tests, and 1 Electron security test.
- Collection tests cover every allowed lifecycle transition, invalid jumps, immutable closed state, balanced remittance, shortage sign, and overage sign.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Drizzle migration validation passed with `Everything's fine`.

## Unaccepted live financial gates

- Apply migrations `0000` through `0008` to PostgreSQL 16 or newer and run both seeds.
- Generate billing before creating a route batch, then verify all assigned accounts and expected balances match open service-account invoices.
- Complete a balanced batch and reconcile batch entries to payments, allocations, receipts, ledger credits, invoice balances, remittance, and closing status.
- Run AT-07 and AT-08 against PostgreSQL, including concurrent collection retries and unauthorized transition/close attempts.
- Inject failures during batch payment, submission, remittance, reconciliation, and close and prove no partial state commits.
- Print and inspect the route sheet from the packaged Electron application.
- Obtain the shortage/overage approval, correction, and batch-linked payment reversal rules before enabling exception closure.

Phase 6 is code-complete for balanced cash batches only. It is not fully accepted and must not be represented as supporting non-cash collections or shortage/overage approval. The official laboratory PDF remains absent.
