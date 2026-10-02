# CODEX_BCIS_PLANNING_PROMPT.md

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

> **Purpose:** Give this file to Codex inside a **new BCIS project**.
>
> **Mode:** PLANNING ONLY. Codex must inspect the actual repository first and create `BCIS_IMPLEMENTATION_PLAN.md`. It must not implement the system yet.

---

# 1. Role

Act as a senior full-stack architect, Electron desktop engineer, Fastify API engineer, PostgreSQL/database designer, financial-systems engineer, QA lead, and UI/UX planner.

The project is:

**BCIS Subscription Billing and Collection System**

This is a **new standalone laboratory project**. It is not the earlier Student Information System.

Do not reuse Student Information System entities, routes, database schema, authentication rules, or business logic. The only reusable direction is the **frontend visual/design-system consistency**, especially the shadcn/ui preset and component conventions.

---

# 2. Source of Truth

The laboratory activity PDF/specification is the source of truth. If it is present in the repository, inspect it before planning.

Do not silently replace its requirements with generic preferences. If a business rule is unclear, add it to `Risks / Unknowns / Instructor Clarifications` rather than inventing an answer.

---

# 3. Project Goal

Plan a complete desktop-based billing and collection application for a cable and internet service provider.

The system must cover:

- subscribers and addresses;
- Internet, Cable, and Combo plans;
- service accounts;
- monthly billing;
- invoices and invoice items;
- subscriber ledger;
- Cash, GCash, Bank Transfer, Cheque, and Other payments;
- payment allocations;
- receipts;
- GCash proof verification;
- payment reversals;
- collectors;
- collection areas/routes;
- collection batches;
- remittance and reconciliation;
- accounts receivable;
- overdue accounts and aging;
- suspension and reconnection;
- management reports;
- PDF/XLSX export;
- audit trail;
- users, roles, and permissions;
- backup/restore;
- three-PC LAN operation.

---

# 4. Required Architecture

Preserve this production model:

```text
PC 1 — Owner/Admin Desktop ─────┐
PC 2 — Cashier Desktop ─────────┼── LAN ──> Fastify API ──> PostgreSQL
PC 3 — Operations Desktop ──────┘              │
                                               ├── Attachments
                                               ├── Backups
                                               └── Audit / Logs
```

Rules:

- The three office PCs are desktop clients.
- Clients must not open a shared database file directly.
- All operational access goes through the central API.
- The Electron renderer must never connect directly to PostgreSQL.
- Server-side authorization, validation, financial transactions, and audit behavior remain authoritative.

---

# 5. Required / Recommended Stack

Plan around the laboratory stack unless the repository already contains a compatible initialized setup.

## Desktop
- Electron
- electron-vite
- electron-builder

## Renderer
- React
- TypeScript strict
- Tailwind CSS
- shadcn/ui
- Radix-based components
- Lucide icons
- TanStack Table
- TanStack Query
- React Hook Form
- Zod

## API
- Fastify
- TypeScript
- Pino logging

## Database
- PostgreSQL
- Drizzle ORM
- migrations for all schema changes

## Reporting
- ExcelJS
- pdfmake

## Testing
- Vitest
- API/integration tests
- Playwright Electron or an equivalent Electron E2E approach

Do not replace PostgreSQL with shared SQLite.
Do not replace Electron with a browser-only app.
Do not connect the renderer directly to the database.

---

# 6. Existing shadcn Design Direction

For consistency with the previous frontend work, preserve the same shadcn design-system direction.

Known preset:

```bash
npx shadcn@latest init --preset b2D0xPXaU --base radix --template vite --pointer
```

Important: this project is an **Electron desktop application**, so do not blindly create a separate browser-only Vite project just to run this command.

Instead, the plan must:

1. inspect the Electron renderer structure;
2. determine the correct way to initialize/reproduce the preset inside the React renderer;
3. preserve the preset's tokens and component language;
4. remain compatible with electron-vite;
5. document the exact integration approach.

Do not copy Student Information System feature code.

---

# 7. UI/UX Objective

The product should look and behave like a professional commercial ISP billing and operations platform:

- clean;
- trustworthy;
- efficient;
- information-dense;
- consistent;
- easy to navigate;
- optimized for repetitive office workflows;
- practical on desktop monitors.

Avoid:

- generic dashboard-template appearance;
- excessive gradients;
- glassmorphism;
- oversized decorative cards;
- animated counters;
- unrelated visual effects;
- fake analytics;
- decorative charts without operational value.

Use these visual tokens unless the current shadcn preset requires a carefully documented mapping:

