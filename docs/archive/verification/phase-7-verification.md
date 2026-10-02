# Phase 7 Verification

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

Date: 2026-09-22

## Implemented

- Outstanding and overdue invoice views with an explicit required as-of date and server-side pagination.
- Historical paid amounts reconstructed from payment-allocation, payment, and reversal timestamps so a past as-of balance does not change after a later payment or reversal.
- Server-calculated AR aging buckets: current, 1–30, 31–60, 61–90, and 91+ days.
- Boundary rule that an invoice due on the as-of date is current and becomes overdue the next calendar day.
- User-entered suspension-candidate review filters for minimum overdue days and minimum outstanding balance. These filters do not constitute or automate company policy.
- Append-only suspension and reconnection records with open-request uniqueness, optimistic versions, reasons, actor/timestamp history, and audit events.
- Controlled `REQUESTED -> APPROVED -> COMPLETED` workflow. The requester cannot approve; the approver cannot complete.
- Atomic completion that changes the service account status and writes its service event and business audit record in the same transaction.
- Optional reconnection payment linkage that accepts only a posted payment belonging to the service subscriber.
- Electron receivables, overdue, aging, suspension-candidate, suspension-history, and reconnection-history workspace.

## Policy-safe boundaries

- There is no automatic suspension. Candidate thresholds are explicit review inputs because grace-period and cutoff policy remains unapproved.
- A qualifying payment can be linked and validated, but it is not mandatory because the required amount/payment rule remains unapproved.
- No reconnection fee is posted. Completing reconnection records a zero-fee audit fact until fee policy is approved.
- Rejection and cancellation values exist in the database state model, but no endpoint exposes them until decision authority and required reasons are approved.
- Company timezone configuration is still pending. Date-only aging is deterministic, while the as-of day cutoff currently follows PostgreSQL's configured session timezone.

## Database artifact

- `database/migrations/0009_classy_sauron.sql` creates the shared service-control status enum, suspension records, reconnection records, foreign keys, checks, status/time indexes, and partial unique indexes preventing duplicate open requests for one service.
- Aging totals are not stored; they are calculated from invoices and historical payment allocations.

## Automated result

Commands:

```powershell
corepack pnpm --dir source check
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed for desktop, API, shared contracts, and database tooling.
- 39 tests passed: 34 API/domain tests, 4 shared contract tests, and 1 Electron security test.
- Receivable tests cover due-date and 30/60/90-day boundaries, date-only arithmetic, invalid dates, valid/invalid service-control transitions, and actor separation.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Drizzle migration validation passed with `Everything's fine`.

## Unaccepted live gates

- Apply migrations `0000` through `0009` to PostgreSQL 16 or newer and run both seeds.
- Compare detail rows and every aging bucket against SQL/ledger evidence for current and historical as-of dates, including a payment and later reversal crossing the selected date.
- Verify concurrent suspension/reconnection requests, optimistic conflicts, and database partial uniqueness with real PostgreSQL transactions.
- Complete two multi-user scenarios: request/approve/complete suspension and request/approve/complete reconnection, proving role checks, actor separation, service events, and audit history.
- Approve the business timezone, grace period, suspension thresholds, approval roles, qualifying-payment rule, and reconnection-fee rule before enabling automation or fee posting.
- Run the packaged Electron workflow on the intended LAN PCs.

Phase 7 is code-complete within the policy-safe boundary. It is not live-accepted and must not be represented as automatic service cutoff, payment-qualified reconnection, or reconnection-fee billing. The official laboratory PDF remains absent.
