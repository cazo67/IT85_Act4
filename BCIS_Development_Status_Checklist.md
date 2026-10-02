# BCIS Subscription Billing and Collection System
## Development Status & Acceptance Checklist

> **Purpose:** Use this as a living checklist for a partially developed BCIS system.  
> It is intentionally broader than the minimum activity requirements so you can separate **required**, **important**, and **nice-to-have** work while still prioritizing a functional demo.

### Priority Legend

- **[MUST]** Required for the core activity / acceptance demo.
- **[IMPORTANT]** Strongly recommended for correctness, reliability, security, or professional quality.
- **[NICE]** Useful enhancement if time allows; should not delay core completion.
- **[PHONE/NICE]** Optional phone/mobile companion idea; the official target remains the Windows desktop system.

### Status Convention

Use these markers beside each item:

- `[ ]` Not yet verified / not started
- `[x]` Completed **and manually verified**
- Add `⚠️ PARTIAL` after an item if it exists but is incomplete.
- Add `🧪 NEEDS TEST` if implemented but not yet tested.
- Add a short evidence note when possible, e.g. `Evidence: tests/payment.spec.ts` or `Evidence: screenshot/demo`.

---

## Current audit snapshot — 2026-09-28

Requirements authority: [official laboratory activity](BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md). This is the canonical current checklist; dated results belong in the [progress record](BCIS_PROGRESS_AND_DOCUMENTATION.md), work ordering in the [completion plan](BCIS_COMPLETION_PLAN.md), and AT outcomes in the [acceptance matrix](tests/acceptance/AT-01-AT-12.md).

Statuses: **Verified**, **Implemented but unverified**, **Partial**, **Blocked by policy**, **Missing**. An unchecked detailed item can mean implemented but awaiting its required end-to-end proof; it does not necessarily mean no code exists. Preserve the MUST/IMPORTANT/NICE distinctions, but the official activity overrides older priorities below (for example, receipt printing and service control are required).

| Area | Status | Evidence / remaining boundary |
|---|---|---|
| API/PostgreSQL readiness | Verified | Both health endpoints returned 200; PostgreSQL 18/5433 and 13 applied migrations. |
| Automated/static checks | Verified | 48 API + 3 Electron configuration + 4 shared tests; workspace typechecks, Drizzle check, source-integrity and diff checks passed. Full build-producing gate was not rerun in the read-only audit. |
| Authentication/RBAC | Partial | Live API and denial tests exist; installed role matrix and session/cache isolation remain open. |
| Subscriber/plan/service management | Partial | Live creation/persistence exists; identity/contact/address editing and lifecycle UI incomplete. |
| Billing/Cash/ledger/reversal | Partial | Live slice recorded; current ledger/outstanding both 7,913,900 centavos and paid/active allocations both 50,000. Failure, retry and concurrency proof remains. |
| Sidebar/themes | Implemented but unverified | Expanded/collapsed/theme controls exist; full keyboard/layout suite missing. |
| Query/forms/tables | Partial | Dashboard/subscriber queries, subscriber Table and login/new-subscriber RHF exist; remaining modules need migration. |
| GCash/advance/void-adjustment | Blocked by policy | Gates remain; no enabled end-to-end workflow. |
| Bank Transfer/Cheque/Other | Missing | Required by the activity; enum/routes only recognize Cash/GCash. |
| Collections/AR/service control | Partial | Services/rules exist; no live batch/remittance/service-control scenarios or overdue accounts. |
| Reports/audit | Partial | Four PDF/XLSX families and audit viewer; full report catalogue/live acceptance incomplete. |
| Backup/restore | Partial | One verified backup; isolated restore and concurrent snapshot consistency unresolved. |
| Installer | Partial | NSIS artifact/checksum exist; clean installation and packaged connectivity not accepted. |
| PostgreSQL integration/Electron E2E | Missing | No dedicated bcis_test or Playwright Electron suite. |
| Three-PC/printing/submission | Missing | Required retained evidence and final artifacts incomplete. |

Current demo counts: 2 users, 51 subscribers, 61 services, 7 plans, 2 collectors, 3 areas, 1 billing month, 2 Cash payments and 1 reversal. Required recommended coverage still lacks five users, three months, mixed approved payments, ten overdue accounts and two service-control scenarios.

Open defects: packaged Origin: null receives 500; payment/batch retries regenerate keys; query cache survives sign-out; generic service status updates bypass the separate approval path; backup totals and archive need a consistent snapshot. See [defects D-010–D-015](docs/defect-log.md).

AT-08 shortage visibility and prevention of silent balanced closure can be tested before shortage settlement policy approval. Current schema labels must also be reconciled with the activity's invoice and batch lifecycle semantics.

---

# 0. Project Baseline & Architecture

