# BCIS Subscription Billing and Collection System

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.
## Frontend-First Remaining Implementation Plan

> **Execution update — 2026-09-28:** This frontend-first ordering is superseded by the approved integration-first plan. PostgreSQL readiness and the core Cash vertical slice were completed before broad frontend refactoring. Use `BCIS_PROGRESS_AND_DOCUMENTATION.md` and `docs/architecture/integration-contract-map.md` as the current execution record. Policy-dependent features remain blocked.

> **Project:** BCIS Subscription Billing and Collection System  
> **Target:** Professional Windows desktop application for three simultaneous office PCs over LAN  
> **Architecture:** Electron Desktop Clients → Fastify API → Drizzle ORM → PostgreSQL  
> **Strategy:** Complete frontend workflows first while preserving the existing backend/domain architecture, then integrate and verify PostgreSQL, then run automated and physical acceptance testing.  
> **Important:** This is **not** a frontend-only project. The current repository already contains substantial backend/domain work. The frontend-first phase is for completing the user-facing workflow before full live integration and acceptance.

---

# 1. Core Goal

The final BCIS system must support this complete business flow:

```text
Subscriber
→ Service Account
→ Monthly Billing
→ Invoice
→ Payment
→ Payment Allocation
→ Receipt
→ Subscriber Ledger
→ Receivables / Aging
→ Collector Accountability
→ Reports
→ Audit
→ Backup / Restore
```

The system must also support:

- Internet, Cable, and Combo services
- multiple service accounts per subscriber
- Cash, GCash, Bank Transfer, Cheque, and Other payment methods
- exact, partial, and advance payments
- oldest-unpaid-invoice-first allocation
- payment reversal instead of destructive deletion
- GCash proof verification
- house-to-house collection batches
- remittance and reconciliation
- shortage/overage handling
- overdue monitoring and AR aging
- suspension and reconnection
- PDF/XLSX reports
- role-based access control
- audit trail
- backup/restore
- three concurrent office PCs

---

# 2. Development Principle

Do **not** build by page count.

Build around **complete business workflows** and the required acceptance tests.

A feature is not considered complete because:

- a page exists
- a button exists
- an API returns 200
- a database row exists

A core feature becomes complete only when:

```text
UI
→ Validation
→ API
→ Authorization
→ Database
→ Financial / Domain Rules
→ Persistence
→ Related Ledger / Report / Audit Effects
→ Refresh / Restart
→ Cross-role / Cross-PC Reflection
→ Test Evidence
```

---

# 3. Current Development Position

Based on the existing project audit:

| Area | Current Position | Main Remaining Concern |
|---|---|---|
| Electron shell | Needs test | Build passes, but installed/live acceptance is not yet proven |
| Authentication | Needs test | API auth exists; live PostgreSQL + desktop session needs proof |
| Roles / permissions | Partial | Strong RBAC foundation; full role matrix not yet accepted |
| Subscriber CRUD | Needs test | UI/API exist; live persistence and cross-PC proof pending |
| Plans / service accounts | Needs test | Structures exist; live lifecycle proof pending |
| Billing | Needs test | Domain logic exists; PostgreSQL finalization/concurrency pending |
| Payments | Partial | Cash logic exists; GCash/advance policy workflows incomplete |
| Ledger | Needs test | Logic exists; live reconciliation pending |
| Receivables | Needs test | Aging logic exists; live reconciliation pending |
| Collector accountability | Partial | Batch/remittance logic exists; shortage/overage workflow needs completion |
| Reports | Partial | Several reports exist; full required set and live totals need completion |
| Audit | Needs test | Schema/viewer exist; complete live action coverage pending |
| Backup / restore | Needs test | Database and PostgreSQL tools are ready; real backup and isolated restore remain open |
| PostgreSQL | Ready locally | PostgreSQL 18 migrations, seeds, readiness, and API authentication pass; clean external setup remains open |
| Playwright E2E | Not started | Needs setup and later workflow automation |
| 3-PC LAN | Not started | Physical acceptance still required |
| Installer | Not started | NSIS config exists but no accepted release artifact |
| Optional mobile | Not started | Keep deferred |

---

# 4. Priority System

- **P0 — BLOCKER**: Prevents core application progress or final acceptance.
- **P1 — CORE**: Required by the laboratory activity and final demonstration.
- **P2 — IMPORTANT**: Needed for reliability, maintainability, professional quality, or clear UX.
- **P3 — ENHANCEMENT**: Useful after core workflows are correct.
- **P4 — FUTURE**: Optional / bonus / future integration.

---

# 5. Status System

Use:

- `NOT STARTED`
- `READY`
- `IN PROGRESS`
- `BLOCKED`
- `NEEDS REVIEW`
- `NEEDS TEST`
- `DONE`

---

# 6. Implementation Waves

## WAVE 0 — Repository Audit and Planning Freeze

### Objective
Confirm the real repository state before major changes.

