# Integration Contract Map

Updated: 2026-09-28

This map records the current UI → API → authorization → PostgreSQL → evidence chain. `Live` means exercised against the local PostgreSQL 18 database; it does not imply installed-client or three-PC acceptance.

| Module | Desktop entry | API contract | Required permissions | Primary tables | Current evidence |
|---|---|---|---|---|---|
| Authentication | Login, forced password change, lock | `/api/v1/auth/*` | Authenticated session; explicit permission checks after login | `users`, `auth_sessions`, `login_attempts`, role tables | Live API login and `/me`; forced-change flag verified; Electron login still needs E2E |
| Security administration | Users and roles | `/api/v1/users`, `/api/v1/roles` | `user.manage`, `role.manage` | `users`, `roles`, `permissions`, assignment tables, `audit_logs` | Code-level and authorization tests; live UI acceptance pending |
| Subscribers | Subscriber list/profile/new subscriber | `/api/v1/subscribers` | `subscriber.view/create/update` | `subscribers`, addresses, contacts, sequences, audit | Live create, search, detail, and restart persistence verified |
| Plans and services | Plans panel and subscriber profile | `/api/v1/plans`, `/api/v1/service-accounts` | `service.view/manage`, `plan.manage` | service types/plans/accounts/events, audit | Live Internet service creation and persistence verified |
| Billing and invoices | Billing and invoice panels | `/api/v1/billing/*`, `/api/v1/invoices` | `billing.view/generate`; `billing.adjust` remains gated | cycles, invoices, items, ledger, idempotency, audit | Live preview/finalize and debit verified; duplicate period protection present |
| Payments and receipts | Receive payment and history | `/api/v1/payments`, reversal route | `payment.create/reverse`, `receipt.print` | payments, allocations, receipts, reversals, ledger, audit | Live partial/final Cash, same-key API retry, receipt, reversal and status restoration recorded; desktop retry key persistence remains defective |
| GCash | No enabled posting workflow | `/api/v1/gcash/proofs`; `GCASH` payment method | `payment.create`, `payment.verify_gcash` | proof/reference foundation only | Blocked by explicit policy gates |
| Receivables and service control | Receivables panel | `/api/v1/receivables`, suspensions, reconnections | `receivable.view`, `service.suspend/reconnect` | invoices, service accounts, suspension/reconnection records, audit | Calculation tests and live balance evidence; full service-control acceptance pending |
| Collections | Setup and batch panels | `/api/v1/collection-*`, batch lifecycle routes | route/batch/record/reconcile permissions | areas, routes, collectors, assignments, batches, remittances, reconciliations | Code/rule evidence; live batch workflow pending |
| Reports and dashboard | Dashboard and reports panel | `/api/v1/dashboard`, `/api/v1/reports/*` | `dashboard.view`, `report.view/export` | financial/source tables plus audit export record | Live monthly Cash inclusion verified; PDF/XLSX renderer tests pass |
| Audit | Audit panel | `/api/v1/audit-logs` | `audit.view` | `audit_logs`, `users` | Live subscriber, service, billing, payment, and reversal records verified |
| Backup and restore | Backup panel | `/api/v1/backups/*` | `backup.create/restore` | `backup_runs`, audit; server backup storage | One real backup marked VERIFIED with recorded checksum/catalog evidence; isolated restore pending |

## Cross-cutting contracts

- API errors remain `{ error: { code, message, requestId?, fieldErrors? } }`.
- Money remains integer `bigint` centavos in authoritative code and decimal strings over HTTP.
- Renderer sessions contain only opaque tokens in memory; database credentials remain server-side.
- Finalized financial history is corrected through linked reversals, never destructive edits.
- GCash, advance credit, invoice voiding, and unbalanced batch closure remain fail-closed until policy approval.

## Contract gaps from the 2026-09-28 audit

- Bank Transfer, Cheque and Other are missing from payment enum/requests. GCash proof/credit schema foundations are not enabled workflows.
- Subscriber update accepts status/day/notes/assignment fields, not identity/contact/address edits. Service/plan edit UI coverage remains incomplete.
- Generic service.manage status updates currently bypass the independent suspension/reconnection flow; see D-013.
- Invoice statuses are OPEN/PARTIALLY_PAID/PAID/VOID; required draft/credited and overdue semantics need mapping. Batch lifecycle labels also differ from the activity.
- Receivables lack the full collector/area/plan/type/age filter contract and required overdue-detail fields.
- Pagination currently nests items/page/pageSize/hasMore in data; proposed sibling meta is not implemented.
- Renderer query caching is not session-scoped and sign-out does not clear it. Packaged Origin: null fails CORS. See the [defect log](../defect-log.md).