- [x] **[MUST]** Electron desktop application launches successfully on Windows. Evidence: unpacked production executable remained active with four Electron processes during an eight-second API-unavailable smoke run; installed-login E2E remains separate.
- [x] **[MUST]** React + TypeScript strict mode is working without critical type errors. Evidence: 2026-09-27 static acceptance typecheck.
- [ ] **[MUST]** Fastify API starts successfully and is reachable from the Electron client. ⚠️ PARTIAL — API started and liveness returned HTTP 200; Electron-to-API connectivity was not tested.
- [x] **[MUST]** PostgreSQL database connection works reliably. Evidence: PostgreSQL 18 readiness remained healthy across migration, seed, API restart, and the live vertical slice.
- [x] **[MUST]** Drizzle ORM schema reflects the actual database structure. Evidence: migrations applied to the local clean `bcis` database and Drizzle consistency passed.
- [x] **[MUST]** Database migrations can create/update the schema from a clean database. Evidence: repeatable migration command applied migrations `0000`–`0012`.
- [x] **[MUST]** Zod validation is used for important API request/response payloads. Evidence: route schemas under `source/apps/api/src/modules/` and `source/apps/api/src/config/env.ts`.
- [ ] **[IMPORTANT]** React Hook Form is used consistently for major business forms. ⚠️ PARTIAL — used by login and new-subscriber forms; remaining business forms need migration.
- [ ] **[IMPORTANT]** TanStack Query is used for server-state fetching, invalidation, and refresh. ⚠️ PARTIAL — shared QueryClient and dashboard/subscriber queries exist; remaining migrations and session-safe caching are open.
- [ ] **[IMPORTANT]** TanStack Table is used for operational tables where sorting/filtering/pagination are needed. ⚠️ PARTIAL — installed and used by the subscriber list; broader operational sorting/filtering/pagination remains.
- [x] **[IMPORTANT]** Pino logging is configured for the API/server. Evidence: Fastify logger configuration and redaction in `source/apps/api/src/server.ts`.
- [x] **[IMPORTANT]** `.env` / configuration is separated from source code. Evidence: `.env.example`, Zod environment loader, and `.gitignore`.
- [x] **[IMPORTANT]** Development, test, and production/local-office configurations are distinguishable. Evidence: `NODE_ENV` schema and separate API/desktop environment examples.
- [x] **[IMPORTANT]** No database password, admin password, tokens, or secrets are hard-coded in the repository. Evidence: submission source-integrity check passed; runtime `.env` remains ignored.
- [ ] **[NICE]** Application displays build/version information in About/System Information.

---

# 1. Authentication & User Accounts

> **Audit status:** API auth/RBAC code and injection tests exist, but every user-facing checkbox below remains open until login/logout/session behavior is proven with PostgreSQL and the Electron client.

- [ ] **[MUST]** User can log in with valid credentials.
- [ ] **[MUST]** Invalid login is rejected with a clear message.
- [x] **[MUST]** Passwords are never stored as plain text. Evidence: Argon2 helpers in `source/apps/api/src/security/password.ts` and authentication tests.
- [ ] **[MUST]** Logged-in user identity is available to protected API actions.
- [ ] **[MUST]** User can log out correctly.
- [ ] **[MUST]** Protected screens cannot be opened after logout.
- [x] **[MUST]** Role-based permissions are enforced by the backend, not only by hiding UI buttons. Evidence: API authorization test and permission guards in route modules.
- [ ] **[IMPORTANT]** Disabled/inactive users cannot log in.
- [ ] **[IMPORTANT]** User account creation/editing is audited.
- [ ] **[IMPORTANT]** Password change/reset workflow exists for authorized office use.
- [ ] **[IMPORTANT]** Session expiration/re-authentication behavior is defined.
- [ ] **[NICE]** Show last login time.
- [ ] **[NICE]** Admin can view currently active sessions/workstations.

---

# 2. Roles & Permissions

> Replace or rename roles below based on the actual approved system.

- [x] **[MUST]** Administrator role is defined. Evidence: `ADMINISTRATOR` in shared RBAC contracts and security seed.
- [x] **[MUST]** Cashier/Collection role is defined. Evidence: `CASHIER` and `COLLECTION_SUPERVISOR` roles.
- [ ] **[MUST]** Billing/Office Staff role is defined if required. ⚠️ PARTIAL — billing permissions exist under owner/administrator roles, but no dedicated approved office-staff role is defined.
- [x] **[MUST]** Manager/Supervisor reporting access is defined if required. Evidence: `COLLECTION_SUPERVISOR`, `ACCOUNTING_AUDITOR`, and `VIEWER` roles.
- [ ] **[MUST]** Each major screen has a clear permission rule.
- [ ] **[MUST]** Create permission is tested per role.
- [ ] **[MUST]** Read/view permission is tested per role.
- [ ] **[MUST]** Update permission is tested per role.
- [ ] **[MUST]** Delete/cancel/void permission is tested per role.
- [ ] **[IMPORTANT]** Direct URL/route/API attempts cannot bypass role restrictions.
- [x] **[IMPORTANT]** Sensitive actions require stronger permission than ordinary viewing. Evidence: separate create, manage, reverse, reconcile, export, and restore permission codes.
- [ ] **[NICE]** Permission matrix can be viewed by the administrator.

---

# 3. Subscriber Management

> **Audit status:** Subscriber API routes/service, schema, search, validation rules, and desktop panel exist. Create/search/persistence and restart were exercised locally; editing/deactivation UI and full cross-client acceptance remain open.

## Core Subscriber Record

- [ ] **[MUST]** Create subscriber.
- [ ] **[MUST]** View subscriber list.
- [ ] **[MUST]** Search subscribers.
- [ ] **[MUST]** View subscriber details.
- [ ] **[MUST]** Edit subscriber details.
- [ ] **[MUST]** Deactivate subscriber without destroying financial history.
- [ ] **[MUST]** Subscriber has a unique identifier/account number.
- [ ] **[MUST]** Required personal/contact/service fields are validated.
- [ ] **[IMPORTANT]** Duplicate subscriber detection or warning exists.
- [ ] **[IMPORTANT]** Subscriber status is clear: Active / Inactive / Disconnected / other approved states.
- [ ] **[IMPORTANT]** Subscriber record shows current subscription and balance.
- [ ] **[IMPORTANT]** Subscriber record links to bills, payments, ledger, and audit history.
- [ ] **[NICE]** Advanced filters by barangay/address, plan, status, overdue state, etc.
- [ ] **[NICE]** Subscriber notes/history field for authorized staff.

## Subscriber CRUD Acceptance Flow