```text
Primary / Navy: #0F2747
Accent Blue:    #2563EB
Canvas:         #F6F8FB
Surface:        #FFFFFF
Text Primary:   #0F172A
Text Secondary: #64748B
Success:        #059669
Warning:        #D97706
Danger:         #DC2626
Typography:     Inter, Geist, or comparable professional sans-serif
```

Financial values:
- right aligned;
- tabular numerals where available;
- consistent Philippine peso formatting.

Status indicators must use text + color, not color alone.

---

# 8. Required Navigation

Plan permission-aware navigation around:

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

Hiding a menu/button is a UI convenience only. The Fastify API must enforce authorization independently.

---

# 9. User Roles and RBAC

Plan at least these roles:

## Owner / Super Admin
Full dashboards, reports, approvals, configuration, users, audit, backup/restore.

## Administrator
Subscribers, plans, service accounts, billing, collections, operational reports.

## Cashier
Subscriber search, receive payment, issue receipt, view balances, approved GCash processing.

## Collection Supervisor
Areas/routes, batches, remittance, reconciliation, collector performance.

## Accounting / Auditor
Reports, adjustment/reversal review, receivables, audit trails.

## Technician
Service-account and suspension/reconnection operational information only.

## Read-only Viewer
Dashboards and reports without mutation rights.

Plan granular permissions such as:

```text
subscriber.view
subscriber.create
subscriber.update
billing.generate
payment.create
payment.reverse
collection.reconcile
report.export
user.manage
backup.restore
```

Create a full permission matrix during planning rather than relying only on role names.

---

# 10. Electron Security

Plan:

```text
contextIsolation = true
nodeIntegration = false
```

Expose only a narrow typed preload API when renderer-to-main communication is necessary.

Do not expose broad Node.js APIs to the renderer.

Do not place database credentials, API secrets, or private keys in renderer code.

---

# 11. Authentication / Security

Plan:

- username/password authentication;
- secure password hashing;
- account active/inactive state;
- login/logout;
- session lock;
- failed-login handling;
- server-side RBAC;
- Zod validation;
- attachment validation;
- audit records;
- safe structured logs;
- no plaintext passwords;
- no secrets in logs;
- no renderer DB access.

All posted financial mutations must produce an audit record with actor, action, date/time, reason where applicable, and relevant old/new values.

Audit logs must not be editable through normal UI screens.

---

# 12. Financial Correctness

Treat financial correctness as a core architecture concern.

## Money

Choose and document an exact representation:

- integer centavos; or
- PostgreSQL NUMERIC/DECIMAL plus a safe TypeScript representation.

Never use ordinary JavaScript floating-point arithmetic for authoritative money calculations.

## Transactions

Use PostgreSQL transactions for multi-step financial operations including:

- invoice finalization;
- ledger posting;
- payment posting;
- payment allocation;
- reversals;
- remittance/reconciliation;
- critical unique-number workflows.

An operation must either fully succeed or leave no partial financial state.

## Historical Integrity

Finalized/posted financial records are not silently overwritten or deleted.

Corrections use:

- reversal;
- void;
- adjustment;
- linked correcting entries.

---

# 13. Subscriber Management

Plan:

- unique account number;
- name/identity;
- contacts;
- addresses;
- collection area;
- assigned collector;
- billing/due day;
- status;
- notes;
- multiple service accounts;
- multiple service addresses where appropriate;
- inactive/terminated/archived instead of destructive history deletion.

Global search must cover:

- account number;
- name;
- contact number;
- address;
- receipt number;
- invoice number;
- GCash reference.

Search/filter/pagination must be server-side where appropriate.

---

# 14. Plans and Service Accounts

Support:

- Internet;
- Cable;
- Combo.

Plan fields for:
- code;
- name;
- price;
- fees;
- description;
- active state;
- Internet speed where applicable;
- Cable channel count where applicable.

Service accounts include:
- service account number;
- subscriber;
- plan;
- installation address;
- activation date;
- billing start date;
- billing/due day;
- current rate;
- status;
- assigned collector;
- service history.

Plan-price changes affect future billing only. Historical invoices preserve billed rates.

---

# 15. Billing / Invoice Engine

Required states:

```text
DRAFT
UNPAID
PARTIALLY_PAID
PAID
OVERDUE
VOID
CREDITED
```

Plan:

- billing cycles;
- invoice numbering;
- billing period;
- due dates;
- line items;
- subscription charge;
- installation/reconnection fees;
- discount;
- optional penalty;
- debit/credit adjustments;
- duplicate-billing prevention;
- invoice finalization;
- immutable finalized invoices;
- void/adjustment workflow;
- ledger debit posting.

The same service account and billing period must not produce duplicate finalized invoices.

Use database constraints/idempotency where appropriate.

---

# 16. Subscriber Ledger

Plan a reproducible chronological debit/credit ledger:

```text
Date
Reference
Description
Debit
Credit
Balance
```

It must support:

- invoice debits;
- payment credits;
- adjustments;
- reversals;
- reproducible running balance;
- date-range Statement of Account.

Explicitly decide whether the ledger is persisted, derived, or hybrid and explain how correctness will be tested.

---

# 17. Payments and Allocation

Support:

- Cash;
- GCash;
- Bank Transfer;
- Cheque;
- Other.

Capture:
- payment date/time;
- amount;
- receipt number;
- actor;
- method;
- reference;
- notes;
- optional proof attachment.

Support:
- exact;
- partial;
- advance payments.

Default allocation:

```text
oldest unpaid invoice first
```

Manual allocation only when an authorized documented rule permits it.

Posted payments are corrected by reversal, not destructive edit.

Plan:
- posting transaction;
- allocation records;
- receipt generation;
- overpayment/advance-credit policy;
- reversal;
- concurrency protection;
- audit.

If advance-credit behavior is not completely specified, flag it for instructor/business clarification.

---

# 18. GCash Verification

Required workflow:

1. Staff records reference, sender details, amount, and proof image.
2. System checks possible duplicate references.
3. Authorized staff verifies or rejects the evidence.
4. Only verified payments are posted.
5. Verification actor/timestamp are retained.

A screenshot is evidence to review, not automatic proof of payment.

Plan:
- pending/verified/rejected states;
- proof preview;
- safe file storage;
- file type/size validation;
- duplicate-reference detection;
- verification identity/time;
- audit history.

---

# 19. House-to-House Collections

Plan:

- collection areas/routes;
- collector assignments;
- subscriber assignments;
- route sheets;
- collection batches;
- expected receivable;
- Cash collected;
- non-cash collected;
- uncollected amount;
- remittance;
- shortage/overage;
- reconciliation;
- authorized close.

Batch states:

```text
OPEN
IN_PROGRESS
SUBMITTED
REMITTED
RECONCILED
CLOSED
```

A shortage/overage must remain visible and cannot be silently forced to zero.

---

# 20. Receivables / Aging

Plan:

- current receivable;
- overdue receivable;
- overdue subscriber count;
- follow-up/suspension candidates.

AR aging buckets:

```text
Current
1–30
31–60
61–90
90+
```

Overdue table should show:
- subscriber;
- service;
- area;
- collector;
- months unpaid;
- oldest unpaid invoice;
- last payment;
- arrears.

Filters:
- collector;
- area;
- plan;
- service type;
- delinquency age.

Document the authoritative aging calculation.

---

# 21. Suspension / Reconnection

Plan:

- configurable grace period;
- suspension threshold;
- candidate list;
- reason;
- effective date;
- approval;
- notes;
- service history;
- qualifying payment;
- reconnection request;
- fee where applicable;
- technician assignment;
- request/completion dates.

All state changes remain in service history.

---

# 22. Receipts / Reports

Receipt rules:
- unique numbers;
- voided numbers remain reserved;
- print/preview;
- preserve void history.

Reports should cover:

- daily/weekly/monthly/annual collections;
- Cash/GCash/payment-method summaries;
- billing vs collection;
- revenue by plan/service/area;
- accounts receivable;
- aging;
- subscriber master list;
- subscriber ledger;
- Statement of Account;
- collector assignment;
- collection/remittance;
- shortage/overage;
- collector performance;
- adjustments/reversals;
- voided receipts;
- user activity/audit.

Applicable reports must export to:
- PDF;
- XLSX.

CSV may be added only where useful.

---

# 23. Dashboard

Use 4–6 compact KPIs plus useful operational information.

Potential content:
- current receivable;
- overdue receivable;
- collection totals;
- billing vs collection;
- payment-method summary;
- AR aging;
- collector performance;
- overdue alerts;
- recent payments.

No fake data or decorative charts.

Prefer server-side aggregate endpoints for large datasets.

---

# 24. Key Screen UX

Plan these carefully.

## Login / Session Lock
Focused and secure.

## Dashboard
Compact and operational.

## Subscriber List
- global search;
- filters;
- sorting;
- server pagination;
- statuses;
- fast row actions.

## Subscriber Profile
Tabs:
- Overview
- Services
- Billing
- Payments
- Ledger
- Collection
- Service History
- Documents
- Audit

## Receive Payment
Optimize for cashier speed:

```text
Search subscriber
→ inspect balance
→ enter amount
→ choose method
→ preview allocation
→ confirm/post
→ preview/print receipt
```

## GCash Verification
Two-pane layout:
- queue/list;
- proof preview + verification controls.

## Collector Reconciliation
Clearly display:
- expected Cash;
- remitted Cash;
- difference;
- non-cash;
- accounts collected;
- exceptions;
- status.