### PLAN-001 — Map Existing Frontend Screens
**Priority:** P1  
**Status:** READY

Inspect every React/Electron screen and classify it as complete, partial, placeholder, missing, duplicated, or obsolete.

### PLAN-002 — Map Existing API Contracts
**Priority:** P1

For every major frontend module, identify:

- endpoint
- request schema
- response schema
- authorization requirement
- current service/domain implementation
- known policy gates

### PLAN-003 — Map Existing Database Entities
**Priority:** P1

Confirm schema coverage for:

- users / roles / permissions
- subscribers / addresses
- service plans / service accounts
- billing cycles / invoices / invoice items
- payments / allocations / proofs / reversals
- collection areas / batches / remittances
- suspension / reconnection
- audit logs / backup history

### PLAN-004 — Freeze Unnecessary Backend Expansion
**Priority:** P1

During frontend completion:

- preserve business rules
- preserve service/domain architecture
- preserve migrations unless a real schema gap is confirmed
- do not move financial rules into React
- do not rewrite working Fastify/Drizzle code merely for convenience

---

# 7. WAVE 1 — Frontend Foundation

## FND-001 — Application Shell Review
**Priority:** P1

Verify:

- stable Electron shell
- consistent sidebar/topbar
- clear page titles/breadcrumbs
- current user visible
- current role visible
- logout/lock accessible

## FND-002 — Required Navigation Structure
**Priority:** P1

```text
Dashboard

Subscribers
├── All Subscribers
├── New Subscriber
└── Service Accounts

Billing
├── Current Billing
├── Generate Billing
└── Invoices

Payments
├── Receive Payment
├── Payment History
└── GCash Verification

Collections
├── Collectors
├── Areas & Routes
├── Collection Batches
└── Remittance

Receivables
├── Outstanding
├── Overdue
├── Aging
└── Suspension Candidates

Services
Reports
Administration
```

## FND-003 — Role-Aware Navigation
**Priority:** P1

Navigation may hide inaccessible actions, but backend authorization remains authoritative.

## FND-004 — Design Tokens
**Priority:** P2

Use:

- Primary Navy `#0F2747`
- Accent Blue `#2563EB`
- Canvas `#F6F8FB`
- Surface `#FFFFFF`
- Primary Text `#0F172A`
- Secondary Text `#64748B`
- Success `#059669`
- Warning `#D97706`
- Danger `#DC2626`

Also:

- Inter, Geist, or comparable professional sans-serif
- right-aligned money values
- tabular numerals where available
- status text + color, never color alone

## FND-005 — Shared Page States
**Priority:** P1

Create reusable states for:

- loading
- empty
- success
- error
- unauthorized
- API unavailable
- connection lost

## FND-006 — Confirmation Pattern
**Priority:** P1

Require confirmation for high-risk actions such as:

- deactivate subscriber
- service-state change
- generate billing
- verify/reject GCash
- reverse payment
- reconcile/close collection batch
- restore backup
- user/permission changes

## FND-007 — Shared Status Badge System
**Priority:** P2

Standardize statuses for subscribers, services, invoices, payments, GCash verification, collection batches, overdue accounts, and suspension/reconnection.

---

# 8. WAVE 2 — Forms, Queries, and Tables

## FQ-001 — Standardize Forms with React Hook Form + Zod
**Priority:** P1

Target major forms:

- subscriber create/edit
- service account create/edit
- plan create/edit
- billing generation
- payment posting
- GCash proof entry
- collection batch/remittance/reconciliation
- suspension/reconnection
- user management
- backup/restore controls

### Acceptance

- visible labels
- required indicators
- grouped sections
- inline validation
- loading submit state
- useful server error mapping
- no silent failure

## FQ-002 — Introduce TanStack Query Properly
**Priority:** P1

Set up:

- `QueryClient`
- shared API client
- query keys
- `useQuery`
- `useMutation`
- invalidation rules
- retry rules
- stale-data handling

Suggested namespaces:

```text
auth
subscribers
serviceAccounts
plans
billing
invoices
payments
gcash
ledger
receivables
collections
reports
audit
users
settings
```

## FQ-003 — Introduce TanStack Table
**Priority:** P1

Use for:

- subscribers
- service accounts
- invoices
- payments
- GCash queue
- collectors
- collection batches
- remittances
- overdue/aging
- users
- audit

Required behavior:

- sticky headers
- search
- filters
- sorting
- server pagination
- consistent row actions
- loading state
- empty state

## FQ-004 — Server-Side Pagination Standard
**Priority:** P1

Do not load huge datasets into Electron.

Example:

```text
GET /subscribers?page=1&pageSize=50&search=juan
GET /invoices?page=1&pageSize=50&status=OVERDUE
```

Design for at least:

- 20,000 subscribers
- 500,000 invoices
- 500,000 payments
- 1,000,000 ledger-related entries

---

# 9. WAVE 3 — Authentication and Role UX