- [ ] **[MUST]** Create subscriber → appears in list.
- [ ] **[MUST]** Refresh/reopen → subscriber still exists.
- [ ] **[MUST]** Edit subscriber → updated values appear.
- [ ] **[MUST]** Another office PC can see the update after refresh/query invalidation.
- [ ] **[MUST]** Deactivate subscriber → status is reflected everywhere appropriate.
- [ ] **[MUST]** Historical financial records remain intact after deactivation.

---

# 4. Plans & Subscription Management

> **Audit status:** Internet, Cable, and Combo plan/service structures, seeds, API routes, and desktop controls exist. Live plan lifecycle, effective-date, history, and audit behavior remain unaccepted.

- [ ] **[MUST]** Internet subscription type supported.
- [ ] **[MUST]** Cable subscription type supported.
- [ ] **[MUST]** Combo subscription type supported.
- [ ] **[MUST]** Plans contain correct recurring monthly price.
- [ ] **[MUST]** Subscriber can be assigned to an appropriate plan.
- [ ] **[MUST]** Subscription activation date is stored.
- [ ] **[MUST]** Subscription status is tracked.
- [ ] **[MUST]** Changing a plan follows a defined effective-date rule.
- [ ] **[IMPORTANT]** Historical bills do not silently change when plan price changes later.
- [ ] **[IMPORTANT]** Plan price changes are audited.
- [ ] **[IMPORTANT]** Subscription cancellation/disconnection has a defined financial effect.
- [ ] **[NICE]** Reconnection workflow.
- [ ] **[NICE]** Temporary suspension workflow if allowed by BCIS policy.
- [ ] **[NICE]** Plan catalog management with archive rather than destructive deletion.

---

# 5. Monthly Billing

> **Audit status:** Preview/finalize UI and API, transaction-scoped service logic, uniqueness controls, and unit rules exist. Local finalization and ledger reconciliation were exercised; failure, concurrent requests and desktop retry acceptance remain open.

- [ ] **[MUST]** System can generate monthly bills for active subscribers.
- [ ] **[MUST]** Correct billing month/period is stored.
- [ ] **[MUST]** Due date is stored.
- [ ] **[MUST]** Bill amount comes from the correct subscription/plan rule.
- [ ] **[MUST]** Duplicate bill generation for the same subscriber and billing period is prevented.
- [ ] **[MUST]** Bill status is clear: Unpaid / Partial / Paid / Overdue / Void or approved equivalents.
- [ ] **[MUST]** Previous unpaid amount is handled according to the approved financial rule.
- [ ] **[MUST]** Monthly generation works for Internet, Cable, and Combo subscribers.
- [ ] **[IMPORTANT]** Billing generation is transactional: partial failures do not leave inconsistent bills.
- [ ] **[IMPORTANT]** Billing run records who generated it and when.
- [ ] **[IMPORTANT]** Preview/count is available before a bulk billing run.
- [ ] **[IMPORTANT]** Re-running a billing process is idempotent or safely prevented.
- [ ] **[NICE]** Billing batch summary: eligible, generated, skipped, failed.
- [ ] **[NICE]** Printable billing statement.

---

# 6. Payments / Collection

> **Audit status:** Cash allocation, receipts, reversal, and collection-batch code exists with unit evidence. Cash posting/reversal have local PostgreSQL evidence; GCash/advance remain gated and installed Electron acceptance is incomplete.

## Payment Entry

- [ ] **[MUST]** Record Cash payment.
- [ ] **[MUST]** Record GCash payment.
- [ ] **[MUST]** Payment is linked to the correct subscriber.
- [ ] **[MUST]** Payment date/time is stored.
- [ ] **[MUST]** Receiving user/collector is stored.
- [ ] **[MUST]** Amount must be valid and positive.
- [ ] **[MUST]** Payment updates outstanding balance correctly.
- [ ] **[MUST]** Partial payments work correctly.
- [ ] **[MUST]** Full payment works correctly.
- [ ] **[MUST]** Overpayment behavior is explicitly defined and tested.
- [ ] **[MUST]** Double-click/repeated submission cannot create duplicate payment accidentally.
- [ ] **[IMPORTANT]** GCash reference number can be recorded if required.
- [ ] **[IMPORTANT]** Cash/GCash totals are distinguishable in reports.
- [ ] **[IMPORTANT]** Payment receipt/reference number is unique.
- [ ] **[IMPORTANT]** Payment cannot be silently edited after posting.
- [ ] **[IMPORTANT]** Correction uses approved void/reversal workflow with audit trail.
- [ ] **[NICE]** Printable payment receipt.
- [ ] **[NICE]** Reprint receipt with “Reprint” indication.
- [ ] **[NICE]** Quick subscriber lookup during collection.

## Payment End-to-End Acceptance

- [ ] **[MUST]** Create bill → balance increases correctly.
- [ ] **[MUST]** Record partial payment → balance decreases correctly.
- [ ] **[MUST]** Subscriber ledger records the payment.
- [ ] **[MUST]** Collection report includes the payment.
- [ ] **[MUST]** Collector accountability includes the payment.
- [ ] **[MUST]** Audit trail includes the payment action.
- [ ] **[MUST]** Refresh/restart → payment remains.
- [ ] **[MUST]** Second office PC sees the updated balance.
- [ ] **[MUST]** Final payment → bill/balance becomes Paid/zero as defined.

---

# 7. Subscriber Ledger

> **Audit status:** Ledger schema, billing debit/payment credit writes, reversal design, and statement/report logic exist. Current invoice outstanding and ledger net reconcile at 7,913,900 centavos; historical and end-to-end acceptance remain open.