## Operational Tables
- sticky headers;
- search;
- filters;
- sorting;
- pagination/virtualization as appropriate;
- export;
- consistent badges.

## Forms
- visible labels;
- required indicators;
- section grouping;
- inline validation.

## Printing
Dedicated clean layouts without app navigation.

---

# 25. shadcn Component Strategy

Use existing shadcn primitives first.

Likely families:

## App shell
- Sidebar
- Breadcrumb
- Dropdown Menu
- Avatar
- Separator
- Scroll Area
- Tooltip

## Dense data
- Table
- Badge
- Pagination
- Command
- Popover
- Select
- Input
- Tabs
- Dropdown Menu

## Forms
- Form
- Input
- Textarea
- Select
- Combobox
- Checkbox
- Radio Group
- Calendar / Date Picker
- Button

## Workflows
- Dialog
- AlertDialog
- Sheet
- Tabs

## Feedback
- Alert
- Skeleton
- Sonner/toast
- Progress where appropriate

Do not install every component blindly.

Prefer app-specific components that compose shadcn primitives rather than repeatedly modifying generated `components/ui` files.

---

# 26. Minimum Data Model

At minimum preserve these concepts.

## Security
- users
- roles
- permissions
- role_permissions
- user_roles

## Subscribers
- subscribers
- subscriber addresses/contact information

## Services
- service_types
- service_plans
- service_accounts
- service_events/devices as needed

## Billing
- billing_cycles
- invoices
- invoice_items
- adjustments

## Payments
- payments
- payment_allocations
- payment_proofs
- payment_reversals

## Collections
- collection_areas
- collector_assignments
- collection_batches
- batch_accounts
- collector_remittances

## Documents
- receipts / receipt records

## Operations
- suspension_records
- reconnection_records

## System
- audit_logs
- application_settings
- backup_history

The schema may be refined but may not remove required business concepts simply to reduce table count.

---

# 27. Required Relationships

At minimum:

```text
Subscriber 1 ──< ServiceAccount 1 ──< Invoice 1 ──< InvoiceItem

Invoice >──< Payment
through PaymentAllocation

Collector 1 ──< CollectionBatch 1 ──< CollectionBatchAccount

Payment 1 ──< PaymentProof
Payment 1 ──< PaymentReversal

ServiceAccount 1 ──< ServiceEvent
ServiceAccount 1 ──< Suspension
ServiceAccount 1 ──< Reconnection
```

The implementation plan must define:
- keys;
- cardinality;
- ownership;
- foreign keys;
- unique constraints;
- delete/restrict behavior;
- history preservation.

---

# 28. Required Constraints / Indexes

Plan database-enforced constraints for:

- unique subscriber account number;
- unique service account number;
- unique invoice number;
- no duplicate service account + billing period invoice;
- unique receipt number;
- voided receipt numbers remain reserved;
- controlled GCash-reference uniqueness/deduplication;
- required foreign keys;
- valid statuses/enums where appropriate.

Indexes should support:
- subscriber name;
- subscriber account;
- contact;
- invoice due date/status;
- payment date/reference;
- collector;
- collection area.

Add other indexes only based on real query patterns.

---

# 29. Scale / Performance

Plan for at least:

```text
20,000 subscribers
500,000 invoices
500,000 payments
1,000,000 ledger-related entries
```

Therefore:
- no full-dataset loading into renderer;
- server pagination;
- server filtering/sorting;
- indexed queries;
- avoid N+1;
- efficient aggregate/report queries;
- virtualization only where useful;
- careful cache invalidation after financial posts.

Identify performance-sensitive endpoints/tables in the plan.

---

# 30. Attachments

Plan safe server-side storage for:
- GCash proof images;
- generated files if persisted;
- backups;
- logs.

Use:
- controlled storage roots;
- safe generated filenames;
- path traversal prevention;
- allowed MIME types;
- size limits;
- metadata where useful;
- documented backup inclusion.

---

# 31. Backup / Restore

This is mandatory.

Plan:
- PostgreSQL backup;
- attachment backup;
- backup metadata/history;
- integrity verification;
- restore authorization;
- confirmation;
- audit/logging;
- restore test;
- documented recovery procedure.

Do not treat copying a shared DB file as a valid PostgreSQL backup strategy.

---

# 32. Logging / Audit

Separate:

## Technical logs
Use Pino for errors, request metadata, and diagnostics.

Never log passwords, secrets, or confidential payment credentials.

## Business audit
Record:
- actor;
- action;
- time;
- reason where required;
- entity/reference;
- relevant old/new values;
- reversal/adjustment links.

---

# 33. API Error Contract

Plan consistent API errors for:

- validation;
- authentication;
- authorization;
- not found;
- conflict/duplicate;
- business-rule violation;
- concurrency conflict;
- internal error;
- database unavailable;
- attachment failure.

The renderer must show understandable messages and never raw SQL/stack traces.

---

# 34. Repository Organization

Plan a clean development layout compatible with the required submission structure.

Suggested concept:

```text
BCIS-Subscription-Billing-System/
├── source/
│   ├── apps/
│   │   ├── desktop/
│   │   │   └── src/
│   │   │       ├── main/
│   │   │       ├── preload/
│   │   │       └── renderer/
│   │   └── api/
│   │       └── src/
│   ├── packages/
│   │   └── shared/
│   └── workspace/package configuration
├── database/
│   ├── migrations/
│   └── seeds/
├── docs/
│   ├── technical-documentation.*
│   ├── user-manual.*
│   ├── erd.*
│   └── deployment-guide.md
├── tests/
│   ├── acceptance/
│   └── screenshots/
├── reports-samples/
├── release/
├── README.md
└── .gitignore
```

This is a reference, not a command.

Inspect the actual repository before finalizing it.

Use the simplest maintainable workspace/monorepo arrangement.

---

# 35. Shared Contracts

Plan safe shared TypeScript contracts for:
- enums/statuses;
- DTOs;
- Zod schemas;
- API response types;
- permission identifiers;
- money/date serialization.

Do not share:
- secrets;
- DB connections;
- privileged service logic;
- private server internals.

Business rules belong in server/domain services, not React components.

---

# 36. API Plan

Plan a versioned API such as:

```text
/api/v1
```

Endpoint groups should cover:

- auth;
- users;
- roles;
- permissions;
- subscribers;
- plans;
- service accounts;
- billing;
- invoices;
- ledger;
- payments;
- GCash verification;
- receipts;
- collection areas/routes;
- collectors;
- batches;
- remittances;
- receivables;
- aging;
- suspensions;
- reconnections;
- reports;
- audit;
- settings;
- backup/restore;
- health.

For each group document:
- purpose;
- key actions;
- permissions;
- transaction sensitivity;
- pagination/filter/sort needs;
- conflict/idempotency handling.

Do not generate hundreds of routes prematurely.

---

# 37. Demo Seed Data

Use synthetic data only.

Minimum:

```text
Users:                5+ covering Admin, Cashier, Collection Supervisor, Auditor/Viewer
Plans:                3 Internet, 2 Cable, 2 Combo
Subscribers:          50
Service Accounts:     60+
Collectors:           2
Collection Areas:     3
Invoices:             3+ billing months
Payments:             Cash, GCash, exact, partial, advance
Overdue Accounts:     10+ across aging buckets
Reversal/Void:        1+ approved example
Suspension/Reconnect: 2+ scenarios
```

Never use real customer data, real GCash details, real passwords, or production databases.

---

# 38. Mandatory Acceptance Tests

Map all tests into the plan.

## AT-01 Exact payment
Invoice ₱999; payment ₱999.
Expected: remaining ₱0, PAID, ledger balanced, receipt created.

## AT-02 Partial payment
Invoice ₱999; payment ₱500.
Expected: remaining ₱499, PARTIALLY_PAID, correct allocation/ledger.

## AT-03 Advance payment
Monthly ₱1,000; payment ₱3,000.
Expected: documented credit/allocation policy with no lost value.
If policy is ambiguous, flag it.

## AT-04 Oldest-first arrears
August ₱999 + September ₱999; payment ₱1,200.
Expected: August ₱0; September ₱798 remaining.

## AT-05 Duplicate GCash reference
Expected: blocked or explicitly warned according to documented policy.

## AT-06 Payment reversal
Expected: original remains visible, linked reversal, balance restored, actor/reason audited.

## AT-07 Balanced remittance
Collected ₱20,000; remitted ₱20,000.
Expected: difference ₱0; batch may reconcile/close.

## AT-08 Collector shortage
Collected ₱20,000; remitted ₱19,500.
Expected: ₱500 shortage visible; not silently balanced.

## AT-09 Concurrent users
2–3 clients operate simultaneously.
Expected: no corruption, duplicate numbering, or unauthorized cross-session effect.

## AT-10 Authorization
Cashier calls admin-only operation.
Expected: server rejects it even through direct API access.

## AT-11 Duplicate billing
Run billing twice for same period.
Expected: no duplicate finalized invoice per service account/period.

## AT-12 Backup/restore
Backup, change test data, restore.
Expected: integrity passes and expected data returns.

Classify each test as:
- unit/domain;
- API integration;
- Electron E2E/manual;
- infrastructure/concurrency.

---

# 39. Test Evidence