## AUTH-001 — Login Screen
**Priority:** P1

Complete:

- valid login
- invalid credentials
- inactive account
- loading state
- server unavailable state
- forced password change if applicable

## AUTH-002 — Session UX
**Priority:** P1

Support:

- authenticated state
- logout
- session lock
- expired session
- re-authentication

## AUTH-003 — Role Matrix Review
**Priority:** P1

Required role concepts:

- Owner / Super Admin
- Administrator
- Cashier
- Collection Supervisor
- Accounting / Auditor
- Technician
- Read-only Viewer

## AUTH-004 — Permission-Aware Screens
**Priority:** P1

Verify permission behavior for view, create, update, reverse, reconcile, export, user management, and backup/restore.

---

# 10. WAVE 4 — Subscriber and Service Foundation

## SUB-001 — Subscriber List
**Priority:** P1

Show:

- account number
- name
- contact
- address
- area
- assigned collector
- service summary
- balance
- status

Include search, filters, pagination, row actions.

Global search should eventually support:

- account number
- name
- contact
- address
- receipt number
- invoice number
- GCash reference

## SUB-002 — New Subscriber Form
**Priority:** P1

Capture:

- identity
- account number
- contacts
- address
- collection area
- assigned collector
- billing/due day
- status
- notes

Never hard-delete historical subscriber records.

## SUB-003 — Subscriber Profile
**Priority:** P1

Tabs:

```text
Overview
Services
Billing
Payments
Ledger
Collection
Service History
Documents
Audit
```

## SUB-004 — Multiple Service Accounts
**Priority:** P1

A subscriber may own multiple services and addresses.

```text
Subscriber
├── Internet — Home
├── Cable — Store
└── Combo — Second Address
```

## SUB-005 — Service Account Detail
**Priority:** P1

Store/display:

- service account number
- plan
- service type
- installation address
- activation date
- billing start
- billing/due day
- current rate
- assigned collector
- status
- history

---

# 11. WAVE 5 — Plan Management

## PLANM-001 — Plan List
**Priority:** P1

Support Internet, Cable, and Combo plans.

Fields:

- code
- name
- type
- price
- fees
- description
- active state

Internet may include speed. Cable may include channel count.

## PLANM-002 — Plan Create / Edit
**Priority:** P1

Plan price changes affect future billing only. Historical invoices preserve their original billed rate.

## PLANM-003 — Plan Archive
**Priority:** P2

Prefer archive/deactivation instead of destructive deletion.

---

# 12. WAVE 6 — Billing and Invoice Engine

## BILL-001 — Billing Cycle Screen
**Priority:** P1

Show:

- billing period
- due date
- cycle state
- eligible accounts
- generated count
- skipped count
- failed count

## BILL-002 — Billing Preview
**Priority:** P1

Before finalization show:

- eligible service-account count
- estimated invoices
- period
- due date
- duplicate detection
- excluded/suspended accounts

## BILL-003 — Generate Billing
**Priority:** P1

Finalization must:

- create one invoice per eligible service account
- preserve historical rate
- prevent duplicate account+period billing
- post ledger debit
- record actor/time

## BILL-004 — Invoice List
**Priority:** P1

Statuses:

- DRAFT
- UNPAID
- PARTIALLY_PAID
- PAID
- OVERDUE
- VOID
- CREDITED

## BILL-005 — Invoice Detail
**Priority:** P1

Display invoice number, service account, period, due date, items, allocations, remaining balance, status, and audit history.

## BILL-006 — Controlled Void / Adjustment
**Priority:** P1

Posted invoices are never silently overwritten. Use controlled void/credit/adjustment workflows with reason, actor, timestamp, and audit record.

---

# 13. WAVE 7 — Subscriber Ledger

## LED-001 — Ledger Screen
**Priority:** P1

Columns:

```text
Date
Reference
Description
Debit
Credit
Balance
```

Requirements:

- chronological history
- reproducible running balance
- date filter
- links to related invoice/payment/reversal

## LED-002 — Statement of Account
**Priority:** P1

Generate a clean SOA for a selected date range with on-screen, PDF, and print layouts.

## LED-003 — Ledger Reconciliation
**Priority:** P1

Verify:

```text
Total Debits - Total Credits = Current Balance
```

Ledger should agree with outstanding invoices.

---

# 14. WAVE 8 — Payment Engine

## PAY-001 — Receive Payment Screen
**Priority:** P1

Optimize for cashier speed:

```text
Search Subscriber
→ Show Balance
→ Enter Amount
→ Select Method
→ Allocation Preview
→ Post
→ Receipt
```

## PAY-002 — Payment Methods
**Priority:** P1

Support:

- Cash
- GCash
- Bank Transfer
- Cheque
- Other

Show method-specific fields dynamically.

## PAY-003 — Allocation Preview
**Priority:** P1

Default rule: oldest unpaid invoice first.

Example:

```text
August Invoice       999
September Invoice    999
Payment             1200

Allocation:
August               999
September            201

Remaining September  798
```

## PAY-004 — Exact Payment
**Priority:** P1

```text
Invoice: 999
Payment: 999
Remaining: 0
Status: PAID
```

## PAY-005 — Partial Payment
**Priority:** P1

```text
Invoice: 999
Payment: 500
Remaining: 499
Status: PARTIALLY_PAID
```

## PAY-006 — Advance Payment
**Priority:** P1

Implement only after the approved business policy is explicit. Do not invent financial behavior.

## PAY-007 — Duplicate Submission Protection
**Priority:** P1

Prevent duplicates caused by double click, retry, network uncertainty, or repeated requests.

## PAY-008 — Receipt
**Priority:** P1

Receipt should include:

- unique receipt number
- subscriber
- service account if applicable
- payment date/time
- amount
- method
- actor
- reference details
- allocation summary

Voided numbers are never reused.

## PAY-009 — Payment Reversal
**Priority:** P1

Never destructively edit/delete posted payments.

Reversal must preserve:

- original payment
- linked reversal
- restored balance
- actor
- reason
- timestamp
- audit trail

---

# 15. WAVE 9 — GCash Verification

Do not integrate a live GCash API unless explicitly required later.

## GC-001 — GCash Pending Queue
**Priority:** P1

Use a two-pane layout:

```text
LEFT
Pending Transactions

RIGHT
Proof Preview
Sender
Reference
Amount
Notes
Verify / Reject
```

## GC-002 — GCash Proof Entry
**Priority:** P1

Capture:

- sender
- reference number
- amount
- proof image
- notes
- recorded by
- timestamp

## GC-003 — Duplicate Reference Detection
**Priority:** P1

Search existing references before verification/posting and block/warn according to policy.

## GC-004 — Verification
**Priority:** P1

Authorized staff may verify/reject. Retain verifier identity, timestamp, and reason/notes.

## GC-005 — Posting Verified GCash
**Priority:** P1

Only verified proof may become an actual posted payment. Uploading an image alone must never mark an invoice paid.

---

# 16. WAVE 10 — Collection Areas, Routes, and Collectors

## COL-001 — Collection Areas
**Priority:** P1

Manage area code, name, description, and assigned collectors.

## COL-002 — Collector Management
**Priority:** P1

Show collector identity, active status, assigned routes/areas, current batch, collection totals, and reconciliation history.

## COL-003 — Route Sheet
**Priority:** P1

Printable route sheet should include subscriber, account, address, current bill, arrears, and total due.

---

# 17. WAVE 11 — Collection Batch and Remittance

## BATCH-001 — Collection Batch Lifecycle
**Priority:** P1

```text
OPEN
→ IN_PROGRESS
→ SUBMITTED
→ REMITTED
→ RECONCILED
→ CLOSED
```

## BATCH-002 — Batch Account List
**Priority:** P1

Show subscriber, account, due, collected amount, method, state, and exception.

## BATCH-003 — Batch Totals
**Priority:** P1

Calculate expected receivable, Cash collected, non-cash collected, uncollected, remitted Cash, and difference.

## BATCH-004 — Remittance Screen
**Priority:** P1

Show:

```text
Expected Cash
Remitted Cash
Difference
Non-cash Total
Accounts Collected
Exceptions
```

## BATCH-005 — Shortage / Overage
**Priority:** P1

Example:

```text
Cash collected: 20,000
Remitted:        19,500
Difference:        -500

SHORTAGE: 500
```

Require explanation, authorized review, and audit record.

## BATCH-006 — Batch Close
**Priority:** P1

Only properly reconciled/authorized batches may close.

---

# 18. WAVE 12 — Receivables and AR Aging

## AR-001 — Outstanding Receivables
**Priority:** P1

Show current receivable, overdue receivable, overdue subscriber count, and accounts for follow-up.

## AR-002 — Aging Buckets
**Priority:** P1

- Current
- 1–30
- 31–60
- 61–90
- 90+

## AR-003 — Overdue List
**Priority:** P1

Show subscriber, service, area, collector, months unpaid, oldest invoice, last payment, and total arrears.

## AR-004 — Filters
**Priority:** P1

Filter by collector, area, plan, service type, aging bucket, and delinquency age.

---

# 19. WAVE 13 — Suspension and Reconnection

## SRV-001 — Suspension Candidates
**Priority:** P1

Use configured grace period and suspension threshold.

## SRV-002 — Suspension Record
**Priority:** P1

Store service account, reason, effective date, approved by, and notes.

## SRV-003 — Reconnection Workflow
**Priority:** P1

After qualifying payment:

- create request
- apply fee if required
- assign technician
- store request date
- store completion date
- track status
- audit actions

## SRV-004 — Service History
**Priority:** P1

Never lose historical service-state changes.

---

# 20. WAVE 14 — Dashboard

## DASH-001 — Compact KPI Set
**Priority:** P1