- [ ] **[MUST]** Every bill creates the proper debit/charge effect.
- [ ] **[MUST]** Every payment creates the proper credit/payment effect.
- [ ] **[MUST]** Ledger shows chronological transaction history.
- [ ] **[MUST]** Running balance is correct.
- [ ] **[MUST]** Ledger total agrees with current subscriber balance.
- [ ] **[MUST]** Voids/reversals appear transparently rather than disappearing silently.
- [ ] **[IMPORTANT]** Ledger entries are immutable or strongly protected from casual editing.
- [ ] **[IMPORTANT]** Ledger can be filtered by date/billing period.
- [ ] **[IMPORTANT]** Ledger can be exported/printed.
- [ ] **[IMPORTANT]** Ledger calculations have automated tests.
- [ ] **[NICE]** Opening balance migration/import support for existing BCIS subscribers.

---

# 8. Overdue Receivables / Aging

> **Audit status:** Receivable queries, aging rules, UI, report export, and controlled service actions exist. Live as-of-date reconciliation and policy approval remain open.

- [ ] **[MUST]** Unpaid bill becomes overdue according to due-date rules.
- [ ] **[MUST]** Partially paid overdue bill displays remaining overdue amount.
- [ ] **[MUST]** Overdue subscriber list is available.
- [ ] **[MUST]** Total outstanding receivables can be viewed.
- [ ] **[IMPORTANT]** Aging buckets are available if required, e.g. Current / 1–30 / 31–60 / 61–90 / 90+ days.
- [ ] **[IMPORTANT]** Aging is calculated from correct dates.
- [ ] **[IMPORTANT]** Paid/voided items no longer incorrectly appear as overdue.
- [ ] **[NICE]** Overdue filters by plan, area, collector, or date range.
- [ ] **[NICE]** Printable/exportable aging report.

---

# 9. Collector Accountability

> **Audit status:** Collector setup, route snapshots, collection batches, remittance, difference calculation, and balanced reconciliation exist. Live totals and shortage/overage settlement remain open.

- [ ] **[MUST]** Every collection is attributable to a user/collector.
- [ ] **[MUST]** Collector collection totals can be viewed by date/shift.
- [ ] **[MUST]** Cash and GCash totals are separated.
- [ ] **[MUST]** Individual payment list can support the collector total.
- [ ] **[IMPORTANT]** Turnover/remittance process is defined.
- [ ] **[IMPORTANT]** Expected amount versus remitted amount can be compared if required.
- [ ] **[IMPORTANT]** Variance/shortage/overage is recorded with authorization.
- [ ] **[IMPORTANT]** Closed turnover cannot be silently modified.
- [ ] **[NICE]** Collector daily summary printable/exportable.
- [ ] **[NICE]** Supervisor approval for discrepancy resolution.

---

# 10. Reports

> **Audit status:** Four PDF/XLSX families are implemented and sanitized sample files exist: AR aging, monthly collections, collector reconciliation, and subscriber SOA. The complete required report list, live totals, and installed printing are not accepted.

## Minimum Operational Reports

- [ ] **[MUST]** Daily collection report.
- [ ] **[MUST]** Collection by Cash vs GCash.
- [ ] **[MUST]** Subscriber balance/outstanding report.
- [ ] **[MUST]** Overdue receivables report.
- [ ] **[MUST]** Subscriber ledger report.
- [ ] **[MUST]** Collector collection/accountability report.
- [ ] **[IMPORTANT]** Active subscriber report.
- [ ] **[IMPORTANT]** Subscribers by Internet/Cable/Combo.
- [ ] **[IMPORTANT]** Billing summary by period.
- [ ] **[IMPORTANT]** Payment history by date range.
- [ ] **[IMPORTANT]** Voided/reversed transaction report.
- [ ] **[IMPORTANT]** Audit activity report.

## Export & Accuracy

- [ ] **[MUST]** Required reports can export to XLSX using ExcelJS.
- [ ] **[MUST]** Required reports can export/print to PDF using pdfmake.
- [ ] **[MUST]** Report totals match underlying database transactions.
- [ ] **[IMPORTANT]** Date range and filters are printed/exported with the report.
- [ ] **[IMPORTANT]** Generated report includes generation date/time.
- [ ] **[IMPORTANT]** Currency formatting is consistent.
- [ ] **[NICE]** Company header/logo and professional report layout.
- [ ] **[NICE]** CSV export for raw data.

---

# 11. Audit Trail

> **Audit status:** Append-only audit schema, write calls, filtered viewer, and `audit.view` permission exist. Live coverage of every required action and retention/export behavior remains open.

- [ ] **[MUST]** Login/logout events are logged where appropriate.
- [ ] **[MUST]** Subscriber creation/update/deactivation is audited.
- [ ] **[MUST]** Plan/subscription changes are audited.
- [ ] **[MUST]** Billing runs are audited.
- [ ] **[MUST]** Payments are audited.
- [ ] **[MUST]** Voids/reversals are audited.
- [ ] **[MUST]** User/permission changes are audited.
- [ ] **[MUST]** Backup/restore actions are audited.
- [ ] **[IMPORTANT]** Audit entry stores actor, action, timestamp, entity/record, and useful before/after information.
- [ ] **[IMPORTANT]** Ordinary users cannot modify/delete audit records.
- [ ] **[IMPORTANT]** Audit trail can be searched/filter by date/user/action.
- [ ] **[NICE]** Exportable audit report.

---

# 12. Backup & Restore

> **Audit status:** PostgreSQL 18 tools and the application database are live. A real custom-format backup passed SHA-256, manifest-snapshot, size, and `pg_restore --list` verification on 2026-09-28. An isolated restore is still required.