Plan to retain:
- automated domain/business output;
- API/integration output;
- E2E/manual workflow evidence;
- screenshots;
- report files;
- balance verification;
- bug log;
- root cause;
- fix;
- regression test.

Testing is continuous, not postponed until the end.

---

# 40. Deliverables

Plan for:

## D1 Source Repository
Source, meaningful Git history, `.gitignore`, `.env.example`, migrations, seeds.

## D2 Working Release
Installable/run-ready desktop client, API/server setup, PostgreSQL setup.

## D3 Technical Documentation
Requirements, architecture, modules, ERD/data dictionary, API/IPC, security, deployment, backup/restore.

## D4 User Manual
Login, subscribers, billing, payment, GCash, collection, reports, backup, troubleshooting.

## D5 Testing Package
Test plan, automated outputs, acceptance results, defects/fixes.

## D6 Reports
Sample PDF/XLSX reports including monthly collection, AR aging, SOA, collector reports.

## D7 UI Evidence
Screenshots of dashboard, subscriber profile, payment, GCash, reconciliation, overdue/aging, reports.

## D8 Presentation / Defense
Architecture, workflow, financial tests, security, limitations/future work.

---

# 41. Final Submission Structure

Plan so final artifacts map cleanly to:

```text
BCIS-Subscription-Billing-System/
├── source/
├── database/
│   ├── migrations/
│   └── seeds/
├── docs/
│   ├── technical-documentation.pdf or .docx
│   ├── user-manual.pdf or .docx
│   ├── erd.png or .pdf
│   └── deployment-guide.md
├── tests/
│   ├── acceptance-test-report.pdf
│   └── screenshots/
├── reports-samples/
├── release/
└── README.md
```

Explain how the development repository maps to these final artifacts.

---

# 42. Required Live Demo

Plan the system to demonstrate:

1. Admin login and dashboard.
2. Create/open subscriber with Internet/Cable service.
3. Generate/display monthly invoice and ledger debit.
4. Post exact/partial Cash payment.
5. Preview/print receipt.
6. Record/verify GCash proof.
7. Show duplicate GCash protection.
8. Show ledger and Statement of Account.
9. Show overdue subscriber and AR aging/filtering.
10. Open/create collector batch.
11. Record collections.
12. Remit Cash.
13. Reconcile difference.
14. Reverse a payment and show audit.
15. Export a report to PDF/XLSX.
16. Demonstrate lower-privilege restrictions.
17. Create backup and explain tested restore.
18. Demonstrate multiple clients when infrastructure allows.

Map each to:
- screen;
- API;
- domain service;
- DB entities;
- expected result;
- evidence.

---

# 43. Defense Readiness

The plan must prepare the developer to explain:

- why PostgreSQL instead of shared SQLite;
- where authoritative billing/payment logic lives;
- duplicate invoice/receipt/GCash prevention;
- partial-payment representation;
- reversal vs deletion;
- ledger correctness;
- transaction behavior if API crashes mid-posting;
- server authorization vs hidden UI controls;
- backup verification/restore;
- future collector mobile/PWA implications.

Identify the important modules/files to study for each topic.

---

# 44. Critical Failure Prevention

The plan must prevent:

- destructive deletion of posted payments;
- incorrect ledger balances;
- shared database-file architecture;
- plaintext passwords;
- renderer direct DB access;
- missing server authorization;
- unusable backup/restore;
- static CRUD-only implementation without financial workflows.

These are architecture blockers.

---

# 45. AI / Git Workflow

Plan feature-sized work:

```text
Read requirement
↓
Inspect architecture
↓
Identify data/domain/security impact
↓
Implement smallest coherent feature
↓
Add/update migration and validation
↓
Add tests
↓
Run typecheck + lint + tests
↓
Review financial/security diff
↓
Commit meaningful change
```

Plan meaningful commits/checkpoints.

Never place real customer/private data in AI prompts.

---

# 46. File-Handling Safety

Before any implementation:

- inspect current files;
- preserve valid work;
- do not use destructive cleanup;
- do not run `git clean`;
- do not use destructive reset;
- do not delete migrations;
- do not delete backups/databases blindly;
- do not overwrite environment files without review.

If repository is empty, plan scaffolding.
If repository already contains work, classify it before reorganizing.

The plan must include a file-by-file implementation map.

---

# 47. TASK NOW — PLANNING ONLY

Inspect the actual repository and create:

```text
BCIS_IMPLEMENTATION_PLAN.md
```

Do NOT implement features yet.

Do NOT:
- create production database tables yet;
- generate real migrations yet;
- scaffold major feature modules yet;
- build billing/payment logic yet;
- create UI screens yet;
- modify the Student Information System project.

This is a separate BCIS project.

---

# 48. Required `BCIS_IMPLEMENTATION_PLAN.md` Structure