Use 4–6 compact KPIs such as:

- today’s collection
- current receivable
- overdue receivable
- active subscribers
- overdue subscribers
- pending GCash verification

Avoid oversized decorative cards.

## DASH-002 — Operational Summaries
**Priority:** P1

Include billing vs collection, payment-method summary, AR aging, collector performance, overdue alerts, and recent payments.

---

# 21. WAVE 15 — Reports and Printing

## RPT-001 — Daily / Weekly / Monthly / Annual Collections
**Priority:** P1

## RPT-002 — Payment Method Summary
**Priority:** P1

Cash / GCash / Bank Transfer / Cheque / Other

## RPT-003 — Billing vs Collection
**Priority:** P1

## RPT-004 — Accounts Receivable Aging
**Priority:** P1

## RPT-005 — Subscriber Ledger / SOA
**Priority:** P1

## RPT-006 — Collector Reconciliation / Performance
**Priority:** P1

## RPT-007 — Revenue by Plan / Service / Area
**Priority:** P2

## RPT-008 — Payment Reversal / Voided Receipt
**Priority:** P1

## RPT-009 — User Activity / Audit
**Priority:** P1

### Export

- ExcelJS → XLSX
- pdfmake → PDF

### Print

Create clean print layouts without app navigation. Physical printer testing comes later.

---

# 22. WAVE 16 — Administration

## ADM-001 — User Management
**Priority:** P1

- create
- edit
- activate/deactivate
- password reset/change where approved
- role assignment

## ADM-002 — Role / Permission Viewer
**Priority:** P2

Allow administrators to understand permissions.

## ADM-003 — Audit Viewer
**Priority:** P1

Filters:

- user
- action
- entity
- date range

Audit logs must not be editable from normal UI.

## ADM-004 — Settings
**Priority:** P2

Potential settings:

- company information
- billing due-day defaults
- grace period
- suspension threshold
- backup location
- report header

Sensitive settings changes should be audited.

---

# 23. WAVE 17 — PostgreSQL and Backend Integration

## INT-001 — Repair PostgreSQL Readiness
**Priority:** P0

Verify:

- service
- port
- host
- database
- application user
- password
- environment variables
- Drizzle connection
- firewall if applicable

Do not destroy data merely to fix connectivity.

## INT-002 — Migration Verification
**Priority:** P0

From a clean test database:

- run migrations
- verify schema
- verify indexes
- verify constraints
- verify enums
- compare live DB with Drizzle schema

## INT-003 — Seed Verification
**Priority:** P1

Run security, role/permission, master-data, and synthetic-demo seeds.

## INT-004 — Auth Live Integration
**Priority:** P1

Electron → Fastify → PostgreSQL → authenticated session.

## INT-005 — Subscriber Live CRUD
**Priority:** P1

Verify create, read, update, deactivate, refresh, restart, persistence.

## INT-006 — Service Account Live Integration
**Priority:** P1

Verify multiple service accounts per subscriber.

## INT-007 — Billing Live Integration
**Priority:** P1

Verify invoice generation, duplicate protection, ledger debit, persistence.

## INT-008 — Payment Live Integration
**Priority:** P1

Verify exact, partial, advance, allocation, receipt, ledger, and audit.

## INT-009 — Collection Live Integration
**Priority:** P1

Verify batch lifecycle, remittance, shortage/overage, reconciliation.

## INT-010 — Receivables Live Reconciliation
**Priority:** P1

Verify:

```text
AR totals = sum of outstanding invoice balances
```

---

# 24. WAVE 18 — External / Manual Dependencies

These should happen after core UI + API + DB workflows are stable.

| Dependency | Type | Purpose | Implement When | Fallback |
|---|---|---|---|---|
| GCash proof review | Hybrid / Manual | Staff verifies external payment evidence | After payment UI | Manual reference + proof |
| Physical printer | External | Receipt/report printing | After PDF output | Print preview/PDF |
| Excel viewer | External | Open XLSX reports | After XLSX output | Generated file evidence |
| PDF viewer | External | Open reports/SOA | After PDF output | Internal preview |
| PostgreSQL Windows service | External | Central DB | Integration phase | Local test DB |
| `pg_dump` / `pg_restore` | External tool | Backup/restore | After DB integration | Documented CLI/manual test |
| Windows Firewall | External | LAN access | Deployment phase | Localhost testing |
| 3 physical PCs | External | Concurrent office validation | Final acceptance | Multi-client simulation first |
| External backup drive | External | Backup copy | Release phase | Local backup folder |
| NSIS installer | Build tool | Windows installation | Release phase | Dev build |

---

# 25. WAVE 19 — Backup and Restore

## BKP-001 — Backup Creation
**Priority:** P1

Authorized users only. Record path, filename, date/time, actor, success/failure.

## BKP-002 — Backup Verification
**Priority:** P1

A file existing is not enough; verify the backup is usable.