- [x] **[MUST]** Authorized user can create a database backup. Evidence: authenticated live backup `c1561e72-dabe-4f65-88d0-abbaf626905d`.
- [x] **[MUST]** Backup location and filename are clear. Evidence: configured `BCIS_BACKUP_ROOT` with per-backup directory, `database.dump`, and `manifest.json`.
- [x] **[MUST]** Backup process reports success/failure honestly. Evidence: live status moved from `CREATED` to `VERIFIED`; failures remain recorded by the service.
- [ ] **[MUST]** Restore process is implemented.
- [ ] **[MUST]** Restore is restricted to authorized users.
- [ ] **[MUST]** A real restore test has been performed using test data.
- [ ] **[IMPORTANT]** Application warns before destructive restore.
- [ ] **[IMPORTANT]** Current database can be backed up before restore.
- [x] **[IMPORTANT]** Backup integrity/failure is detectable. Evidence: SHA-256, byte size, financial snapshot, manifest identity, and PostgreSQL catalog validation passed.
- [ ] **[IMPORTANT]** Recommended office backup procedure is documented.
- [ ] **[NICE]** Scheduled daily backup.
- [ ] **[NICE]** Multiple rotating backups instead of one overwritten file.
- [ ] **[NICE]** Copy backup to a second physical device/location.

---

# 13. Three-PC LAN Operation

> **Audit status:** The central-API topology and LAN configuration are documented, but no physical multi-PC, firewall, reconnect, failure, or concurrency evidence exists.

- [ ] **[MUST]** Central Fastify API is reachable by all three office PCs over LAN.
- [ ] **[MUST]** All PCs use the same PostgreSQL data source.
- [ ] **[MUST]** PC 1 can create data and PC 2/3 can retrieve it.
- [ ] **[MUST]** PC 2 can update data and PC 1/3 can retrieve the update.
- [ ] **[MUST]** Simultaneous collection attempts are safely handled.
- [ ] **[MUST]** Duplicate or conflicting transactions are prevented by backend/database rules where necessary.
- [ ] **[MUST]** App handles temporary API/server unavailability without pretending a transaction succeeded.
- [ ] **[IMPORTANT]** LAN server IP/hostname configuration is documented.
- [ ] **[IMPORTANT]** Database is not unnecessarily exposed directly to all desktop clients.
- [ ] **[IMPORTANT]** PostgreSQL transactions/constraints protect financial consistency.
- [ ] **[IMPORTANT]** TanStack Query refresh/invalidation makes cross-PC changes visible after appropriate refresh/refetch.
- [ ] **[IMPORTANT]** Network failure during payment does not create an unknown/duplicate state.
- [ ] **[NICE]** Connection/server health indicator in the desktop app.
- [ ] **[NICE]** Friendly offline/server-unavailable screen with retry action.

---

# 14. Financial Correctness & Business Rules

> These rules deserve automated tests. Do not rely only on manual clicking.

- [x] **[MUST]** Monthly fee calculation tested. Evidence: `source/apps/api/test/billing-rules.test.ts`.
- [x] **[MUST]** Previous balance handling tested. Evidence: oldest-first allocation and statement reconciliation unit tests.
- [x] **[MUST]** Partial payment calculation tested. Evidence: `source/apps/api/test/payment-rules.test.ts`.
- [x] **[MUST]** Full payment calculation tested. Evidence: exact multi-invoice payment unit test.
- [x] **[MUST]** Overpayment rule tested. Evidence: overpayment is detected and fails closed; final business policy remains blocked.
- [ ] **[MUST]** Duplicate payment prevention tested.
- [ ] **[MUST]** Duplicate monthly billing prevention tested.
- [ ] **[MUST]** Void/reversal accounting tested.
- [ ] **[MUST]** Ledger running balance tested.
- [x] **[MUST]** Receivable/overdue calculation tested. Evidence: `source/apps/api/test/receivable-rules.test.ts`.
- [ ] **[MUST]** Collector total tested.
- [ ] **[MUST]** Cash vs GCash totals tested.
- [ ] **[MUST]** Report grand totals tested against source transactions.
- [x] **[IMPORTANT]** Money values use an appropriate exact numeric/decimal strategy; avoid unsafe floating-point financial calculations. Evidence: `bigint` centavos and shared money tests.
- [x] **[IMPORTANT]** Server/database, not the client UI alone, enforces critical financial rules. Evidence: API domain services, permission guards, and schema constraints.
- [x] **[IMPORTANT]** Important multi-record financial operations run inside database transactions. Evidence: billing, payment, collection, security, and restore services.
- [x] **[IMPORTANT]** Financial records are not hard-deleted casually. Evidence: append-only/compensating design in schema and `docs/architecture/financial-invariants.md`.

---

# 15. Validation & Error Handling

> **Audit status:** Zod route validation, a shared API error handler, database/service errors, and renderer error states exist. Full form-by-form validation and recoverability need Electron E2E testing.

- [ ] **[MUST]** Required fields are validated.
- [ ] **[MUST]** Invalid numbers/amounts are rejected.
- [ ] **[MUST]** Invalid dates are rejected.
- [ ] **[MUST]** Invalid enum/status/payment method is rejected by API.
- [ ] **[MUST]** User receives understandable error messages.
- [ ] **[MUST]** API errors do not crash the Electron UI.
- [ ] **[IMPORTANT]** Backend returns consistent error structures.
- [ ] **[IMPORTANT]** Duplicate database constraints produce useful messages.
- [ ] **[IMPORTANT]** Save buttons prevent accidental repeated submissions.
- [ ] **[IMPORTANT]** Forms preserve useful input after recoverable errors.
- [ ] **[NICE]** Unsaved-change warning on important forms.

---

# 16. UI/UX for Office Use

> **Audit status:** Core navigation, user/role display, tables, status styling, loading/error/empty states, and dashboard metrics exist in source. No browser/Electron visual, keyboard, accessibility, or real-data acceptance was performed.