## 1. Executive Summary
Explain the project, current repo state, target architecture, development areas, and highest risks.

## 2. Current Repository Assessment
Inspect:
- files/folders;
- Git status;
- package manager/workspace;
- Electron;
- React;
- shadcn;
- Fastify;
- PostgreSQL/Drizzle;
- tests;
- docs;
- environment configuration.

Do not guess.

## 3. Final Architecture
Provide an architecture diagram and explain boundaries:

```text
Electron Renderer
↕
Preload / Electron Main when necessary
↕
HTTP
↕
Fastify API
↕
Domain / Services
↕
Drizzle
↕
PostgreSQL
```

Include attachments, backups, reports, logs, and audit.

## 4. Repository Structure
Show the proposed final tree with one-line responsibilities.

## 5. Domain Model / ERD Plan
List entities, keys, relationships, constraints, statuses, and history rules.

## 6. Financial Model
Document:
- money representation;
- invoices;
- payment allocation;
- partial payment;
- advance payment;
- oldest-first allocation;
- ledger;
- reversal;
- adjustment;
- receipt numbering;
- transactions;
- concurrency.

Flag ambiguities.

## 7. Authentication / RBAC / Audit
Document sessions, hashing, roles, permissions, routes, UI permissions, audit, failed login, session lock.

## 8. API Plan
Module/endpoint groups, permissions, pagination, filters, transaction sensitivity, conflicts.

## 9. Electron Security / IPC
Main, preload, renderer, context isolation, node integration, typed preload, build concerns.

## 10. UI/UX + shadcn Plan
Explain exact preset integration, tokens, navigation, desktop shell, dense tables, forms, dialogs, statuses, print behavior, role navigation.

## 11. Screen-by-Screen Plan
Cover at least:
- Login
- Session Lock
- Dashboard
- Subscriber List
- New Subscriber
- Subscriber Profile
- Service Accounts
- Plans
- Current Billing
- Generate Billing
- Invoices
- Invoice Detail
- Receive Payment
- Payment History
- GCash Verification
- Collectors
- Areas & Routes
- Collection Batches
- Reconciliation
- Outstanding
- Overdue
- AR Aging
- Suspension Candidates
- Suspension/Reconnection
- Reports
- Administration
- Users/Roles/Permissions
- Audit
- Backup/Restore
- Settings

For each include:
- purpose;
- roles;
- actions;
- API/domain dependencies;
- shadcn components;
- loading/empty/error states;
- confirmations;
- financial/audit sensitivity.

## 12. Server State / Client State
Explain TanStack Query, caching, invalidation, stale financial data, local UI state, forms.

## 13. Forms / Validation
React Hook Form, Zod, server validation, error mapping, financial inputs, confirmations.

## 14. Tables / Search / Pagination
Server searching, filters, sorting, pagination, TanStack Table, virtualization where useful.

## 15. Reports / Printing
PDF/XLSX, receipts, SOA, report calculation location, print layouts.

## 16. Attachments
GCash proof lifecycle and safe storage.

## 17. Backup / Restore
Complete tested workflow.

## 18. Logging / Error Handling
Technical logging vs business audit.

## 19. Seed / Demo Data
Map all minimum dataset requirements to seed scripts.

## 20. Acceptance Test Matrix
Create a table:

```text
ID | Scenario | Test Layer | Setup | Expected Result | Modules | Evidence
```

Cover AT-01 through AT-12.

## 21. Performance / Concurrency
Indexes, transactions, numbering, duplicate prevention, three-PC concurrency, dataset scale.

## 22. File-by-File Implementation Map
For each major planned file:

```text
Path
Action: CREATE / MODIFY / KEEP
Purpose
Responsibility
Dependencies
Phase
```

Do not list dependency-generated files individually.

## 23. Phased Implementation Plan

Use these ten phases.

### Phase 1 — Analysis and Project Foundation
Plan:
- repo/workspace;
- Electron;
- React;
- TypeScript strict;
- Fastify;
- PostgreSQL;
- Drizzle;
- environment;
- lint/test;
- health endpoint;
- Electron shell;
- shadcn integration;
- architecture docs.

Checkpoint:
- architecture;
- initialized repo;
- DB connection;
- health endpoint;
- Electron shell;
- README.

### Phase 2 — Authentication and RBAC
Plan:
- users;
- roles;
- permissions;
- login/logout;
- session lock;
- protected API;
- permission-aware nav;
- authorization tests.

Checkpoint:
- working login;
- seeded admin;
- role matrix;
- authorization tests.

### Phase 3 — Plans, Subscribers, Service Accounts
Plan:
- plans;
- subscriber registration;
- addresses;
- services;
- history;
- area/collector;
- fast search.

