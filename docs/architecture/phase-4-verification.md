# Phase 4 Verification

Date: 2026-09-22

## Implemented

- Billing-period preview for active subscribers and active service accounts whose billing start date is within the selected month.
- Transactional monthly finalization with a PostgreSQL advisory lock, UUID command idempotency, database uniqueness per service account and cycle, transactional invoice/ledger numbering, and one audit record for the completed cycle.
- Finalized invoices with exact `bigint` centavos, immutable plan code/name and current-rate snapshots, positive-value constraints, and immutable line items.
- Append-only ledger debits with exclusive debit/credit constraints, deterministic sequence order, and reproducible running subscriber balances.
- Invoice list/detail, billing-cycle list, and subscriber Statement of Account endpoints with server-side permission checks.
- Electron billing preview/confirmation, invoice list, and subscriber ledger/SOA summary workflows.
- Invoice void requests fail closed with `POLICY_NOT_APPROVED`; no destructive or guessed correction behavior was introduced.

## Provisional policy boundary

Until the official laboratory rules are provided, the code uses one clearly marked default: a monthly invoice is dated on the billing period's last day and is due on the service account's configured due day in the following month. Days are restricted to 1 through 28.

Penalties, discounts, taxes, proration, automatic adjustments, and invoice void/credit behavior are disabled. They must not be inferred from the current schema or UI.

## Database artifacts

- `database/migrations/0003_sleepy_vance_astro.sql` creates billing cycles, invoices, invoice items, ledger entries, idempotency records, financial enums, indexes, foreign keys, and constraints.
- `database/migrations/0004_brief_red_wolf.sql` tightens invoice and line-item values to strictly positive centavos.
- The existing `number_sequences` table supplies invoice and ledger sequence values inside the finalization transaction.

## Automated result

Commands:

```powershell
corepack pnpm --dir source check
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed for desktop, API, shared contracts, and database tooling.
- 21 tests passed: 16 API/domain tests, 4 shared contract tests, and 1 Electron security test.
- Billing rules cover month boundaries, leap years, year rollover, due dates, positive invoice values, and exact `bigint` multiplication.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Drizzle migration validation passed with `Everything's fine`.

## Unaccepted live financial gates

- Apply migrations `0000` through `0004` to a clean PostgreSQL 16-or-newer database and run both seeds.
- Generate a cycle from the 60 seeded services and reconcile invoice totals, line items, ledger debits, and subscriber SOA balances.
- Prove repeated use of the same command key returns the same result and a different command cannot duplicate a finalized service/cycle.
- Run AT-11 with simultaneous clients and confirm the advisory lock and unique constraints prevent duplicate invoices and ledger entries.
- Inject a failure during finalization and prove cycles, invoices, items, sequence increments, ledger entries, idempotency, and audit all roll back together.
- Exercise preview/finalize/invoice/SOA workflows in the packaged Electron client under permitted and denied roles.
- Obtain instructor approval for due-date timing, invoice number format/reset policy, penalties, discounts, taxes, proration, and void/credit approval before treating Phase 4 as financially accepted.

Phase 5 payment work must preserve these open gates and must not implement advance-payment or GCash behavior until those policies are confirmed. The official laboratory PDF remains absent.