- [ ] **[MUST]** Main navigation clearly exposes core modules.
- [ ] **[MUST]** Current user/role is visible.
- [ ] **[MUST]** Important financial statuses are easy to distinguish.
- [ ] **[MUST]** Tables remain readable with real operational data.
- [ ] **[MUST]** Search/filter is available for subscriber-heavy screens.
- [ ] **[MUST]** Confirmation is required for destructive/high-risk actions.
- [ ] **[IMPORTANT]** Loading state is shown during network requests.
- [ ] **[IMPORTANT]** Success feedback is shown only after confirmed server success.
- [ ] **[IMPORTANT]** Error state includes a clear recovery action when possible.
- [ ] **[IMPORTANT]** Keyboard navigation/tab order works for common office workflows.
- [ ] **[IMPORTANT]** Amounts, dates, and identifiers use consistent formatting.
- [ ] **[IMPORTANT]** Empty states explain what to do next.
- [ ] **[NICE]** Dashboard shows useful daily metrics without becoming cluttered.
- [ ] **[NICE]** Quick actions for Add Subscriber / Record Payment / View Overdue.
- [ ] **[NICE]** Remember useful table filters during a session.

---

# 17. Security & Data Protection

- [x] **[MUST]** Passwords are hashed securely. Evidence: Argon2 implementation and authentication tests.
- [x] **[MUST]** Authentication is required for protected API routes. Evidence: route authorization helpers and API tests.
- [x] **[MUST]** Authorization is checked server-side. Evidence: cashier denial and owner authorization API tests.
- [x] **[MUST]** SQL/database access uses safe parameterized ORM queries. Evidence: Drizzle query builders across API services.
- [x] **[IMPORTANT]** Sensitive configuration is excluded from Git. Evidence: `.gitignore` and passed submission-integrity check.
- [ ] **[IMPORTANT]** Least-privilege database account is used for the application.
- [ ] **[IMPORTANT]** Audit logs protect accountability.
- [ ] **[IMPORTANT]** Exported reports do not expose unnecessary sensitive information.
- [ ] **[IMPORTANT]** Backup files are treated as sensitive company data.
- [x] **[IMPORTANT]** Electron preload/IPC boundaries follow safe practices; avoid exposing unrestricted Node.js capabilities to renderer code. Evidence: Electron window-security tests for sandboxing, context isolation, Node integration, CSP, and navigation.
- [ ] **[NICE]** Automatic lock after extended inactivity.
- [ ] **[NICE]** Optional local office TLS/HTTPS if deployment conditions justify it.

---

# 18. Testing

## Vitest / Unit & Domain Tests

- [x] **[MUST]** Financial rule tests exist. Evidence: billing, payments, collections, receivables, reports, and backup rule suites.
- [x] **[MUST]** Validation/business-rule tests exist for critical cases. Evidence: 46 API tests and 4 shared contract tests passed.
- [x] **[IMPORTANT]** Tests run with one command. Evidence: `tests/Run-StaticAcceptance.ps1` passed on 2026-09-27.
- [x] **[IMPORTANT]** Tests are deterministic and do not depend on production data. Evidence: in-memory auth store and synthetic fixtures; no live/production database used.

## API Integration Tests

- [x] **[MUST]** Authentication API tested. Evidence: Fastify injection tests cover login failure, session lock/unlock, forced password change, and authorization.
- [ ] **[MUST]** Subscriber CRUD API tested.
- [ ] **[MUST]** Subscription/plan API tested.
- [ ] **[MUST]** Billing API tested.
- [ ] **[MUST]** Payment API tested.
- [ ] **[MUST]** Ledger effects tested after billing/payment.
- [x] **[MUST]** Permission failures tested. Evidence: cashier denial plus invoice-void authorization-order policy test.
- [ ] **[IMPORTANT]** Transaction rollback/error scenarios tested.

## Playwright Electron E2E

> **Audit status:** ⚪ **NOT STARTED** — no Playwright dependency, configuration, or Electron E2E test suite was found.

- [ ] **[MUST]** Login → dashboard workflow passes.
- [ ] **[MUST]** Create subscriber → refresh → record persists.
- [ ] **[MUST]** Edit subscriber → new value persists.
- [ ] **[MUST]** Assign subscription/plan.
- [ ] **[MUST]** Generate bill.
- [ ] **[MUST]** Record partial payment.
- [ ] **[MUST]** Ledger reflects partial payment.
- [ ] **[MUST]** Record final payment.
- [ ] **[MUST]** Balance becomes correct.
- [ ] **[MUST]** Report reflects transaction.
- [ ] **[MUST]** Wrong role is prevented from restricted action.
- [ ] **[MUST]** Cross-role/cross-PC data reflection is tested.
- [ ] **[IMPORTANT]** Screenshot on failure enabled.
- [ ] **[IMPORTANT]** Playwright trace on failure enabled.
- [ ] **[IMPORTANT]** Console errors/failed network calls captured where useful.

---

# 19. Critical End-to-End Acceptance Scenarios

> **Audit status:** None of Scenarios A–F has retained end-to-end evidence. Keep every item unchecked until run with synthetic data in the required live environment.

## Scenario A — New Internet Subscriber

- [ ] Create new subscriber.
- [ ] Assign Internet plan.
- [ ] Generate monthly bill.
- [ ] Confirm balance.
- [ ] Record partial Cash payment.
- [ ] Confirm reduced balance.
- [ ] Confirm ledger entries.
- [ ] Confirm daily Cash collection.
- [ ] Confirm audit trail.
- [ ] Open from second PC and verify same state.
- [ ] Record remaining payment.
- [ ] Verify Paid/zero balance.

## Scenario B — GCash Collection

- [ ] Open existing unpaid subscriber.
- [ ] Record GCash payment.
- [ ] Store/reference GCash details if required.
- [ ] Confirm subscriber balance.
- [ ] Confirm GCash collection total.
- [ ] Confirm collector total.
- [ ] Confirm ledger.
- [ ] Confirm audit trail.
- [ ] Refresh/restart and verify persistence.