Checkpoint:
- CRUD + validation;
- subscriber profile;
- service account screen;
- sample records.

### Phase 4 — Billing and Ledger Engine
Plan:
- billing;
- invoice numbering;
- line items;
- duplicate protection;
- due dates;
- statuses;
- ledger debit;
- tests.

Checkpoint:
- billing generator;
- invoice screen;
- ledger entries;
- unit/integration tests.

### Phase 5 — Payments, Allocation, Receipts
Plan:
- payment methods;
- oldest-first allocation;
- partial;
- advance;
- receipts;
- GCash proofs;
- reversal;
- audit.

Checkpoint:
- payment screen;
- allocation preview;
- receipt;
- GCash verification;
- reversal workflow;
- tests.

### Phase 6 — Collector / Remittance
Plan:
- areas/routes;
- collectors;
- assignments;
- batches;
- route sheets;
- collection recording;
- remittance;
- shortage/overage;
- reconciliation.

Checkpoint:
- batch lifecycle;
- reconciliation;
- collector report;
- tests.

### Phase 7 — Receivables / Service Control
Plan:
- outstanding;
- overdue;
- aging;
- follow-up filters;
- suspension candidates;
- suspension/reconnection.

Checkpoint:
- aging report;
- overdue dashboard;
- service history.

### Phase 8 — Reports / Dashboard / Printing
Plan:
- KPIs;
- collections;
- revenue;
- AR;
- collector reports;
- SOA;
- PDF/XLSX;
- printing.

Checkpoint:
- dashboard;
- minimum reports;
- PDF/XLSX evidence.

### Phase 9 — Backup / Hardening / Deployment
Plan:
- backup/restore;
- integrity;
- logging;
- security review;
- LAN deployment;
- installer;
- three-client concurrency test.

Checkpoint:
- backup/restore evidence;
- installer;
- deployment guide;
- multi-client evidence.

### Phase 10 — QA / Documentation / Defense
Plan:
- acceptance tests;
- bug fixes;
- regression;
- technical docs;
- user manual;
- screenshots;
- sample reports;
- final demo;
- release.

Checkpoint:
- final source;
- test report;
- documentation;
- presentation;
- release build.

For EVERY phase include:

```text
Goal
Prerequisites
Backend/API Work
Database/Migration Work
Electron/Frontend Work
shadcn Components/Screens
Tests
Security Review
Financial Review (when applicable)
Files Affected
Checkpoint Evidence
Suggested Git Commit/Tag
Definition of Done
```

## 24. Instructor Checkpoint Map
Map CP1–CP6 to phases and evidence.

## 25. Live Demo Map
Map every live-demo requirement to screen, API, domain service, entities, expected result, and evidence.

## 26. Defense Study Map
List the exact modules/files the student must understand for common defense questions.

## 27. Risks / Unknowns / Clarifications
For each:

```text
Issue
Why it matters
Recommended clarification/decision
Blocking or non-blocking
```

## 28. Final Completion Checklist
Include:
- starts without manual dev-only edits;
- 3 clients connect;
- no committed secrets;
- migrations work from clean DB;
- synthetic seed data;
- RBAC/server permissions;
- no duplicate billing;
- exact/partial/advance payments;
- reversal preserves history;
- unique receipts;
- shortage/overage visible;
- aging reconciles;
- PDF/XLSX correct;
- backup/restore tested;
- automated/E2E evidence;
- technical docs;
- user manual;
- deployment guide;
- release/installer;
- README;
- defense readiness.

---

# 49. Planning Rules

1. Planning only.
2. Inspect actual repository first.
3. Keep BCIS separate from Student Information System.
4. Preserve Electron + Fastify + PostgreSQL architecture.
5. Preserve shadcn visual consistency.
6. Do not turn it into a browser-only web app.
7. Financial rules live on server/domain side.
8. React never owns authoritative billing/payment logic.
9. Use exact money handling.
10. Use transactions for financial posting.
11. Never destructively alter posted financial history.
12. Enforce permissions server-side.
13. Keep renderer isolated from database/Node internals.
14. Keep folders easy to navigate.
15. Avoid unnecessary abstraction/dependencies.
16. Mandatory requirements before optional enhancements.
17. Every phase ends with evidence.
18. Flag ambiguous business rules.
19. Make the plan understandable enough for face-to-face defense.
20. Do not begin implementation after writing the plan.

---

# 50. Final Codex Response

After creating:

```text
BCIS_IMPLEMENTATION_PLAN.md
```

respond only with:

## PLAN CREATED

- path to the plan;
- current repository status in one sentence;
- 3–6 bullets summarizing architecture and phases;
- blockers/clarifications;
- confirmation that no feature implementation was performed.

Then stop and wait for approval.