## BKP-003 — Restore Workflow
**Priority:** P1

Require authorization, warning, restore target, pre-restore backup when appropriate, and integrity verification.

## BKP-004 — Isolated Restore Test
**Priority:** P1

```text
Create backup
→ change test data
→ restore backup
→ verify expected records return
```

---

# 26. WAVE 20 — Automated Testing

## TEST-001 — Vitest Financial Rules
**Priority:** P1

Cover:

- monthly charge
- exact payment
- partial payment
- advance payment
- oldest-first allocation
- duplicate billing
- duplicate receipt
- duplicate GCash reference
- reversal
- ledger balance
- AR aging
- collector totals
- shortage/overage
- report totals

## TEST-002 — PostgreSQL API Integration Tests
**Priority:** P1

Test subscriber CRUD, service accounts, billing, payments, allocations, ledger effects, reversals, collections, reconciliation, authorization, rollback, and duplicate prevention.

## TEST-003 — Playwright Electron Smoke Suite
**Priority:** P1

Smoke tests:

- app launches
- login
- dashboard opens
- subscriber page opens
- navigation works
- logout

Enable screenshots and traces on failure.

## TEST-004 — Full Playwright E2E
**Priority:** P1

Automate:

```text
Admin Login
→ Subscriber
→ Service Account
→ Billing
→ Invoice
→ Partial Payment
→ Ledger
→ Receipt
→ Final Payment
→ Report
→ Logout
```

Also automate GCash verification, payment reversal, overdue/aging, collection batch, remittance, and role restriction.

---

# 27. Mandatory Acceptance Tests

## AT-01 — Exact Payment

```text
Invoice: 999
Payment: 999
```

Expected: remaining 0, PAID, ledger balanced, receipt created.

## AT-02 — Partial Payment

```text
Invoice: 999
Payment: 500
```

Expected: remaining 499, PARTIALLY_PAID, allocation and ledger correct.

## AT-03 — Advance Payment

```text
Monthly: 1000
Payment: 3000
```

Expected: approved allocation/credit policy without losing value.

## AT-04 — Oldest-First Arrears

```text
August:    999
September: 999
Payment:  1200
```

Expected:

```text
August remaining:      0
September remaining: 798
```

## AT-05 — Duplicate GCash Reference

Expected: block or explicit warning according to approved policy.

## AT-06 — Payment Reversal

Expected: original remains visible, linked reversal exists, balances restore, actor/reason audited.

## AT-07 — Balanced Collector Remittance

```text
Collected Cash: 20,000
Remitted Cash:  20,000
```

Expected: difference 0; batch may reconcile/close.

## AT-08 — Collector Shortage

```text
Collected Cash: 20,000
Remitted Cash:  19,500
```

Expected: shortage 500; cannot silently close as balanced.

## AT-09 — Concurrent Users

Two/three clients perform valid operations.

Expected: no corruption, duplicate numbering, or unauthorized cross-session effect.

## AT-10 — Authorization

Cashier attempts admin-only operation.

Expected: server rejects the direct API request.

## AT-11 — Duplicate Billing

Run billing generation twice for same period.

Expected: no duplicate finalized invoice.

## AT-12 — Backup / Restore

Expected: restored DB passes integrity check and expected records return.

---

# 28. WAVE 21 — Three-PC LAN Validation

## LAN-001 — Server PC Setup
**Priority:** P1

Central machine hosts Fastify API, PostgreSQL, attachments, backups, and logs.

## LAN-002 — Client Configuration
**Priority:** P1

```text
PC 1: Owner/Admin
PC 2: Cashier
PC 3: Operations
```

All connect to the central API over LAN. Electron renderer never connects directly to PostgreSQL.

## LAN-003 — Cross-PC Reflection
**Priority:** P1

```text
PC 1 creates/updates subscriber
→ PC 2 sees latest state
→ PC 2 records payment
→ PC 3 sees collection/report update
```

## LAN-004 — Concurrent Financial Test
**Priority:** P1

Verify transaction safety, unique numbering, and no corrupted balance.

## LAN-005 — Network Failure
**Priority:** P1

During payment interruption, the app must not show false success and retry must not duplicate the transaction.

---

# 29. WAVE 22 — Installer and Release

## REL-001 — Electron Production Build
**Priority:** P1

## REL-002 — NSIS Installer
**Priority:** P1

Generate Windows installer.

## REL-003 — Clean-PC Install
**Priority:** P1

Test install, launch, API connection, login, and workflow.

## REL-004 — Version / About
**Priority:** P2

Display app version, environment, and build information.

---

# 30. Demo Dataset

Use synthetic data only.

| Data Type | Minimum |
|---|---:|
| Users | 5 |
| Internet Plans | 3 |
| Cable Plans | 2 |
| Combo Plans | 2 |
| Subscribers | 50 |
| Service Accounts | 60+ |
| Collectors | 2 |
| Collection Areas | 3 |
| Billing Months | 3 |
| Overdue Accounts | 10+ |
| Approved Reversal/Void | 1+ |
| Suspension/Reconnection Scenarios | 2+ |