## Scenario C — Overdue Account

- [ ] Generate bill with due date.
- [ ] Leave unpaid past due date/test date.
- [ ] Verify overdue status.
- [ ] Verify overdue report.
- [ ] Make partial payment.
- [ ] Verify remaining overdue amount.
- [ ] Complete payment.
- [ ] Verify account is removed from inappropriate overdue results.

## Scenario D — Financial Correction

- [ ] Record test payment.
- [ ] Attempt unauthorized edit/delete → rejected.
- [ ] Authorized void/reversal is performed.
- [ ] Ledger shows reversal correctly.
- [ ] Balance is restored correctly.
- [ ] Reports are corrected appropriately.
- [ ] Audit trail shows original action and correction.

## Scenario E — Concurrent Office Use

- [ ] PC 1 logs in.
- [ ] PC 2 logs in.
- [ ] PC 3 logs in.
- [ ] PC 1 creates/updates subscriber.
- [ ] PC 2 retrieves latest subscriber state.
- [ ] PC 2 records a payment.
- [ ] PC 3 views updated collection/report.
- [ ] Test simultaneous operations on the same account.
- [ ] Verify no duplicate/corrupted financial result.

## Scenario F — Backup & Restore

- [ ] Create known test subscriber/transaction.
- [ ] Create backup.
- [ ] Make a controlled later change.
- [ ] Restore backup in test environment.
- [ ] Verify expected data state after restore.
- [ ] Verify backup/restore audit entries.

---

# 20. Data Integrity / Database Constraints

- [x] **[MUST]** Primary keys exist. Evidence: Drizzle schemas and migrations `0000`–`0012`.
- [x] **[MUST]** Foreign keys protect relationships. Evidence: Drizzle schemas and generated SQL migrations.
- [x] **[MUST]** Required columns use appropriate NOT NULL constraints. Evidence: Drizzle consistency check passed.
- [x] **[MUST]** Unique account/receipt/reference identifiers have database protection where appropriate. Evidence: unique indexes in subscriber, billing, and payment schemas.
- [x] **[MUST]** Duplicate monthly bill has database/business protection. Evidence: finalized service/cycle uniqueness and command-key/idempotency design; live concurrency test still required.
- [x] **[IMPORTANT]** Valid status/payment type constraints are enforced. Evidence: PostgreSQL enums, Zod schemas, and service transition rules.
- [x] **[IMPORTANT]** Useful indexes exist for subscriber search, bill lookup, payment date, overdue/report queries. Evidence: indexes declared across schema modules.
- [x] **[IMPORTANT]** Delete behavior (restrict/cascade/soft delete) is intentionally designed. Evidence: `docs/erd.md` and lifecycle/status-based services.
- [x] **[IMPORTANT]** Financial tables preserve referential history. Evidence: immutable ledger/reversal model and foreign-key design.
- [x] **[NICE]** Seed script exists for demo/test data. Evidence: `database/seeds/01-security.ts` and `database/seeds/02-master-data.ts`; live execution remains unverified.

---

# 21. Installation & Deployment

> **Audit status:** An NSIS artifact and matching checksum exist; clean-PC installation and three-client acceptance remain open, and packaged-origin CORS currently fails.

- [ ] **[MUST]** Electron Builder produces a Windows installer.
- [ ] **[MUST]** App installs and launches on a clean office/test PC.
- [x] **[MUST]** API/server deployment procedure is documented. Evidence: `docs/deployment/windows-lan.md` and `deployment/windows/Start-BcisApi.ps1`.
- [ ] **[MUST]** PostgreSQL setup procedure is documented. ⚠️ PARTIAL — high-level steps exist, but the prerequisite script is fixed to PostgreSQL 16 paths and the current PostgreSQL 18 application connection fails readiness.
- [ ] **[MUST]** Three clients can point to the central LAN API.
- [x] **[IMPORTANT]** Windows firewall/LAN port requirements are documented. Evidence: `docs/deployment/windows-lan.md`.
- [x] **[IMPORTANT]** Server startup/restart procedure is documented. Evidence: LAN deployment guide and API start script.
- [x] **[IMPORTANT]** Database backup location is documented. Evidence: `BCIS_BACKUP_ROOT` environment setting and LAN recovery guide.
- [ ] **[IMPORTANT]** Installer/update process preserves server data.
- [ ] **[NICE]** Desktop shortcut and professional app icon.
- [ ] **[NICE]** Update/version strategy documented.

---

# 22. Technical Documentation

- [x] **[MUST]** Project overview. Evidence: `README.md` and `docs/technical-overview.md`.
- [ ] **[MUST]** System objectives.
- [x] **[MUST]** Architecture diagram. Evidence: topology diagram in `docs/technical-overview.md`.
- [x] **[MUST]** Tech stack explanation. Evidence: README and technical overview.
- [x] **[MUST]** Database ERD/schema. Evidence: `docs/erd.md`, Drizzle schemas, and 12 migrations.
- [x] **[MUST]** Roles and permission matrix. Evidence: shared RBAC contracts and `database/seeds/01-security.ts`; final instructor approval remains open.
- [x] **[MUST]** Major business rules. Evidence: `docs/architecture/financial-invariants.md` and phase verification records.
- [x] **[MUST]** Installation/setup guide. Evidence: README and Windows LAN deployment guide; clean-install proof remains open.
- [x] **[MUST]** User guide for major workflows. Evidence: `docs/user-manual.md`.
- [x] **[MUST]** Backup/restore guide. Evidence: Windows LAN deployment guide; real restore acceptance remains open.
- [x] **[MUST]** Test plan and test evidence. Evidence: `tests/README.md`, `tests/acceptance/AT-01-AT-12.md`, and phase verification records.
- [ ] **[IMPORTANT]** API endpoint summary.
- [x] **[IMPORTANT]** Known limitations. Evidence: user manual, defect log, release notes, and acceptance matrix.
- [x] **[IMPORTANT]** Troubleshooting guide. Evidence: user manual common-problems section and deployment guide.
- [x] **[IMPORTANT]** LAN configuration guide. Evidence: `docs/deployment/windows-lan.md`.
- [x] **[NICE]** Developer onboarding README. Evidence: root `README.md`, documentation guide, and test guide.

