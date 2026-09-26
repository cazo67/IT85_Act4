# Phase 5 Verification

Date: 2026-09-22

## Implemented

- Cash-payment preview and posting with exact `bigint` centavos.
- Oldest-due-invoice-first allocation for exact and partial payments.
- A subscriber-scoped PostgreSQL advisory lock, UUID command idempotency, row locks on open invoices, and one transaction for payment, allocations, invoice settlement, ledger credit, receipt, numbering, and audit.
- Immutable payment and allocation history; posted records have no update/delete endpoint.
- Unique payment and receipt numbers and one receipt snapshot per posted payment.
- Compensating payment reversal with a required reason, allocation reversal markers, restored invoice balances, receipt void timestamp, ledger debit, unique reversal record, and audit.
- Subscriber credits and GCash proof metadata tables with reference/storage uniqueness and value constraints, ready for approved future policy.
- Cashier Electron workflow for subscriber search, allocation preview, confirmation, receipt display/printing, payment history, and permission-gated reversal.
- API permission enforcement for payment creation and reversal; the print action is shown only with `receipt.print`.

## Fail-closed policy gates

- An amount greater than the subscriber's current outstanding balance returns `ADVANCE_PAYMENT_POLICY_REQUIRED`. No centavo is discarded and no unapproved credit is created.
- GCash posting and proof upload return `GCASH_POLICY_NOT_APPROVED` until proof format/size, storage/retention, duplicate-reference, verification, and separation-of-duties rules are approved.
- The schema contains explicit credit and proof records, but no endpoint can create them while those policies remain unresolved.

## Database artifacts

- `database/migrations/0005_jazzy_morlun.sql` adds payments, allocations, subscriber credits, receipts, proof metadata, reversals, invoice settlement state, payment ledger types, constraints, and indexes.
- `database/migrations/0006_fuzzy_expediter.sql` adds the database foreign key from ledger payment references to payments.

## Automated result

Commands:

```powershell
corepack pnpm --dir source check
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed for desktop, API, shared contracts, and database tooling.
- 25 tests passed: 20 API/domain tests, 4 shared contract tests, and 1 Electron security test.
- Allocation tests cover partial payment, exact multi-invoice allocation, conservation of value, visible overpayment, and external-reference normalization.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Drizzle migration validation passed with `Everything's fine`.

## Unaccepted live financial gates

- Apply migrations `0000` through `0006` to PostgreSQL 16 or newer and run both seeds.
- Generate invoices, then prove exact and partial cash payments reconcile invoice `paid_centavos`, allocations, payment totals, ledger credits, receipts, and subscriber SOA balances.
- Run simultaneous posting attempts and idempotent retries against PostgreSQL; prove no duplicate receipt, allocation, payment, or ledger entry can commit.
- Inject failures at each posting and reversal step and prove the transaction leaves no partial financial state or consumed sequence number.
- Reverse a payment after multiple allocations and prove invoice states, the compensating ledger entry, voided receipt, and closing balance reconcile.
- Verify purpose-built receipt output with the actual office printer and packaged Electron application.
- Complete AT-01 through AT-06 in the live environment. Advance-payment and GCash cases remain blocked until the instructor supplies and approves their missing policies.

Phase 5 is code-complete only for the safe cash exact/partial/reversal path. It is not fully accepted and must not be represented as supporting advance payments or GCash. The official laboratory PDF remains absent.