Payments should include Cash, GCash, exact, partial, and advance cases.

Never use real subscriber names, phone numbers, GCash details, passwords, or production databases.

---

# 31. Final Demo Sequence

1. Log in as Administrator.
2. Show dashboard.
3. Create/open subscriber.
4. Show one or more service accounts.
5. Generate/display monthly invoice.
6. Show ledger debit.
7. Post exact/partial Cash payment.
8. Preview/print receipt.
9. Record/verify GCash proof.
10. Show duplicate GCash-reference protection.
11. Show subscriber ledger / SOA.
12. Open overdue subscriber.
13. Show AR aging/filtering.
14. Create/open collection batch.
15. Record collection.
16. Remit Cash.
17. Reconcile collector.
18. Demonstrate shortage/overage behavior.
19. Reverse payment.
20. Show audit trail.
21. Export one report to PDF/XLSX.
22. Login with lower-privileged role.
23. Demonstrate blocked unauthorized action.
24. Create backup.
25. Explain/show tested restore procedure.
26. Demonstrate multi-PC operation if infrastructure allows.

---

# 32. Deliverables Checklist

## D1 — Source Repository

- complete source
- meaningful Git history
- `.gitignore`
- `.env.example`
- migrations
- seeds

## D2 — Working Release

- Windows desktop client
- documented API/server setup
- PostgreSQL setup

## D3 — Technical Documentation

- requirements
- architecture
- module descriptions
- ERD / data dictionary
- API / IPC design
- security model
- deployment
- backup/restore

## D4 — User Manual

- login
- subscriber registration
- billing
- payment
- GCash verification
- collections
- reports
- backup
- troubleshooting

## D5 — Testing Package

- test plan
- automated outputs
- acceptance-test results
- defect/fix evidence

## D6 — Sample Reports

- monthly collection
- AR aging
- subscriber SOA
- collector remittance/performance
- other required reports

## D7 — UI Evidence

Screenshots of dashboard, subscriber profile, payment, GCash, collection reconciliation, overdue/aging, and reports.

## D8 — Presentation / Defense

- architecture explanation
- live workflow
- financial test demo
- security explanation
- limitations
- future work

---

# 33. Definition of Done by Module

A major module is `DONE` only when all applicable items are true:

- [ ] Screen exists
- [ ] UX is complete
- [ ] Loading state exists
- [ ] Empty state exists
- [ ] Error state exists
- [ ] Validation works
- [ ] Permission-aware UI works
- [ ] Fastify endpoint works
- [ ] Server authorization works
- [ ] PostgreSQL persistence works
- [ ] Refresh/restart preserves state
- [ ] Financial/domain side effects are correct
- [ ] Audit record exists when required
- [ ] Related reports reflect changes
- [ ] Another appropriate role sees correct state
- [ ] Automated/manual evidence exists
- [ ] No critical defect remains

---

# 34. Recommended Immediate Next 10 Tasks

| Order | Task | Priority |
|---:|---|---|
| 1 | Complete repository screen/API contract audit | P1 |
| 2 | Standardize app shell + required navigation | P1 |
| 3 | Introduce/finish TanStack Query architecture | P1 |
| 4 | Introduce TanStack Table for operational lists | P1 |
| 5 | Standardize major forms with React Hook Form + Zod | P1 |
| 6 | Complete Subscriber List/Profile/Service Account UX | P1 |
| 7 | Complete Billing Preview/Invoice/Ledger UX | P1 |
| 8 | Complete Receive Payment + Allocation Preview UX | P1 |
| 9 | Complete GCash Verification queue + proof workflow | P1 |
| 10 | Complete Collection Batch + Reconciliation UX | P1 |

---

# 35. Frontend Completion Milestone

Do not leave the frontend-first phase until:

- all required navigation exists
- all required major screens exist
- Subscriber Profile is complete
- service-account workflow is complete
- billing screens are complete
- payment workflow is complete
- GCash verification UI is complete
- collection/reconciliation UI is complete
- receivables/aging UI is complete
- suspension/reconnection UI is complete
- reports UI is complete
- admin/audit UI is complete
- forms use consistent patterns
- tables use consistent patterns
- loading/error/empty states exist
- role-aware navigation is coherent
- no authoritative financial rule was moved into React

---

# 36. Integration Milestone

Do not begin full E2E acceptance until:

- PostgreSQL readiness succeeds
- migrations work from clean DB
- seeds run
- desktop authenticates against live API
- subscriber CRUD persists
- service accounts persist
- billing persists
- payment allocation persists
- ledger reconciles
- reports reconcile
- audit works
- cross-module refresh works

---

# 37. Final Acceptance Milestone

BCIS is ready for final acceptance only when:

> An authorized employee can register a subscriber, create one or more service accounts, generate monthly billing, post exact/partial/advance payments according to approved rules, verify GCash proof, produce correct ledger balances, monitor overdue receivables, reconcile collectors, export trustworthy reports, preserve audit history, create and restore a backup, enforce server-side role restrictions, and use the same central data safely from three office PCs.

Additionally:

- all 12 mandatory acceptance tests have evidence
- installer works
- documentation is complete
- demo dataset is synthetic
- no critical failure condition remains

---

# 38. Critical Do-Not-Do Rules

Do **not**:

- connect Electron renderer directly to PostgreSQL
- store plaintext passwords
- move billing/payment authority into React
- use JavaScript floating-point as authoritative money math
- destructively delete posted financial records
- silently overwrite posted payments
- reuse voided receipt numbers
- let uploaded GCash screenshots auto-post payments
- hide buttons and call that authorization
- load huge datasets entirely into the renderer
- invent unresolved business policy
- let optional mobile/cloud features delay mandatory requirements
- use real customer information in demo/test data

---

# 39. Optional Enhancements — Only After Mandatory Completion

Possible future/bonus work:

- collector mobile/PWA
- offline queue + controlled sync
- SMS/email reminders
- customer portal
- digital SOA
- official payment gateway integration
- QR-coded receipts
- QR subscriber lookup
- GIS mapping
- technician work orders
- equipment inventory
- churn analytics
- revenue forecasting
- route optimization

---

# 40. Progress Tracker Template

| ID | Task | Phase | Priority | Status | Dependency | Evidence |
|---|---|---|---|---|---|---|
| FND-001 | App Shell Review | Frontend Foundation | P1 | PARTIAL | — | Existing shell/RBAC navigation; installed UI evidence pending |
| FQ-001 | RHF + Zod Forms | Frontend Foundation | P1 | IN PROGRESS | FND-001 | Login and new-subscriber forms migrated |
| FQ-002 | TanStack Query | Frontend Foundation | P1 | IN PROGRESS | FND-001 | Shared client/keys plus dashboard and subscriber list |
| SUB-001 | Subscriber List | Subscriber | P1 | NEEDS TEST | FQ-002, FQ-003 | Query + TanStack Table + server paging implemented |
| SUB-003 | Subscriber Profile | Subscriber | P1 | PARTIAL | SUB-001 | Existing profile/service/ledger summary; richer tabs pending |
| BILL-002 | Billing Preview | Billing | P1 | NEEDS TEST | SUB-005 | Live API verified; confirmation UI added |
| PAY-003 | Allocation Preview | Payments | P1 | NEEDS TEST | BILL-005 | Live oldest-first partial allocation verified |
| GC-001 | GCash Queue | Payments | P1 | BLOCKED | Approved GCash policy | Fail-closed gate retained |
| BATCH-004 | Remittance | Collections | P1 | PARTIAL | BATCH-001 | Existing UI/API; live reconciliation pending |
| INT-001 | PostgreSQL Readiness | Integration | P0 | DONE | — | PostgreSQL 18 readiness, migrations, seeds, owner API login verified |
| TEST-003 | Playwright Smoke | Testing | P1 | NOT STARTED | Stable shell/auth | |
| LAN-003 | Cross-PC Reflection | Deployment | P1 | NOT STARTED | Integration milestone | |

---

# 41. Recommended Codex Work Style

For each implementation task:

1. Read the exact requirement.
2. Inspect existing code first.
3. Identify affected domain/data/security rules.
4. Implement the smallest coherent feature.
5. Update validation/migrations only when actually needed.
6. Add/update tests.
7. Run typecheck.
8. Run lint.
9. Run tests.
10. Review diff for financial/security impact.
11. Update the tracker.
12. Commit with a meaningful message.

Do not ask Codex to “build the whole system” in one prompt. Use feature-sized tasks.

---

# 42. Final Development Sequence

```text
AUDIT EXISTING PROJECT
        ↓
FRONTEND FOUNDATION
        ↓
SUBSCRIBER + SERVICE ACCOUNT UX
        ↓
BILLING + LEDGER UX
        ↓
PAYMENT + GCASH UX
        ↓
COLLECTION + REMITTANCE UX
        ↓
RECEIVABLES + SERVICE CONTROL UX
        ↓
REPORTS + ADMIN UX
        ↓
POSTGRESQL REPAIR
        ↓
LIVE API + DB INTEGRATION
        ↓
FINANCIAL RECONCILIATION
        ↓
API INTEGRATION TESTING
        ↓
PLAYWRIGHT E2E
        ↓
BACKUP / RESTORE
        ↓
3-PC LAN
        ↓
INSTALLER + PRINTING
        ↓
FINAL ACCEPTANCE
        ↓
OPTIONAL ENHANCEMENTS
```

---

## Final Rule

**Visual polish matters, but financial correctness, data integrity, authorization, auditability, and reproducible test evidence are the real foundation of the BCIS system.**