---

# 23. Presentation / Demo Readiness

> **Audit status:** A demo checklist and synthetic seed definitions exist, but the database is ready, but demo financial scenarios, screenshot/fallback sets and complete rehearsal evidence remain incomplete.

- [ ] **[MUST]** Demo database contains realistic but non-sensitive sample data.
- [ ] **[MUST]** All three user/role accounts are prepared.
- [ ] **[MUST]** Demo starts from a known clean state.
- [ ] **[MUST]** Demonstrate subscriber registration.
- [ ] **[MUST]** Demonstrate subscription assignment.
- [ ] **[MUST]** Demonstrate monthly bill.
- [ ] **[MUST]** Demonstrate Cash payment.
- [ ] **[MUST]** Demonstrate GCash payment.
- [ ] **[MUST]** Demonstrate ledger.
- [ ] **[MUST]** Demonstrate overdue account/report.
- [ ] **[MUST]** Demonstrate collector accountability.
- [ ] **[MUST]** Demonstrate report export.
- [ ] **[MUST]** Demonstrate audit trail.
- [ ] **[MUST]** Demonstrate backup/restore or provide verified evidence.
- [ ] **[MUST]** Demonstrate multi-PC/shared-data behavior.
- [ ] **[IMPORTANT]** Keep a fallback demo account/data set.
- [ ] **[IMPORTANT]** Prepare screenshots/test evidence if LAN setup fails during presentation.
- [ ] **[IMPORTANT]** Prepare a 5–10 minute concise demo route.

---

# 24. Professional Enhancements — Only After Core Acceptance Works

> **Audit status:** Some dashboard/report conveniences already exist, but enhancements remain secondary to database, E2E, backup/restore, installer, and LAN acceptance.

- [ ] **[NICE]** Dashboard KPIs: today's collection, unpaid total, overdue total, active subscribers.
- [ ] **[NICE]** Recent payments/activity panel.
- [ ] **[NICE]** Global subscriber search.
- [ ] **[NICE]** Saved report filters.
- [ ] **[NICE]** Print-friendly receipts/statements.
- [ ] **[NICE]** Import subscribers from a controlled CSV/XLSX template.
- [ ] **[NICE]** Data export for migration/archival.
- [ ] **[NICE]** Notification center for failed backups or server issues.
- [ ] **[NICE]** Configurable company name/address/contact shown on reports.
- [ ] **[NICE]** Configurable billing due-day/business settings, with audit trail.
- [ ] **[NICE]** Dark/light theme only if it does not consume core-development time.

---

# 25. Optional Phone / Mobile Companion

> **Audit status:** ⚪ **NOT STARTED** — no phone/mobile companion was found, which is appropriate while core desktop acceptance remains open.

> **Do not replace the required Windows desktop application with this.**  
> Add only if the core LAN desktop workflow is stable.

- [ ] **[PHONE/NICE]** Mobile-friendly read-only dashboard reachable on the office LAN.
- [ ] **[PHONE/NICE]** Mobile subscriber lookup for authorized collectors/staff.
- [ ] **[PHONE/NICE]** View subscriber current balance and recent ledger.
- [ ] **[PHONE/NICE]** Collector can view assigned/expected collections.
- [ ] **[PHONE/NICE]** Responsive overdue-account list.
- [ ] **[PHONE/NICE]** Mobile collection entry only if authentication, authorization, duplicate prevention, and LAN security are properly implemented.
- [ ] **[PHONE/NICE]** QR/barcode lookup for subscriber account number.
- [ ] **[PHONE/NICE]** Do **not** expose PostgreSQL directly to phones; mobile client must use the Fastify API.
- [ ] **[PHONE/NICE]** Do **not** make the mobile feature dependent on public internet unless the project scope explicitly requires it.

---

# 26. "Do Not Consider Complete Until..." Gate

A module should not be marked **COMPLETE** only because its UI exists.

For each major feature, verify this chain:

- [ ] UI exists.
- [ ] Form/input validation works.
- [ ] API endpoint works.
- [ ] Permission is enforced.
- [ ] Database write/read is correct.
- [ ] Refresh/restart preserves the result.
- [ ] Related ledger/report/audit effects are correct.
- [ ] Another appropriate role/PC sees the correct result.
- [ ] Error/invalid case is handled.
- [ ] Automated or documented test evidence exists.

---

# 27. Current Project Health Summary

Use the current audit snapshot at the top of this document. Do not maintain a second competing status table.

# 28. Recommended Completion Order

Follow the gates in [BCIS_COMPLETION_PLAN.md](BCIS_COMPLETION_PLAN.md): reliability defects, Cash/database integration, incremental operational UI, approved financial policies, recovery/E2E, installer/LAN, then final evidence and submission. Optional mobile/cloud work remains deferred.

---

## Final Acceptance Question

Before calling the project complete, you should be able to answer **YES** to this:

> **Can an authorized employee on PC 1 register a subscriber, assign a plan, generate a bill, receive a Cash/GCash payment, and have the correct balance, ledger, collector total, report, and audit trail persist in PostgreSQL and become correctly visible to the authorized users on PCs 2 and 3 — even after refresh/restart — without allowing unauthorized roles to alter financial data?**

If the answer is **YES and supported by test evidence**, the core system is in strong shape.
