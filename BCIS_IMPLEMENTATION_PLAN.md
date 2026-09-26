# BCIS Subscription Billing and Collection System — Implementation Plan

> Status: approved for phased execution; Phases 1–8 implemented and Phases 9–10 code-prepared on 2026-09-22 within documented safety boundaries (live PostgreSQL recovery, installer, three-PC, and final acceptance pending)  
> Prepared from: `CODEX_BCIS_PLANNING_PROMPT.md` and the repository inspection on 2026-09-22  
> Implementation gate: no application work begins until this plan is approved

## 1. Executive Summary

BCIS is a standalone, three-client desktop billing and collection system for a cable and Internet provider. The target is three Electron clients on an office LAN talking by HTTP to one authoritative Fastify API, which alone accesses PostgreSQL and server-managed attachments, reports, backups, technical logs, and business audit records.

The repository is a blank project at planning time: its only pre-existing file is `CODEX_BCIS_PLANNING_PROMPT.md`. It is not a Git repository and contains no laboratory PDF, package manager configuration, source code, framework setup, database artifacts, tests, documentation set, or environment files. Consequently, Phase 1 must initialize the repository and validate the toolchain before any business feature work. No existing application code needs reorganization or preservation.

The proposed implementation uses a small pnpm workspace under `source/`: an Electron/electron-vite React desktop app, a Fastify API, and a shared contracts package. PostgreSQL and Drizzle provide transactional persistence. All authoritative financial calculations, allocations, numbering, authorization, auditing, and file validation remain in the API/domain layer. The renderer is a typed client, never a database client.

Highest risks are incomplete source requirements because the laboratory PDF is absent, ambiguous advance-credit and GCash duplicate policies, correct immutable ledger/reversal design, safe concurrent numbering, a genuinely tested PostgreSQL plus attachment restore, and reproducing the requested shadcn preset inside electron-vite without creating a separate browser app. These are addressed through early instructor decisions, database constraints, transaction-level integration tests, and evidence checkpoints in every phase.

## 2. Current Repository Assessment

Inspection scope: recursive file listing (including hidden entries), Git status, and a complete read of the 1,945-line planning prompt.

| Area | Verified state | Planning consequence |
|---|---|---|
| Files/folders | One file only: `CODEX_BCIS_PLANNING_PROMPT.md` (38,933 bytes); no subfolders | Keep it as the planning source. Create structure only during approved Phase 1. |
| Laboratory specification | No PDF or separate laboratory specification is present | The prompt is the only available requirement source; obtain the official PDF before schema commitment. |
| Git | `git status` reports that the directory is not a Git repository | Initialize Git in Phase 1; there is no history or dirty worktree to preserve. |
| Package/workspace | No `package.json`, lockfile, workspace file, or Node version policy | Select pnpm and pin Node/pnpm versions in Phase 1. |
| Electron/React/shadcn | Not initialized | Create one electron-vite renderer and integrate the preset there; do not create a second web app. |
| Fastify | Not initialized | Create a separate LAN API workspace package. |
| PostgreSQL/Drizzle | No schema, migration, connection, or container configuration | Design and review schema before generating the first migration. |
| Tests | No runner, tests, or evidence folders | Establish Vitest/API test harnesses in Phase 1 and add tests continuously. |
| Documentation | Only the planning prompt | Add README and architecture records after approval; final deliverables map to `docs/`. |
| Environment | No `.env`, `.env.example`, ignore rules, ports, or secrets | Define separate API and desktop public settings; never expose DB credentials to the renderer. |

No cleanup, renaming, dependency installation, framework generation, or feature implementation is justified before plan approval.

## 3. Final Architecture

```text
PC 1 Owner/Admin        PC 2 Cashier        PC 3 Operations
┌────────────────┐     ┌────────────────┐   ┌────────────────┐
│ Electron       │     │ Electron       │   │ Electron       │
│ React renderer │     │ React renderer │   │ React renderer │
│      ↕ typed IPC only for OS/print/window operations       │
│ preload (narrow API) ↔ Electron main                       │
└───────┬────────┘     └───────┬────────┘   └───────┬────────┘
        └───────────────────────┼────────────────────┘
                                │ HTTPS/HTTP on trusted LAN
                         ┌──────▼────────┐
                         │ Fastify API   │
                         │ auth + RBAC   │
                         │ Zod contracts │
                         │ domain svc    │
                         │ transactions  │
                         └───┬───────┬───┘
                    Drizzle  │       │ controlled server I/O
                     ┌───────▼──┐  ┌─▼────────────────────────┐
                     │PostgreSQL│  │ attachments / reports    │
                     │audit data│  │ backups / Pino logs      │
                     └──────────┘  └──────────────────────────┘
```

Boundaries:

- The renderer sends versioned HTTP requests and renders responses. It may preview calculations returned by the server, but it never decides the posted financial result.
- Preload exposes only named, typed operations needed for printing, save dialogs, window controls, and approved OS integration. Ordinary API access stays in renderer HTTP code.
- Electron main owns windows, navigation policy, permission handlers, external-link rules, and the lifecycle of OS-level operations. It contains no billing rules or database credentials.
- Fastify authenticates every protected request, checks granular permissions, validates input, calls domain/application services, maps known failures to the API error contract, and records technical metadata.
- Domain services own billing, posting, allocation, reversal, reconciliation, aging, suspension, numbering, and business-audit orchestration. Financial mutations execute in PostgreSQL transactions.
- Drizzle repositories isolate SQL and schema access. PostgreSQL constraints are the final guard against duplicate identifiers and duplicate billing.
- Attachments use a server-controlled root outside public static folders. Metadata and hashes live in PostgreSQL; access is authenticated through the API.
- PDF/XLSX generation happens server-side from the same authoritative query services used by screens. Electron only downloads, previews, saves, or prints the generated result.
- PostgreSQL dumps, attachment snapshots, manifests, and verification results form one backup set. Restore is an authorized maintenance workflow, not a renderer file-copy operation.

LAN deployment begins with one designated server PC or lab server hosting Fastify, PostgreSQL, and storage. Each client receives only `BCIS_API_BASE_URL`. Production-like LAN use should prefer TLS; if the laboratory cannot provide a local CA, document the controlled HTTP limitation and restrict firewall/network scope.

## 4. Repository Structure

The development tree will also be the submission staging tree. Empty placeholder folders are not created until their phase produces real content.

```text
lab-04-bcis-billing-system/
├── CODEX_BCIS_PLANNING_PROMPT.md        # preserved planning source
├── BCIS_IMPLEMENTATION_PLAN.md          # approved implementation roadmap
├── README.md                            # setup, commands, architecture, demo entry point
├── .gitignore                           # secrets, builds, local storage, evidence exclusions
├── .editorconfig                        # consistent student/team formatting
├── source/                              # all buildable source and workspace configuration
│   ├── package.json                     # workspace scripts only
│   ├── pnpm-lock.yaml                   # reproducible dependencies
│   ├── pnpm-workspace.yaml              # apps/* and packages/*
│   ├── tsconfig.base.json               # strict shared compiler policy
│   ├── eslint.config.js                 # shared lint rules
│   ├── apps/
│   │   ├── desktop/                     # Electron/electron-vite application
│   │   │   ├── electron.vite.config.ts
│   │   │   ├── electron-builder.yml
│   │   │   ├── components.json          # shadcn renderer configuration
│   │   │   └── src/
│   │   │       ├── main/                # windows, security, OS integration
│   │   │       ├── preload/             # narrow typed bridge
│   │   │       └── renderer/src/
│   │   │           ├── app/             # providers, router, shell, permission nav
│   │   │           ├── components/      # shared app composites
│   │   │           │   └── ui/          # generated shadcn primitives
│   │   │           ├── features/        # domain-facing screen modules
│   │   │           ├── lib/             # API client, query keys, formatting
│   │   │           └── styles/          # preset tokens and print styles
│   │   └── api/                         # Fastify application and domain authority
│   │       └── src/
│   │           ├── app/                 # server composition/plugins/error mapping
│   │           ├── config/              # validated server-only environment
│   │           ├── db/                  # Drizzle schema, client, repositories
│   │           ├── modules/             # vertical modules: routes/services/repos
│   │           ├── security/            # auth, sessions, RBAC, hashing
│   │           └── infrastructure/       # files, reports, backup, logging
│   └── packages/
│       └── shared/                      # public DTO schemas, enums, permissions
├── database/
│   ├── migrations/                      # reviewed Drizzle SQL migrations
│   └── seeds/                           # synthetic, repeatable demo seeds
├── docs/
│   ├── architecture/                    # decisions, diagrams, data dictionary
│   ├── technical-documentation.*
│   ├── user-manual.*
│   ├── erd.*
│   └── deployment-guide.md
├── tests/
│   ├── acceptance/                      # AT-01..AT-12 procedures/results
│   ├── fixtures/                        # synthetic test inputs
│   └── screenshots/                     # approved UI evidence
├── reports-samples/                     # sanitized PDF/XLSX outputs
└── release/                             # installer/checksums/release notes, not source
```

Organization rules:

- Use feature folders only where they group a real screen/API module; avoid one-file folders and speculative abstractions.
- Name domain operations as verbs (`postPayment`, `reversePayment`, `finalizeInvoice`) and stored records as nouns.
- Keep generated shadcn primitives in `components/ui`; compose them in app-specific components rather than repeatedly editing generated files.
- Keep comments brief and reserved for invariants, transaction boundaries, security decisions, and non-obvious financial rules. Do not narrate obvious code.
- Do not commit `.env`, databases, attachments, backups, logs, coverage, build output, or dependency folders.
- Final submission uses the same top-level `source`, `database`, `docs`, `tests`, `reports-samples`, and `release` folders; planning-only files may remain as project evidence or be omitted from the packaged release at instructor direction.

## 5. Domain Model / ERD Plan

Use UUID primary keys for business rows and human-readable numbers as separate unique fields. All timestamps are `timestamptz` stored in UTC; business dates and billing periods use PostgreSQL `date`. Money uses `bigint` centavos. Mutable master data has `created_at`, `updated_at`, and appropriate active/archive state; posted financial rows are append-only or status-transition-only.

### Security and system

| Entity | Important keys/relationships and constraints | History/delete rule |
|---|---|---|
| `users` | PK `id`; unique normalized `username`; password hash; active/locked state | Restrict delete when referenced; deactivate instead. |
| `roles` | PK; unique `code` | Restrict delete while assigned. |
| `permissions` | PK; unique dot-separated `code` | Seed-controlled; do not delete in normal UI. |
| `user_roles` | Composite unique `(user_id, role_id)` | Audited assignments. |
| `role_permissions` | Composite unique `(role_id, permission_id)` | Audited assignments. |
| `auth_sessions` | Hashed unique token, user FK, expiry/revocation/lock metadata | Expire/revoke; retain according to security policy. |
| `login_attempts` | Username/IP/device/time/success metadata without password | Append-only, retention policy required. |
| `audit_logs` | Actor FK nullable for system, action, entity type/id, reason, before/after safe JSON | Append-only; no ordinary update/delete route. |
| `application_settings` | Unique key, typed validated value, effective metadata | Important changes audited; financial setting history may require version rows. |
| `number_sequences` | Unique document type + period/scope, last value | Updated under row lock; never reset across issued numbers. |
| `backup_history` | Backup ID, manifest path, checksum, status, actor, verify/restore timestamps | Append-only operational history. |

### Subscribers, services, and collections

| Entity | Important keys/relationships and constraints | History/delete rule |
|---|---|---|
| `subscribers` | Unique account number; normalized searchable name/contact; status | Archive/terminate; restrict if financial history exists. |
| `subscriber_addresses` | Subscriber FK; address type; collection area FK optional; service-address flag | Soft-retire; snapshots protect historical documents. |
| `subscriber_contacts` | Subscriber FK; type/value/preferred | Soft-retire and audit material edits. |
| `service_types` | Codes `INTERNET`, `CABLE`, `COMBO` | Seeded reference rows. |
| `service_plans` | Unique code; type FK; name; current price; fees; speed/channel fields; active | Deactivate; invoices copy descriptions/rates. |
| `service_accounts` | Unique service number; subscriber, plan, installation address, collector; dates/rate/status | No hard delete after activation. |
| `service_events` | Service account FK; event type; old/new status; reason; actor/date | Append-only timeline. |
| `collectors` | FK to user optional; unique collector code; active | Deactivate, preserve assignments. |
| `collection_areas` | Unique code; name; active | Restrict if assigned; deactivate. |
| `collection_routes` | Area FK; unique code; ordered description/schedule | Version or deactivate after use. |
| `collector_assignments` | Collector, route/area, service account, effective dates; no overlapping active assignment | End-date rather than overwrite/delete. |

### Billing, ledger, payments, and documents

| Entity | Important keys/relationships and constraints | History/delete rule |
|---|---|---|
| `billing_cycles` | Unique period key; start/end/due metadata; lifecycle status | Closed cycles immutable. |
| `invoices` | Unique invoice number; service account/cycle FKs; unique finalized `(service_account_id, billing_cycle_id)`; totals/status/version | Draft may be replaced under rules; finalized rows never destructively edited. |
| `invoice_items` | Invoice FK; type, description snapshot, quantity basis, signed centavos, ordering | Immutable after finalization; cascade only if an unposted draft is deleted. |
| `adjustments` | Subscriber/service/invoice refs; debit/credit, reason, approval, status | Posted adjustment is immutable; correct with linked opposite entry. |
| `ledger_entries` | Subscriber and optional service account; reference type/id; exclusive debit/credit; immutable sequence/time | Append-only; reversing entries link to originals. |
| `payments` | Unique payment number; subscriber; method; amount; external reference; status; actor | Posted payment is never edited/deleted; reverse with separate record. |
| `payment_allocations` | Payment FK + invoice FK; positive amount; unique pair; sum cannot exceed payment/invoice due | Immutable when posted; reversal creates compensating records. |
| `subscriber_credits` | Source payment/adjustment; remaining centavos; status | Preserves unallocated advance; consumption produces allocation/link records. |
| `payment_proofs` | Payment intake FK; storage key, MIME, bytes, SHA-256; verification state/actor/time | Evidence retained; storage access authenticated. |
| `payment_reversals` | Unique original payment FK; reversing ledger refs; reason/approver/time | Append-only and one successful reversal per payment. |
| `receipts` | Unique receipt number; payment FK; status/issued/void metadata | Number remains reserved forever; void does not delete. |

### Batches and service control

| Entity | Important keys/relationships and constraints | History/delete rule |
|---|---|---|
| `collection_batches` | Unique batch number; collector/route; expected values; lifecycle status/version | Closed batches immutable; no silent rebalance. |
| `collection_batch_accounts` | Batch + service/invoice snapshot; unique pair; expected/collected status | Preserved as route-sheet evidence. |
| `collector_remittances` | Batch FK; method breakdown; remitted cash; difference; actor/time | Posted remittance is append-only/corrected formally. |
| `batch_reconciliations` | Batch FK; expected/remitted/non-cash/difference; approver/notes | One current closure record; corrections linked and audited. |
| `suspension_records` | Service account; reason; candidate/effective/approval/completion data | Never erase; linked service events. |
| `reconnection_records` | Service account/suspension; qualifying payment, fee invoice/item, technician/dates | Never erase; linked service events. |

Cardinality and ownership:

- Subscriber `1—N` addresses, contacts, service accounts, invoices (through service accounts), payments, ledger entries, and credits.
- Service account `N—1` plan and address; `1—N` invoices, service events, assignments, suspensions, and reconnections.
- Invoice `1—N` invoice items and `N—M` payments through allocations.
- Payment `1—N` proofs where policy permits resubmission; `1—N` allocations; `0—1` successful reversal; `1—1` receipt for a posted receiptable payment.
- Area `1—N` routes; collector `1—N` effective assignments and batches; batch `1—N` account snapshots, remittances, and reconciliation events.

Foreign keys default to `RESTRICT`. Cascades are limited to composition rows of an unposted parent (for example, draft invoice items) and never remove posted history. Proof metadata restricts payment deletion; the file cleanup service may remove only abandoned, unlinked uploads after a documented retention period.

Required indexes include normalized subscriber name, account number, contact value, address search support, service status/collector/area, invoice `(status, due_date)`, invoice service/cycle, payment `(paid_at, method)`, normalized external reference, ledger `(subscriber_id, occurred_at, id)`, batch collector/status, and assignment area/collector/effective dates. Add partial indexes for active/open rows only after query-plan evidence.

## 6. Financial Model

### Exact money

- PostgreSQL stores all monetary values as signed `bigint` centavos. The server uses TypeScript `bigint`; JSON contracts carry base-10 centavo strings such as `"99900"` or validated currency strings at human input boundaries.
- Shared helpers parse a strict two-decimal peso input into centavos and format centavos for display. No authoritative calculation uses JavaScript `number`, binary floats, or renderer-calculated totals.
- Every table has checks appropriate to the field: ordinary charges/payments are positive; debit/credit direction is explicit; exactly one ledger side is non-zero.

### Invoice and billing

- Billing builds a draft from an immutable plan/rate snapshot, validates the cycle and service eligibility, and finalizes the invoice and ledger debit in one transaction.
- A partial unique constraint on finalized, non-void invoice `(service_account_id, billing_cycle_id)` plus an idempotency key blocks duplicate billing. A conflict returns the already-created result where safe.
- Invoice totals equal item sums by server calculation. Drafts may change; finalized invoices and items do not. Corrections use void/credit/adjustment workflows with linked ledger entries.
- Required lifecycle values are `DRAFT`, `UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `VOID`, and `CREDITED`. Aging always derives from due date plus remaining allocated balance so a stale overdue badge cannot corrupt AR.

### Payments and allocation

- Posting locks the subscriber's relevant open invoices in due-date/invoice-number order, validates method/reference/proof state, allocates oldest-first, creates the payment, allocations, ledger credit, subscriber credit if any, receipt, and audit record in one transaction.
- Exact payment closes the invoice. Partial payment records one allocation and leaves a positive balance. Overpayment becomes an explicit subscriber credit; value is never discarded.
- A preview endpoint returns the proposed allocation but is non-authoritative. Confirming sends an idempotency key and the displayed snapshot/version; the server recalculates and rejects stale/concurrent results with `409 CONCURRENCY_CONFLICT`.
- Manual allocation is absent until an instructor-approved rule and permission are documented.

### Ledger

- Use a persisted, immutable journal (`ledger_entries`) because auditability and million-row scale favor explicit postings. Do not persist a mutable running balance.
- Statements derive the opening and running balance with ordered SQL/window queries using `(occurred_at, posting_sequence, id)`. The sum of debits minus credits is reproducible from source-linked entries.
- Tests reconcile every invoice/payment/adjustment/reversal to ledger entries and compare ledger balance with open invoices less available credits.

### Reversals, adjustments, receipts, and batches

- Reversal locks the original payment and affected invoices, rejects a duplicate reversal, creates a linked reversal record and compensating ledger debit, reverses allocation effects, restores invoice states, marks the receipt/payment reversed, and audits actor/reason in one transaction. Originals remain visible.
- Adjustment uses approval and a typed debit/credit reason. A posted adjustment is corrected only by a linked opposite adjustment.
- Receipt numbers come from a transactionally locked sequence row and a unique database constraint. A number is assigned only inside successful posting; an issued number is never reused, including after void/reversal.
- Reconciliation computes `difference = remitted cash - expected cash collected`. Zero permits authorized close; negative shortage and positive overage remain explicit and require notes/approval, never a forced value.

### Concurrency

- Use short PostgreSQL transactions, row locks for sequence/subscriber allocation/batch close, unique constraints as the final defense, optimistic version columns for editable masters and workflow states, and request idempotency records for retryable financial commands.
- A crash before commit leaves no posting. A lost HTTP response after commit is resolved by the idempotency key returning the existing result.

Clarifications required before Phase 4/5: whether an advance automatically applies to future bills, whether it is subscriber-wide or service-specific, invoice/receipt number format and reset policy, penalty/discount rules, and whether voiding a finalized invoice requires approval or a credit note.

## 7. Authentication / RBAC / Audit

Authentication uses username/password with Argon2id hashes and server-side opaque sessions. Only a random session token is returned; its hash is stored in PostgreSQL. The desktop keeps it in memory, so an app restart requires login and no reusable credential is written to renderer storage. Logout/revocation is server-side. Idle lock invokes a locked session state and requires password re-verification; absolute/idle timeouts are settings. Failed attempts are rate-limited, recorded without passwords, and can temporarily lock the account. Exact thresholds require instructor confirmation.

Every protected route declares required permissions and checks them in a Fastify authorization hook/service. UI permission checks only improve navigation and button visibility; a direct API call is still rejected. Bootstrap admin credentials come from a one-time setup/seed mechanism and must be changed, never hard-coded in source or committed fixtures.

### Permission matrix

Legend: `✓` granted by default, `A` approval/review only, `—` not granted. Owner can grant custom roles, but cannot remove the last active super-admin safeguard.

| Permission | Owner | Admin | Cashier | Collection Supervisor | Accounting/Auditor | Technician | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `subscriber.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `subscriber.create` / `subscriber.update` | ✓ | ✓ | — | — | — | — | — |
| `plan.manage` | ✓ | ✓ | — | — | — | — | — |
| `service.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `service.manage` | ✓ | ✓ | — | — | — | A | — |
| `billing.view` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `billing.generate` / `billing.adjust` | ✓ | ✓ | — | — | A | — | — |
| `payment.create` | ✓ | ✓ | ✓ | — | — | — | — |
| `payment.verify_gcash` | ✓ | ✓ | ✓* | — | A | — | — |
| `payment.reverse` | ✓ | A | — | — | A | — | — |
| `receipt.print` | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| `collection.manage_routes` | ✓ | ✓ | — | ✓ | — | — | — |
| `collection.manage_batch` | ✓ | ✓ | — | ✓ | — | — | — |
| `collection.record` | ✓ | ✓ | — | ✓ | — | — | — |
| `collection.reconcile` | ✓ | A | — | ✓ | A | — | — |
| `receivable.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `service.suspend` / `service.reconnect` | ✓ | ✓ | — | A | A | ✓* | — |
| `report.view` | ✓ | ✓ | ✓* | ✓ | ✓ | — | ✓ |
| `report.export` | ✓ | ✓ | — | ✓ | ✓ | — | ✓* |
| `audit.view` | ✓ | — | — | — | ✓ | — | — |
| `user.manage` / `role.manage` | ✓ | — | — | — | — | — | — |
| `settings.manage` | ✓ | A | — | — | — | — | — |
| `backup.create` | ✓ | A | — | — | — | — | — |
| `backup.restore` | ✓ | — | — | — | — | — | — |

`*` means intentionally scoped: Cashier GCash verification depends on separation-of-duties policy; Technician can complete approved work but not approve it; report access/export is limited to permitted report definitions and fields.

Business audit is append-only and records actor/session, action, UTC time, entity/reference, reason, safe before/after values, idempotency/correlation ID, and links for reversals/adjustments. Never store passwords, tokens, proof binary data, or private configuration in audit JSON. Audit queries are read-only and paginated.

## 8. API Plan

All routes live under `/api/v1`; list endpoints use validated cursor or page/size, allowlisted sort keys, bounded page sizes, structured filters, and a consistent envelope. Commands support idempotency where retries could duplicate money/documents.

| Group | Key actions and purpose | Primary permission | Query/transaction/conflict notes |
|---|---|---|---|
| `health` | Liveness, readiness, DB/storage checks | Public liveness; protected detail | No secrets; readiness can fail independently. |
| `auth` | Login, logout, me, lock, unlock | Authenticated/self | Rate limits; session revocation; generic login error. |
| `users`, `roles`, `permissions` | Manage accounts and role matrix | `user.manage`, `role.manage` | Pagination; optimistic versioning; last-admin guard. |
| `subscribers` | Search, create, profile, update/archive | subscriber permissions | Server search/sort/page; duplicate account/contact warning. |
| `plans`, `service-accounts` | Plan catalog and service lifecycle | plan/service permissions | Historical rates preserved; status transitions audited. |
| `billing`, `invoices` | Preview/generate cycles; list/detail/void/adjust | billing permissions | Highly transactional; idempotency + duplicate constraint. |
| `ledger` | Paginated entries, balance, SOA | `billing.view`/`receivable.view` | Stable ordering, date filters, derived running balance. |
| `payments` | Preview allocation, post, detail, reverse | payment permissions | Highly transactional; snapshot/version and idempotency. |
| `gcash-verification` | Queue, upload metadata, verify/reject | `payment.verify_gcash` | Reference dedup; state version; verified before posting. |
| `receipts` | View, preview, print payload, void history | `receipt.print` | Unique reserved number; immutable issued snapshot. |
| `areas`, `routes`, `collectors` | Master and assignment management | `collection.manage_routes` | Active/effective filters; overlap conflict. |
| `collection-batches` | Build route sheet, start, record, submit | `collection.manage_batch` | Transactional transitions; optimistic version. |
| `remittances`, `reconciliations` | Record cash/non-cash, compare, approve/close | `collection.reconcile` | Transactional; shortage/overage cannot be erased. |
| `receivables`, `aging` | Outstanding/overdue/candidates/buckets | `receivable.view` | Server aggregates; as-of date required; export parity. |
| `suspensions`, `reconnections` | Candidate, approve, assign, complete | service-control permissions | Audited workflow and state-machine conflicts. |
| `reports` | Definitions, parameters, jobs/download | report permissions | Server-calculated PDF/XLSX; bounded dates; async if needed. |
| `audit` | Search/view immutable business events | `audit.view` | Read-only, paginated, redacted. |
| `settings` | Operational policy and numbering configuration | `settings.manage` | Typed values; versioned/audited changes. |
| `backups` | Create, verify, history, restore preflight/execute | backup permissions | Maintenance lock; restore requires re-auth and confirmation. |
| `attachments` | Authorized upload/download/preview | contextual permission | MIME/size/hash validation; opaque IDs; no raw paths. |

Error envelope:

```json
{
  "error": {
    "code": "BUSINESS_RULE_VIOLATION",
    "message": "The payment cannot be reversed because the batch is closed.",
    "fieldErrors": {},
    "requestId": "...",
    "details": {}
  }
}
```

Codes cover validation `400`, authentication `401`, authorization `403`, not found `404`, duplicate/business conflict `409`, concurrency conflict `409`, attachment failure `415/422`, database unavailable `503`, and sanitized internal error `500`. SQL, stack traces, and filesystem paths never reach users.

## 9. Electron Security / IPC

- Create `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, sandbox enabled where electron-vite compatibility permits, disabled remote module, explicit preload path, and a restrictive Content Security Policy.
- Reject unexpected navigation and new-window requests; open allowlisted external links through a narrow main-process handler. Deny camera, microphone, geolocation, notifications, and other permissions unless a documented feature needs them.
- Preload exposes a frozen typed `window.bcis` API only for app version, save/export dialog, controlled print/preview, and session-safe OS operations. It never exposes `ipcRenderer`, filesystem, shell, process, environment, or arbitrary channel invocation.
- Validate IPC sender and payload on both sides and maintain channel names in a shared desktop-only contract. HTTP business calls do not pass through arbitrary IPC.
- Renderer receives only a public API base URL and build metadata. Database URLs, password pepper/secrets, file roots, signing credentials, and backup commands remain server-side.
- Package with electron-builder; keep platform signing and update strategy out of scope until instructor/environment decisions. Test both unpacked and installed builds, CSP, deep-link/navigation behavior, printing, and LAN configuration.

## 10. UI/UX + shadcn Plan

After electron-vite creates the renderer, run the known preset from the desktop package context so its aliases and Tailwind paths point to `src/renderer/src`, not a new Vite app. First capture the preset-generated `components.json`, CSS variables, radius, typography, and base component output in a dedicated commit. If the CLI cannot target the nested renderer cleanly, generate in a temporary disposable directory, compare the output, and manually reproduce only the preset configuration/tokens in the renderer; do not keep a second app. Record the exact successful command and version in README.

Apply the preset while mapping the required navy/blue/canvas/surface/semantic colors to CSS variables. Use Inter or Geist locally/bundled where licensing permits. Peso cells are right-aligned with tabular numerals; status uses text, icon where useful, and color. Maintain WCAG-conscious contrast, visible focus, keyboard navigation, 44px practical targets for primary actions, and reduced-motion behavior.

The desktop shell uses a permission-filtered Sidebar, compact header, breadcrumb, global search, user/session menu, connection indicator, and content area designed for 1366×768 and larger office displays. Avoid decorative cards and fake charts. Dense screens use sticky table headers, persistent filters, compact rows, explicit totals, and predictable row actions. Destructive or posted-financial actions use `AlertDialog` plus reason/confirmation and server revalidation.

Use shadcn primitives selectively: Sidebar, Button, Input, Form, Select/Combobox, Table, Badge, Tabs, Dialog, AlertDialog, Sheet, DropdownMenu, Command, Popover, Calendar, Pagination, ScrollArea, Tooltip, Skeleton, Alert, and Sonner. App-specific composites include `Money`, `StatusBadge`, `DataTable`, `FilterBar`, `EntityHeader`, `FinancialSummary`, `ConnectionBanner`, and `PermissionGate`.

Printing uses purpose-built receipt/SOA/report markup without navigation, controls, dark background, or clipped tables. Server output is authoritative; Electron preview and printer selection are presentation steps.

## 11. Screen-by-Screen Plan

All screens include keyboard focus, skeleton loading, useful empty state, retryable sanitized error state, offline/API-unavailable banner, and permission-safe actions. `API/domain` names identify dependencies, not renderer-owned logic.

| Screen | Purpose and roles | Actions and API/domain dependencies | Main UI / states / sensitivity |
|---|---|---|---|
| Login | Secure entry; all users | `auth/login`; authentication service | Form/Input/Button/Alert; generic failure, lockout; never reveal account existence. |
| Session Lock | Protect idle workstation; signed-in user | `auth/lock`, `auth/unlock` | Focused password dialog; no underlying sensitive detail; audit lock/unlock. |
| Dashboard | Role-specific operational summary | dashboard/report aggregates | KPI cards, compact tables/charts; empty date range; totals server-derived. |
| Subscriber List | Fast lookup; subscriber viewers | search/filter/page; subscriber query | DataTable/Command/Badge; no full load; row actions permission gated. |
| New Subscriber | Register subscriber/address/contact | subscriber create service | Grouped Form/Combobox; duplicate warning; confirm create; audited. |
| Subscriber Profile | Complete account view | profile, services, invoices, payments, ledger, collection, events, docs, audit | Tabs and summaries; tab-level loading; financial rows read-only. |
| Service Accounts | Search and manage active services | service CRUD/transition | DataTable/Sheet/Form; conflict state; transitions reasoned/audited. |
| Plans | Maintain Internet/Cable/Combo plans | plan create/update/deactivate | Table/Dialog/Form; future-only rate warning; no historical overwrite. |
| Current Billing | View cycle readiness/current charges | billing eligibility/summary | Table/filters/badges; explain excluded accounts; read-only totals. |
| Generate Billing | Preview then finalize a cycle | billing preview/generate | Stepper, table, AlertDialog; progress/idempotent retry; highest financial sensitivity. |
| Invoices | Search/filter invoice portfolio | invoice list | DataTable/date/status filters/export; server page; immutable status cues. |
| Invoice Detail | Explain charges, allocation, history | invoice detail/void/adjust | Items table/timeline/dialogs; reason and permission for corrections. |
| Receive Payment | Cashier-speed payment posting | subscriber balance, allocation preview, payment post | Search → balance → amount/method → preview → confirm → receipt; stale preview conflict handling. |
| Payment History | Find payments/receipts/reversals | payment list/detail | Dense table/filters; reversal action guarded and audited. |
| GCash Verification | Review queued evidence | proof preview, verify/reject/post | Two-pane queue + image preview; duplicate warning; reason confirmation and separation of duties. |
| Collectors | Manage collector records/assignments | collector service | Table/Form/Tabs; deactivate rather than delete; assignment history. |
| Areas & Routes | Configure collection geography | area/route/assignment services | Tree/table/forms; overlap conflict; changes audited. |
| Collection Batches | Create/run/submit route batches | batch lifecycle/record collection | DataTable/status timeline/Sheet; optimistic version; expected values frozen. |
| Reconciliation | Compare expected/remitted cash | remittance/reconciliation | FinancialSummary, exception table, AlertDialog; difference always visible; close audited. |
| Outstanding | Current open balances | receivable query/export | Table/KPIs/filter bar; as-of date; authoritative server totals. |
| Overdue | Actionable delinquent accounts | overdue query | Dense table with subscriber/service/area/collector/months/oldest/last payment/arrears; no client aging. |
| AR Aging | Reconcile bucketed receivables | aging aggregate/detail/export | Bucket summary + drill-down; explicit as-of/timezone; export parity required. |
| Suspension Candidates | Review policy matches | candidate query/approve | Table/reason Sheet; no automatic destructive service change; approval audited. |
| Suspension/Reconnection | Track service-control work | suspend/reconnect workflow | Tabs/timeline/forms; qualifying payment and technician info; state transitions confirmed. |
| Reports | Run/download allowed reports | report definitions/jobs | Parameter Form, history table, PDF/XLSX actions; long-job state; data scope permissions. |
| Administration | Safe entry to privileged areas | module links/status | Permission cards/list; no fake settings; inaccessible modules absent and API-protected. |
| Users/Roles/Permissions | Account and matrix administration | user/role services | Tables, checkbox matrix, dialogs; last-admin safeguard, re-auth for critical changes. |
| Audit | Investigate immutable activity | audit query/detail | Read-only DataTable/JSON-safe diff; filters/page/export policy; no edit/delete. |
| Backup/Restore | Create/verify/restore backup sets | backup service | History table/progress/AlertDialog; restore preflight, re-auth, typed confirmation, maintenance mode. |
| Settings | Configure approved policies | settings read/update | Sectioned forms; version conflict; high-impact changes explain effective date and audit. |

Subscriber Profile tabs are Overview, Services, Billing, Payments, Ledger, Collection, Service History, Documents, and Audit; the Audit tab is shown only with `audit.view` or an approved entity-scoped alternative.

## 12. Server State / Client State

- TanStack Query owns remote server state. Query keys are centralized by resource plus normalized filters, page, sort, and as-of date.
- List data uses bounded stale times and keeps prior page data during navigation. Financial detail used before posting is explicitly refetched; posting never trusts cache totals.
- Successful commands invalidate the smallest safe set: payment posting invalidates subscriber balance, invoices, payments, ledger, receipts, dashboard, AR, and any open batch involving the account. Reversal and billing have similarly documented invalidation maps.
- Mutation responses update immediate detail only when returned as one authoritative transaction result; broad aggregates refetch.
- Local state is limited to navigation, open dialogs, draft filters, table column preferences, and form state. Do not mirror server entities in a global client store.
- React Hook Form owns unsaved form state. Unsaved-navigation warnings apply to meaningful edits. Financial confirmation snapshots are short-lived and carry server version/idempotency data.
- API unavailable and stale data are visible. Disable financial confirm when the preview is expired or connectivity is lost; never queue offline financial mutations silently.

## 13. Forms / Validation

Shared Zod schemas define public DTO shape and serializable enums; the API revalidates every input and applies domain/database rules independently. React Hook Form uses the same safe field schemas for immediate feedback, but client validation is never authorization.

- Normalize whitespace, usernames, account searches, phone input, and external references deliberately; preserve human display values where needed.
- Currency input accepts Philippine peso text with at most two decimals, converts to a centavo string, rejects exponent/float forms, and displays the parsed confirmation amount.
- Dates distinguish business date from timestamp. The server owns due-date and aging calculations using the configured business timezone.
- Map `fieldErrors` to controls and business/conflict errors to a form-level Alert. Retain safe user input after recoverable errors.
- Posted-financial confirmations show account, method, exact amount, allocation, receipt behavior, and consequences. Reversal, void, reconcile, restore, suspension, and permission changes require a reason or explicit confirmation as policy dictates.
- Attachment controls validate early for UX, while the server independently checks bytes, MIME signature, size, filename handling, and storage destination.

## 14. Tables / Search / Pagination

- TanStack Table handles presentation, column definitions, selection, and sort/filter intent; the server performs authoritative search, filter, sort, and pagination.
- Default maximum page size is 100 (lower for heavy joins). Allowlist columns and operators to avoid arbitrary SQL behavior.
- Global search routes safely across account/name/contact/address/receipt/invoice/GCash reference, returning typed result groups rather than one unbounded query.
- Use cursor pagination for append-heavy audit/ledger/payment feeds and page-based pagination where users require direct page navigation. Stable ordering always includes a unique tie-breaker.
- Debounce search, cancel obsolete requests, preserve filter state in route search parameters, and expose clear/reset actions.
- Virtualize only long, already bounded route-sheet/detail views where measurement proves benefit. Never use virtualization as a substitute for server pagination.
- Export endpoints re-run the same validated filter/query definition on the server and record report parameters so UI totals and exported totals reconcile.

## 15. Reports / Printing

The API owns report definitions, authorization, calculations, parameter validation, data snapshots, and generation using pdfmake and ExcelJS. A shared report query service feeds both on-screen summaries and exports to prevent formula drift.

Minimum reports: daily/weekly/monthly/annual collections; payment-method summary; billing vs collection; revenue by plan/service/area; outstanding and aging; subscriber master; ledger/SOA; collector assignments, remittance, difference, and performance; adjustments/reversals; voided receipts; and user/audit activity where permitted.

PDFs include title, parameters/as-of date, generated time/user, page numbers, column headings, peso formatting, and continuation headers. XLSX files use typed dates/numbers where safe, frozen headers, filters, sensible widths, formula-injection escaping for user text, and a parameter/metadata sheet. Receipts preserve the issued snapshot and void watermark/history. SOA opening balance plus period activity must reconcile to closing balance.

For small results, return a streamed download. For large reports, create a bounded server job with status and expiring authorized download; do not block the renderer. Retain sanitized sample outputs in `reports-samples/` and compare totals during acceptance testing.

## 16. Attachments

GCash proofs follow `upload → quarantined validation → pending metadata → authorized preview → verify/reject → retention/backup`.

- Store under a configured server root using generated opaque keys, never user paths. Resolve paths and assert they stay inside the root.
- Initially allow only instructor-approved JPEG/PNG (optionally PDF after clarification), with MIME signature validation, pixel/size limits, a conservative default maximum such as 5 MB, SHA-256 hash, and normalized metadata.
- Serve only through authenticated, permission-checked endpoints with safe content headers; never expose the storage root as static public files.
- External reference normalization and an indexed fingerprint support duplicate detection. A proof image is evidence only; an authorized person must verify it before payment posting.
- Rejecting evidence retains actor/time/reason and follows a documented retention rule. Orphan uploads are cleaned only by a safe scheduled job with database cross-checks.
- Backup manifests include attachment count/hashes; restore verifies that database metadata and files agree.

## 17. Backup / Restore

1. Authorized user starts backup; API checks storage/DB readiness and creates a backup-history row.
2. Acquire an application-level backup coordination lock. Use `pg_dump` in a documented consistent format and snapshot attachments plus a manifest containing versions, counts, hashes, timestamps, and configuration identifiers (not secrets).
3. Write to a temporary server directory, verify dump readability and file hashes, then atomically mark/move the set complete. Record outcome and audit actor.
4. Copy completed sets to instructor-approved external/off-host storage manually or through a documented operator step; a backup on the same disk is not disaster recovery.
5. Restore requires `backup.restore`, recent re-authentication, typed confirmation, preflight compatibility/disk/checksum checks, and maintenance mode that blocks client mutations.
6. Before restore, create a safety backup where possible. Restore into a clean temporary/test database first for routine verification; run migrations/version and integrity/reconciliation checks, verify attachments, then follow the documented controlled cutover.
7. Record restore actor, source backup, start/end, result, checks, and incident notes without logging credentials.

AT-12 must prove data returns after backup, a controlled test change, and restore. The deployment guide includes PostgreSQL tool versions, paths, service stop/start order, rollback steps, and periodic restore-test schedule. Instructor approval is required on whether the live lab environment permits in-place restore during demonstration.

## 18. Logging / Error Handling

Pino produces structured technical logs with request/correlation ID, route, status, duration, service error code, and safe diagnostic context. Development may use readable transport; deployed logs are rotating JSON with restricted filesystem permissions and a retention limit. Redact authorization headers, cookies/tokens, passwords, DB URLs, sender proof data, and private file paths.

Business audit is separate PostgreSQL data and cannot be replaced by Pino logs. Domain services emit audit entries in the same transaction as financial/status changes. Audit storage failures abort protected mutations.

Expected domain errors are typed and mapped centrally to the API contract. Unknown errors return a generic message plus request ID and retain the internal stack only in server logs. The desktop maps offline, timeout, validation, authorization, conflict, and maintenance errors to actionable UI. A global boundary catches renderer failures without showing secrets and offers a safe restart/retry path.

## 19. Seed / Demo Data

Use deterministic synthetic names, references, addresses, and phone patterns clearly marked for demonstration. Seed scripts are idempotent by stable codes and never run automatically against an unrecognized database.

| Seed module | Minimum content |
|---|---|
| `01-security` | 5+ users covering Owner/Admin, Cashier, Collection Supervisor, Auditor/Viewer, and Technician; roles/permissions; development-only credentials documented outside Git or generated at run time. |
| `02-catalog` | 3 Internet, 2 Cable, 2 Combo plans; required service types/settings. |
| `03-collections` | 2 collectors, 3 areas, routes and effective assignments. |
| `04-subscribers` | 50 subscribers, 60+ service accounts, multiple-address/service examples. |
| `05-billing` | At least 3 billing months, finalized invoices, 10+ overdue accounts across all aging buckets. |
| `06-payments` | Cash and GCash, exact/partial/advance, pending/verified/rejected proof cases, safe fake references. |
| `07-exceptions` | One approved reversal/void, balanced and shortage batches, 2+ suspension/reconnection scenarios. |

Seeds run through domain-safe builders where practical or reviewed SQL fixtures designed for test setup; they must preserve financial invariants. Never include real customers, GCash details, reusable production passwords, or production endpoints.

## 20. Acceptance Test Matrix

| ID | Scenario | Test layer | Setup | Expected result | Modules | Evidence |
|---|---|---|---|---|---|---|
| AT-01 | Exact payment | Domain + API integration + Electron E2E | Finalized ₱999 invoice; pay ₱999 | ₱0 remaining, `PAID`, balanced ledger, unique receipt | billing, payment, allocation, ledger, receipt | Test output, API/DB assertions, receipt screenshot/PDF |
| AT-02 | Partial payment | Domain + API integration + E2E | ₱999 invoice; pay ₱500 | ₱499 remains, `PARTIALLY_PAID`, exact allocation/ledger | payment, invoice, ledger | Assertions and payment/profile screenshots |
| AT-03 | Advance payment | Domain + API integration + E2E | Monthly ₱1,000; pay ₱3,000 | No lost value; approved policy creates explicit credit/allocation | payment, credit, ledger | Reconciliation assertion and UI evidence; blocked until policy approved |
| AT-04 | Oldest-first arrears | Domain + API integration | Aug ₱999 + Sep ₱999; pay ₱1,200 | Aug ₱0; Sep ₱798; deterministic allocations | allocation, invoice, ledger | Allocation rows and balance assertion |
| AT-05 | Duplicate GCash reference | API integration + E2E | Submit normalized duplicate reference | Blocked or warned exactly per approved policy; audit retained | proof, GCash verification | `409`/workflow output and UI warning |
| AT-06 | Payment reversal | Domain + API integration + E2E | Reverse posted allocated payment with reason | Original visible, linked compensation, balance restored, actor/reason audited | reversal, allocation, ledger, audit, receipt | DB links, audit view, before/after screenshots |
| AT-07 | Balanced remittance | Domain + API integration + E2E | Collected/remitted ₱20,000 | Difference ₱0; authorized reconcile/close | batch, remittance, reconciliation | State assertions and reconciliation screenshot |
| AT-08 | Collector shortage | Domain + API integration + E2E | Collected ₱20,000; remit ₱19,500 | ₱500 shortage remains visible; close policy enforced | reconciliation, audit | Assertions, exception screenshot/report |
| AT-09 | Concurrent users | Infrastructure/concurrency + E2E/manual | 2–3 clients post/generate simultaneously | No corrupt state, duplicate numbers/billing, or cross-session effects | sequences, billing, payments, sessions | Parallel test log, DB constraints, three-client recording |
| AT-10 | Authorization | API integration + E2E | Cashier directly calls admin endpoint | Server returns `403`; no state/audit mutation except access log | RBAC, routes | HTTP assertion and role UI screenshot |
| AT-11 | Duplicate billing | Domain + API integration + concurrency | Generate same service/cycle twice/retry | One finalized invoice/ledger debit; idempotent/conflict response | billing, DB constraints | Parallel output and row-count assertion |
| AT-12 | Backup/restore | Infrastructure/manual acceptance | Backup; alter controlled test data; restore | Integrity checks pass and expected data/files return | backup, DB, attachments | Manifest/checksums, command log, before/after query/screenshots |

Each defect record captures reproduction, expected/actual, severity, root cause, fix commit, and regression test. Financial acceptance evidence includes centavo-level balance queries, not screenshots alone.

## 21. Performance / Concurrency

Target at least 20,000 subscribers, 500,000 invoices, 500,000 payments, and 1,000,000 ledger entries.

- Performance-sensitive paths: global search, invoice/overdue lists, ledger/SOA, oldest-first allocation, billing generation, payment history, GCash reference lookup, dashboard aggregates, AR aging, batch building, audit search, and PDF/XLSX exports.
- Select only needed columns; batch related queries; avoid per-row service calls/N+1; inspect `EXPLAIN (ANALYZE, BUFFERS)` against generated scale fixtures before adding indexes.
- Use server pagination, bounded date ranges for expensive reports, streaming/chunked exports, and possibly materialized/reporting views only after baseline evidence. Do not cache authoritative balances in renderer.
- Unique constraints protect subscriber/service/invoice/receipt numbers and finalized service-cycle billing. Normalized GCash reference/fingerprint rules are finalized before indexing.
- Lock scope stays narrow and consistent to avoid deadlocks. Retry only known serialization/deadlock errors with a bounded policy and the same idempotency key.
- Three-client tests cover simultaneous login, subscriber edits, invoice generation, payment posting, numbering, batch transitions, and authorization isolation under realistic LAN latency/API restart.
- Define measurable budgets in Phase 1/3 (for example, ordinary paged queries under 500 ms and posting under 2 s on lab hardware) only after the actual server hardware is known.

## 22. File-by-File Implementation Map

Paths are planned; dependency-generated files are intentionally omitted.

| Path | Action | Purpose / responsibility | Dependencies | Phase |
|---|---|---|---|---|
| `CODEX_BCIS_PLANNING_PROMPT.md` | KEEP | Original planning requirements | None | 1 |
| `BCIS_IMPLEMENTATION_PLAN.md` | KEEP/MODIFY after approval | Approved roadmap and decisions | Lab PDF/approval | 1–10 |
| `.gitignore`, `.editorconfig`, `README.md` | CREATE | Safe repo hygiene, formatting, student entry point | Approved tools | 1 |
| `source/package.json`, `source/pnpm-workspace.yaml`, `source/pnpm-lock.yaml` | CREATE | Reproducible workspace and scripts | pnpm/Node | 1 |
| `source/tsconfig.base.json`, `source/eslint.config.js` | CREATE | Strict TS and lint baseline | TypeScript/ESLint | 1 |
| `source/apps/desktop/electron.vite.config.ts` | CREATE | Build main/preload/renderer correctly | electron-vite | 1 |
| `source/apps/desktop/electron-builder.yml` | CREATE | Installer/release packaging | electron-builder | 1, 9 |
| `source/apps/desktop/components.json` | CREATE | shadcn aliases/preset config for nested renderer | shadcn preset | 1 |
| `source/apps/desktop/src/main/index.ts` | CREATE | Secure window lifecycle and navigation policy | Electron | 1, 9 |
| `source/apps/desktop/src/main/ipc.ts` | CREATE | Allowlisted OS IPC handlers | Electron/Zod | 1, 8 |
| `source/apps/desktop/src/preload/index.ts`, `types.d.ts` | CREATE | Narrow typed `window.bcis` bridge | Electron | 1 |
| `source/apps/desktop/src/renderer/src/app/providers.tsx` | CREATE | Query/router/form/error providers | React/TanStack | 1 |
| `source/apps/desktop/src/renderer/src/app/router.tsx` | CREATE | Permission-aware screen routing | React Router/RBAC | 1–8 |
| `source/apps/desktop/src/renderer/src/app/AppShell.tsx` | CREATE | Desktop navigation and connection state | shadcn | 1–2 |
| `source/apps/desktop/src/renderer/src/app/navigation.ts` | CREATE | Single permission-tagged navigation model | shared permissions | 2 |
| `source/apps/desktop/src/renderer/src/lib/api-client.ts` | CREATE | Typed HTTP/error/session client | shared contracts | 1–2 |
| `source/apps/desktop/src/renderer/src/lib/query-keys.ts` | CREATE | Stable query/cache keys | TanStack Query | 1–8 |
| `source/apps/desktop/src/renderer/src/lib/money.ts` | CREATE | Display-only centavo formatting | shared money schema | 1 |
| `source/apps/desktop/src/renderer/src/styles/globals.css`, `print.css` | CREATE | Preset tokens and clean printing | Tailwind/shadcn | 1, 8 |
| `source/apps/desktop/src/renderer/src/components/ui/*` | CREATE selectively | Unmodified/minimally modified generated primitives | shadcn | as needed |
| `source/apps/desktop/src/renderer/src/components/DataTable.tsx` | CREATE | Consistent server-driven tables | TanStack Table | 3 |
| `source/apps/desktop/src/renderer/src/features/auth/*` | CREATE | Login/lock UI and session hooks | auth API | 2 |
| `.../features/subscribers/*`, `.../features/services/*` | CREATE | Subscriber/plan/service screens | related APIs | 3 |
| `.../features/billing/*`, `.../features/ledger/*` | CREATE | Billing/invoice/ledger screens | billing APIs | 4 |
| `.../features/payments/*`, `.../features/gcash/*` | CREATE | Posting/history/proof verification UI | payment APIs | 5 |
| `.../features/collections/*` | CREATE | Collectors/routes/batches/reconciliation UI | collection APIs | 6 |
| `.../features/receivables/*`, `.../features/service-control/*` | CREATE | Aging and suspension/reconnection UI | AR/service APIs | 7 |
| `.../features/dashboard/*`, `.../features/reports/*` | CREATE | Operational dashboard/report UI | report APIs | 8 |
| `.../features/admin/*`, `.../features/backups/*` | CREATE | Users/settings/audit/backup UI | admin APIs | 2, 9 |
| `source/apps/api/src/server.ts`, `app/build-app.ts` | CREATE | Fastify entry/composition | Fastify | 1 |
| `source/apps/api/src/config/env.ts` | CREATE | Zod-validated server-only environment | Zod | 1 |
| `source/apps/api/src/app/error-handler.ts` | CREATE | Typed sanitized API error contract | Fastify | 1 |
| `source/apps/api/src/app/auth-plugin.ts` | CREATE | Session authentication and permission guard | security services | 2 |
| `source/apps/api/src/db/client.ts` | CREATE | PostgreSQL/Drizzle lifecycle | Drizzle/pg | 1 |
| `source/apps/api/src/db/schema/*.ts` | CREATE by domain | Schema definitions and constraints | Drizzle | 2–9 |
| `source/apps/api/src/security/{password,session,authorization}.ts` | CREATE | Argon2, opaque sessions, RBAC | DB/config | 2 |
| `source/apps/api/src/modules/*/{routes,schemas,service,repository}.ts` | CREATE per phase | Thin routes, validated contracts, domain rules, persistence | shared/DB | 2–9 |
| `source/apps/api/src/modules/billing/billing.service.ts` | CREATE | Invoice generation/finalization transaction | DB/ledger/sequence | 4 |
| `source/apps/api/src/modules/ledger/ledger.service.ts` | CREATE | Immutable postings and statement queries | DB | 4 |
| `source/apps/api/src/modules/payments/payment.service.ts` | CREATE | Preview/post oldest-first allocation | DB/ledger/receipt | 5 |
| `source/apps/api/src/modules/payments/reversal.service.ts` | CREATE | Compensating reversal workflow | DB/audit | 5 |
| `source/apps/api/src/modules/collections/reconciliation.service.ts` | CREATE | Remittance and visible differences | DB/audit | 6 |
| `source/apps/api/src/modules/receivables/aging.service.ts` | CREATE | Authoritative as-of aging query | DB | 7 |
| `source/apps/api/src/infrastructure/files/storage.ts` | CREATE | Safe proof/report storage | Node FS/config | 5 |
| `source/apps/api/src/infrastructure/reports/*` | CREATE | Shared queries, PDF/XLSX renderers | pdfmake/ExcelJS | 8 |
| `source/apps/api/src/infrastructure/backup/*` | CREATE | Backup/verify/restore orchestration | PostgreSQL tools/storage | 9 |
| `source/packages/shared/src/{contracts,enums,permissions,money}.ts` | CREATE | Public schemas/types/serialization only | Zod | 1–2 |
| `database/migrations/*.sql` | CREATE incrementally | Reviewed schema evolution | Drizzle Kit | 2–9 |
| `database/seeds/*.ts` | CREATE incrementally | Deterministic synthetic demo data | API schema/domain | 2–7 |
| `.env.example`, `source/apps/*/.env.example` | CREATE | Document non-secret configuration boundaries | Config schemas | 1 |
| `tests/acceptance/AT-*.md` | CREATE incrementally | Procedures, outcomes, evidence links | built features | 4–10 |
| `docs/architecture/{context,erd,financial-invariants,security}.md` | CREATE/MODIFY | Defense-ready design decisions | implementation evidence | 1–10 |
| `docs/deployment-guide.md` | CREATE | LAN, PostgreSQL, API, clients, backup/restore | deployment result | 9 |
| `docs/technical-documentation.*`, `docs/user-manual.*` | CREATE | Final deliverables | completed system | 10 |
| `reports-samples/*`, `release/*` | CREATE from verified builds | Sanitized outputs and installer | reports/build | 8–10 |

## 23. Phased Implementation Plan

### Phase 1 — Analysis and Project Foundation

**Goal:** Convert the approved blank project into a reproducible, secure workspace skeleton with a running Electron shell, Fastify health endpoint, PostgreSQL connection, test/lint baseline, and documented architecture.

**Prerequisites:** Plan approval; official lab PDF or recorded absence; Node/pnpm/PostgreSQL and target OS versions; API host/port decision.

**Backend/API Work:** Initialize Fastify, Pino redaction, environment validation, error envelope, liveness/readiness, graceful shutdown, and request IDs.

**Database/Migration Work:** Configure Drizzle and test connection only; draft schema/ERD review. Do not create business tables until their phase. Establish migration commands and a harmless connection smoke test.

**Electron/Frontend Work:** Initialize electron-vite with React/strict TypeScript; secure BrowserWindow, preload types, API connectivity page, router/providers, baseline shell.

**shadcn Components/Screens:** Integrate preset `b2D0xPXaU` in the nested renderer; capture tokens; add only Button, Alert, Sidebar/Skeleton components needed for shell/health state.

**Tests:** Typecheck/lint/Vitest smoke tests; API health integration; Electron launch/security configuration test.

**Security Review:** Confirm no secrets in renderer/Git, context isolation on, Node integration off, CSP/navigation rules, config separation, log redaction.

**Financial Review:** Approve centavo/bigint serialization, ledger strategy, transaction/idempotency conventions before business implementation.

**Files Affected:** Root hygiene/README; workspace configs; desktop/api/shared foundations; env examples; architecture docs.

**Checkpoint Evidence:** Clean install; commands pass; Electron shows real API/DB readiness; architecture diagram; shadcn token screenshot; no business feature mocks.

**Suggested Git Commit/Tag:** `chore: initialize secure BCIS workspace`; tag `cp1-foundation` after review.

**Definition of Done:** A new student can follow README on a clean machine, run API and Electron, see readiness, run checks, and explain boundaries without any billing tables or screens existing.

### Phase 2 — Authentication and RBAC

**Goal:** Deliver server-enforced identity, sessions, granular permissions, login/lock flows, and auditable user administration.

**Prerequisites:** Phase 1; agreed timeout/lockout/password policies and role matrix.

**Backend/API Work:** Auth/user/role endpoints, Argon2id, opaque session lifecycle, failed-login controls, authorization hook, last-admin safeguard, audit emission.

**Database/Migration Work:** Users, roles, permissions, junctions, sessions, login attempts, audit logs; indexes/constraints; seed role codes and one bootstrap admin safely.

**Electron/Frontend Work:** Login, lock/unlock, logout, auth provider, protected routes, permission-aware navigation, user/role management.

**shadcn Components/Screens:** Form, Input, Button, Alert, Dialog, Table, Checkbox permission matrix, DropdownMenu.

**Tests:** Hash/session unit tests; login/rate-limit/session expiry API tests; every protected route default-deny; AT-10; Electron login/lock/navigation E2E.

**Security Review:** Token never persisted in renderer; generic failures; session revocation; role escalation/IDOR checks; audit redaction.

**Financial Review:** Financial permissions exist but no posting route yet; ensure least privilege and approval roles are explicit.

**Files Affected:** Security/shared permission modules, auth/user/role API modules, migration/seed, auth/admin UI, audit foundation.

**Checkpoint Evidence:** Working login and lock, seeded admin setup instructions, permission matrix, direct-API cashier rejection, audit rows.

**Suggested Git Commit/Tag:** `feat: add authentication and server RBAC`; tag `cp2-auth-rbac`.

**Definition of Done:** Sessions can be created/revoked/locked, inactive users cannot enter, APIs enforce permission independently of UI, and authorization tests pass.

### Phase 3 — Plans, Subscribers, Service Accounts

**Goal:** Establish validated master data, effective collection assignments, fast search, and complete subscriber/service history.

**Prerequisites:** Phase 2; account/service numbering and required identity/address fields clarified.

**Backend/API Work:** Plans, subscribers, contacts/addresses, service accounts/events, collectors/areas/routes/assignments; server search/page/sort; archive/deactivate transitions.

**Database/Migration Work:** Relevant master/history tables, unique account/service/plan codes, effective assignment constraints and search indexes.

**Electron/Frontend Work:** Subscriber list/new/profile, plans, service accounts, collectors and assignment basics; reusable DataTable/FilterBar/forms.

**shadcn Components/Screens:** Table, Badge, Pagination, Command/Combobox, Tabs, Form, Sheet, Dialog, Calendar/Date Picker, Skeleton/Alert.

**Tests:** Validation/normalization, uniqueness, archived history, rate-snapshot preparation, assignment overlap, pagination/search query plans, UI CRUD E2E.

**Security Review:** Field-level response review, IDOR tests, permission checks, no hard delete of referenced masters.

**Financial Review:** Current rate represented in centavos; plan changes affect future billing only; historical snapshot contract ready.

**Files Affected:** Subscriber/services/collector modules and schemas; migrations/seeds; desktop features; search tests.

**Checkpoint Evidence:** 50 synthetic subscribers/60+ services searchable; profile and service history; validation and query-plan output.

**Suggested Git Commit/Tag:** Feature-sized commits per master module; tag `cp3-subscriber-services`.

**Definition of Done:** Required master data is usable and auditable, duplicates are constrained, and lists remain server-driven at target-like volume.

### Phase 4 — Billing and Ledger Engine

**Goal:** Generate immutable monthly invoices and reproducible ledger debits without duplicate billing.

**Prerequisites:** Phase 3; approved period/due-date/numbering/penalty/discount/void rules and financial invariants.

**Backend/API Work:** Billing preview/eligibility, cycle lifecycle, transactional finalize, sequence service, invoice queries/detail, adjustment/void rules, ledger posting and SOA query.

**Database/Migration Work:** Cycles, sequences, invoices/items, adjustments, ledger entries, idempotency records; finalized service-cycle unique constraint and financial checks.

**Electron/Frontend Work:** Current Billing, Generate Billing, Invoices, Invoice Detail, Ledger/SOA profile tab with server preview and conflict handling.

**shadcn Components/Screens:** Dense tables, filters, status badges, step/summary layout, AlertDialog, progress/toast, print-ready SOA preview.

**Tests:** Money/parser unit tests; invoice item total and ledger invariants; duplicate/concurrent generation AT-11; crash/rollback injection; pagination/SOA balance tests.

**Security Review:** Billing permissions, bounded bulk operations, input allowlists, audit within transaction, immutable finalized records.

**Financial Review:** Centavo totals, snapshot rates, debit balance, due dates, status transitions, void/credit behavior, sequence/idempotency.

**Files Affected:** Billing/invoice/ledger/sequence modules, schemas/migration, related desktop features, acceptance files.

**Checkpoint Evidence:** Generator produces one invoice/debit per eligible account/cycle; duplicate run proof; statement reconciliation output.

**Suggested Git Commit/Tag:** `feat: add transactional billing and ledger`; tag `cp4-billing-ledger`.

**Definition of Done:** Finalized invoices are immutable, duplicate billing is database-blocked, ledger balances reproduce, and Phase 4 tests pass.

### Phase 5 — Payments, Allocation, Receipts

**Goal:** Post exact, partial, and approved advance payments; issue receipts; verify GCash evidence; reverse safely.

**Prerequisites:** Phase 4; approved advance, manual allocation, GCash dedup/separation, receipt numbering, proof format/retention policies.

**Backend/API Work:** Allocation preview/post, oldest-first locking, subscriber credits, receipt generation, proof upload/serve, GCash queue/verify/reject, reversal transaction and audit.

**Database/Migration Work:** Payments, allocations, credits, proofs, reversals, receipts, reference fingerprint/idempotency/unique constraints.

**Electron/Frontend Work:** Cashier payment flow, history/detail, receipt preview/print, two-pane GCash verification, reversal dialogs and refreshed balances.

**shadcn Components/Screens:** Command search, money Form, RadioGroup/Select, allocation table, AlertDialog, two-pane Resizable layout if needed, image preview, Badge/Sonner.

**Tests:** AT-01–AT-06; concurrent double post; receipt uniqueness; file traversal/MIME/size; stale preview; reversal after batch/receipt states; E2E print.

**Security Review:** Proof authorization, opaque file paths, upload limits, payment/reversal permissions, reasons, no sensitive logs.

**Financial Review:** Allocation sums, credit conservation, invoice/ledger/receipt state, compensating reversal, transaction rollback and idempotent retry.

**Files Affected:** Payment/proof/receipt/storage modules and migration; desktop payment/GCash UI; tests/evidence.

**Checkpoint Evidence:** All payment variants reconcile, receipt prints, duplicate GCash rule shown, reversal restores balance with linked audit.

**Suggested Git Commit/Tag:** Split proof, posting, and reversal commits; tag `cp5-payments`.

**Definition of Done:** No posted payment can be destructively edited, every centavo is allocated or explicit credit, and AT-01–AT-06 pass under approved policies.

### Phase 6 — Collector / Remittance

**Goal:** Operate route batches from assignment through collection, remittance, visible difference, reconciliation, and close.

**Prerequisites:** Phase 5; batch snapshot, cash/non-cash handling, shortage/overage approval, and collector access rules clarified.

**Backend/API Work:** Batch build/start/record/submit, route-sheet query, remittance, reconciliation/close state machine, collector reports.

**Database/Migration Work:** Batch accounts, remittances, reconciliations and constraints/versioning; preserve assignment/receivable snapshots.

**Electron/Frontend Work:** Collector/route refinements, batch list/detail, collection recording, route print, reconciliation exception UI.

**shadcn Components/Screens:** Table/Tabs/Sheet/Form, status timeline, FinancialSummary, AlertDialog, printable route sheet.

**Tests:** State transition/unit tests; duplicate collection/concurrency; AT-07/AT-08; unauthorized close; batch/report reconciliation.

**Security Review:** Supervisor scoping, approval separation, immutable closed batch, audited notes/differences.

**Financial Review:** Expected cash, posted cash, non-cash, remittance, shortage/overage formulas and links to payments/ledger.

**Files Affected:** Collection/remittance/reconciliation modules and UI, migrations/seeds, acceptance evidence.

**Checkpoint Evidence:** Balanced and shortage scenarios, route sheet, closed batch constraints, collector report matching entries.

**Suggested Git Commit/Tag:** `feat: add collector batch reconciliation`; tag `cp6-collections`.

**Definition of Done:** Lifecycle is enforced, every difference remains visible, and reconciled totals trace to source payments.

### Phase 7 — Receivables / Service Control

**Goal:** Provide authoritative outstanding/overdue/aging views and controlled suspension/reconnection workflows.

**Prerequisites:** Phases 4–6; approved business timezone, grace period, thresholds, approvals, qualifying payment, and fee rules.

**Backend/API Work:** AR and aging queries, follow-up/candidate filters, suspension/reconnection services, technician workflow, service event integration.

**Database/Migration Work:** Suspension/reconnection records and required settings/indexes; no redundant mutable aging totals.

**Electron/Frontend Work:** Outstanding, Overdue, AR Aging, Suspension Candidates, Suspension/Reconnection and service-history views.

**shadcn Components/Screens:** Dense DataTable, filter bar, bucket cards/table, Dialog/Sheet forms, timeline, badges.

**Tests:** Aging boundary/as-of/timezone tests; report/detail reconciliation; approval/state transitions; qualifying payment/reconnection; role tests.

**Security Review:** Technician least privilege, approval/completion separation, PII in exports, audited reasons.

**Financial Review:** Aging uses remaining invoice amount net allocations/credits under approved policy; fee posts through billing/ledger, never UI-only.

**Files Affected:** Receivable/aging/service-control modules, migrations/settings, desktop features, tests.

**Checkpoint Evidence:** All aging buckets reconcile to outstanding total; candidate filters and two history-preserving scenarios demonstrated.

**Suggested Git Commit/Tag:** `feat: add receivables and service control`; tag `phase7-ar-service`.

**Definition of Done:** AR is reproducible for an as-of date and service state changes are approved, historical, and financially linked.

**Implementation checkpoint (2026-09-22):** Historical as-of AR detail and aging, explicit review-only candidate filters, and audited request/independent-approval/independent-completion suspension and reconnection paths are implemented. Automatic thresholds, mandatory qualifying-payment logic, fee posting, and rejection/cancellation endpoints remain disabled pending policy approval. Static verification and migration validation pass; live PostgreSQL and packaged Electron acceptance remain open. See `docs/architecture/phase-7-verification.md`.

### Phase 8 — Reports / Dashboard / Printing

**Goal:** Deliver real operational KPIs, required reports, receipt/SOA printing, and PDF/XLSX evidence from shared server calculations.

**Prerequisites:** Phases 3–7; approved report list/layouts, branding, retention, and access scope.

**Backend/API Work:** Report registry/query services, dashboard aggregates, pdfmake/ExcelJS renderers, bounded job/download flow.

**Database/Migration Work:** Report job metadata only if needed; optimize evidenced queries/indexes without denormalizing prematurely.

**Electron/Frontend Work:** Role-aware dashboard, report parameter/history/download UI, print previews, export error/progress handling.

**shadcn Components/Screens:** Compact KPI cards, useful charts only, tables, date filters, Progress, DropdownMenu, print styles.

**Tests:** Totals vs source queries, PDF text/layout smoke, XLSX cells/types/formula injection, permissions, large report behavior, installed print test.

**Security Review:** Report authorization and data scope, expiring downloads, filename/header safety, no private fields by default.

**Financial Review:** UI/PDF/XLSX totals match; SOA opening/activity/closing and AR buckets reconcile exactly.

**Files Affected:** Report/dashboard infrastructure and features, styles, sample outputs, tests.

**Checkpoint Evidence:** Dashboard with real seed data; minimum report set; matching PDF/XLSX/SOA/receipt samples.

**Suggested Git Commit/Tag:** Report-family commits; tag `phase8-reporting`.

**Definition of Done:** Required reports are authorized, reproducible, printable/exportable, and backed by reconciliation tests.

**Implementation checkpoint (2026-09-22):** A real server-calculated dashboard and the prompt-supported monthly collections, AR aging, subscriber SOA, and collector-reconciliation families are implemented with shared preview/PDF/XLSX data, bounded parameters, export authorization/auditing, secure Electron save handling, print markup, and sanitized samples. Static/export verification passes. The missing official report list/templates, live PostgreSQL reconciliation, target Excel/PDF inspection, and installed printing remain acceptance gates. See `docs/architecture/phase-8-verification.md`.

### Phase 9 — Backup / Hardening / Deployment

**Goal:** Prove recoverability, security, installability, and reliable three-PC LAN operation.

**Prerequisites:** Feature-complete schema; actual lab topology/OS/PostgreSQL service account; backup destination and TLS/firewall decisions.

**Backend/API Work:** Backup/verify/restore orchestration, maintenance mode, readiness depth, log rotation, graceful restart and deployment service setup.

**Database/Migration Work:** Backup history and final migrations; clean-DB migration rehearsal; integrity/reconciliation scripts; restore compatibility checks.

**Electron/Frontend Work:** Backup/restore admin UI, production API configuration, connection recovery, electron-builder installer and installed-app checks.

**shadcn Components/Screens:** Backup history, progress, preflight Alerts, re-auth/typed confirmation dialogs, connection/maintenance banners.

**Tests:** AT-09/AT-12; clean install/migrate/seed; API restart; disk/file failures; restore drill; dependency/security review; three clients.

**Security Review:** Firewall/TLS, least-privilege DB/service account, filesystem ACLs, secrets handling, CSP/IPC, dependency audit, restore authorization.

**Financial Review:** Pre/post backup ledger/AR/report checksums and transaction safety during maintenance/cutover.

**Files Affected:** Backup infrastructure/UI, deployment docs/scripts/config, builder config, release staging, evidence.

**Checkpoint Evidence:** Verified backup manifest and restore; installer; deployment guide; three-PC recording/logs; clean migration output.

**Suggested Git Commit/Tag:** `feat: add verified backup and LAN deployment`; tag `release-candidate-1`.

**Definition of Done:** A documented operator can install clients/server, connect three PCs, back up and restore safely, and reproduce integrity evidence.

**Implementation checkpoint (2026-09-22):** Backup history, custom-format dump, manifest/financial checksums, catalog verification, maintenance gating, password plus typed restore confirmation, single-transaction restore, session revocation, hardened runtime CSP, owner UI, NSIS configuration, and Windows LAN guidance are implemented. Static tests/builds pass. PostgreSQL tools are absent and NSIS packaging lacked its external cache/download, so no live restore, installer artifact, service/firewall/TLS proof, or three-PC run is accepted. See `docs/architecture/phase-9-verification.md`.

### Phase 10 — QA / Documentation / Defense

**Goal:** Close defects, run the entire acceptance/live-demo suite, and assemble a professional, student-explainable submission.

**Prerequisites:** Phase 9 release candidate and resolved blocking clarifications.

**Backend/API Work:** Only approved defect fixes and observability/documentation improvements; no late speculative features.

**Database/Migration Work:** Rehearse all migrations from clean DB and upgrade path; freeze schema; verify seeds and backups.

**Electron/Frontend Work:** Accessibility/responsive/installed-build polish, meaningful empty/error copy, workflow regression fixes.

**shadcn Components/Screens:** Consistency audit across all required screens; remove unused generated components; no behavior-changing redesign.

**Tests:** Full typecheck/lint/unit/integration/E2E; AT-01–AT-12; live demo rehearsal; regression, accessibility, install and three-client checks.

**Security Review:** Final threat/config/secret/log/role review and direct-API negative tests.

**Financial Review:** Independent reconciliation of invoice, allocation, ledger, receipt, AR, batch, reports, reversal, and restore results.

**Files Affected:** Tests/evidence, docs/manual/ERD, sample reports, release notes/installer; focused fixes only.

**Checkpoint Evidence:** Signed acceptance matrix, defect log, screenshots, outputs, demo recording/checklist, final docs and checksums.

**Suggested Git Commit/Tag:** Focused fix/docs commits; tag `v1.0.0-lab-submission` after acceptance.

**Definition of Done:** Every final checklist item is evidenced, system starts from documented steps, student can explain critical modules, and release contents match submission structure.

**Implementation checkpoint (2026-09-22):** A permission-protected audit viewer, final audit query indexes, user manual, technical overview, ERD, acceptance matrix, demo checklist, defect log, release notes, and static acceptance runner are implemented. Static typecheck, automated tests, builds, schema consistency, and focused secret scanning are the local evidence boundary. Final acceptance remains open because the official laboratory PDF, live PostgreSQL migration/recovery drill, completed installer, installed printing, approved policies, and three-PC LAN evidence are unavailable. See `docs/architecture/phase-10-verification.md`.

## 24. Instructor Checkpoint Map

The prompt names CP1–CP6 but does not define their official scope. Proposed mapping must be confirmed with the instructor.

| Checkpoint | Proposed phases | Demonstrable evidence |
|---|---|---|
| CP1 — Proposal/Foundation | Phase 1 | Approved requirements, architecture/ERD draft, repo/workspace, Electron/API/DB readiness, README |
| CP2 — Security/Master Data | Phases 2–3 | Login/RBAC tests, subscriber/plan/service workflows, search, synthetic records |
| CP3 — Billing Core | Phase 4 | Billing generation, immutable invoice, ledger/SOA, duplicate protection tests |
| CP4 — Payments/Collections | Phases 5–6 | Exact/partial/advance policy, GCash, receipt/reversal, batch/remittance/shortage evidence |
| CP5 — AR/Reports/Deployment | Phases 7–9 | Aging, service control, PDF/XLSX, backup/restore, installer, three-client run |
| CP6 — Final Defense | Phase 10 | AT-01–AT-12 report, docs/manual/ERD, sample reports, live demo, release |

## 25. Live Demo Map

| # | Requirement / screen | API / domain service | Main entities | Expected result / evidence |
|---:|---|---|---|---|
| 1 | Login + Dashboard | auth; dashboard query | users, sessions, invoices/payments | Admin authenticated; real KPIs; screenshot + request log |
| 2 | Create/open subscriber and service | subscribers/service accounts | subscriber/address/plan/service | Valid unique records/profile; audit + screenshot |
| 3 | Generate invoice | billing finalize; ledger post | cycle, invoice/items, ledger | One invoice and debit; DB/test evidence |
| 4 | Exact/partial cash payment | allocation preview/post | payment/allocation/invoice/ledger | Correct balances/status; AT-01/02 evidence |
| 5 | Receipt preview/print | receipt snapshot/render | receipt/payment | Unique formatted receipt; PDF/print evidence |
| 6 | Record/verify GCash | proof upload/verify/post | proof/payment/audit | Verified actor/time then posted payment; screenshots |
| 7 | Duplicate GCash protection | dedup service | proof/reference fingerprint | Approved block/warning; API/UI evidence |
| 8 | Ledger + SOA | statement query/report | ledger/source records | Opening + activity = closing; PDF and assertions |
| 9 | Overdue + aging | aging service | invoices/allocations/credits | Filters/buckets reconcile; export/screenshot |
| 10 | Open/create batch | batch build | batch/accounts/assignments | Frozen expected route accounts; audit |
| 11 | Record collections | batch collection/payment service | payments/batch accounts | Account/batch totals update transactionally |
| 12 | Remit cash | remittance service | remittances/batch | Remitted cash recorded; receipt/evidence |
| 13 | Reconcile difference | reconciliation service | batch/reconciliation | Difference visible; authorized state transition |
| 14 | Reverse payment + audit | reversal service | payment/reversal/ledger/audit | Original retained; balance restored; audit screen |
| 15 | Export report | report query/render | relevant domain records | Matching PDF and XLSX files/checksums |
| 16 | Lower-privilege restriction | authorization guard | roles/permissions/session | UI hides and direct API rejects; AT-10 output |
| 17 | Backup/restore | backup/verify/restore | DB/files/backup history | Test change undone; integrity proof/manifest |
| 18 | Multiple clients | normal APIs + concurrency guards | sessions/sequences/financial records | 2–3 PCs operate without duplicates/cross-session effects; recording/logs |

## 26. Defense Study Map

| Defense question | Files/modules the student must understand |
|---|---|
| Why PostgreSQL, not shared SQLite? | `docs/architecture/context.md`, deployment guide, API DB client/config |
| Where authoritative billing/payment logic lives | `modules/billing/billing.service.ts`, `modules/payments/payment.service.ts`, renderer API client |
| Duplicate invoice prevention | billing service, invoice schema/migration unique constraint, AT-11 |
| Receipt/GCash uniqueness | sequence service, receipt schema, proof normalization/dedup service, AT-05 |
| Partial/advance representation | payment/allocation/credit schemas and service, financial-invariants doc, AT-02/03 |
| Reversal versus deletion | reversal service, ledger entries, audit schema, AT-06 |
| Ledger correctness | ledger service/query, migration checks, SOA report, reconciliation tests |
| API crash during posting | transaction wrapper, idempotency module, integration rollback/retry tests |
| Server auth versus hidden UI | authorization hook, route permission declarations, `PermissionGate`/navigation, AT-10 |
| Electron security | main window config, preload API/types, CSP/navigation tests |
| Backup verification/restore | backup coordinator/manifest/verifier, backup UI, deployment guide, AT-12 |
| Aging correctness | aging service SQL/tests and report reconciliation |
| Future collector mobile/PWA | versioned HTTP/shared DTO boundaries; explain that no DB/business logic is in Electron, but offline conflict/security needs separate design |

## 27. Risks / Unknowns / Clarifications

| Issue | Why it matters | Recommended clarification/decision | Status |
|---|---|---|---|
| Official laboratory PDF absent | Could contain grading/checkpoint/business rules not in prompt | Add and review it before Phase 1/schema approval | **Blocking for final requirement baseline** |
| CP1–CP6 official definitions absent | Proposed evidence may not match grading schedule | Confirm proposed checkpoint map with instructor | Blocking before checkpoint commitments |
| Advance payment policy | Determines credit ownership and future allocation | Choose subscriber-wide vs service-specific and automatic vs manual future application/refund | **Blocking before Phase 5** |
| GCash duplicate rule | References may be reused/typed inconsistently; false positives possible | Define normalization, uniqueness scope, warn-vs-block, override permission, separation of duties | **Blocking before Phase 5** |
| Invoice/receipt/account numbering | Affects constraints, sequence reset, demo, paper forms | Approve formats, scopes, reset rules, gap policy; never reuse issued receipts | Blocking before related migrations |
| Penalties, discounts, tax, prorating | Changes invoice items and legal totals | Instructor states in/out of scope and formulas/effective dates | Blocking before Phase 4 if required |
| Billing/due date/timezone rules | Month-end and aging can differ | Approve Asia/Manila business timezone, invalid day handling, grace and holiday behavior | Blocking before Phase 4/7 |
| Void/credit/adjustment approval | Determines lifecycle and roles | Define when each applies and required approval/reason | Blocking before Phase 4 |
| Manual allocation/refund/write-off | Financial outcomes not fully specified | Exclude until explicit rules; document as limitation | Non-blocking if excluded |
| Cashier GCash verification | Same-person recording and verification may violate controls | Decide whether Cashier can verify own intake | Blocking before RBAC finalization |
| Collection shortage/overage closure | Prompt requires visibility but not close policy | Define who may close, required notes/approval, later settlement | Blocking before Phase 6 |
| Suspension/reconnection policy | Automatic qualification and fees depend on it | Approve thresholds, grace, approval, qualifying payment, fees | Blocks Phase 7 automation/fees; manual controlled path is implemented |
| Attachment types/size/retention | Impacts security, backups, storage | Start JPEG/PNG ≤5 MB; confirm PDF and retention | Non-blocking foundation; blocking Phase 5 release |
| LAN hardware/OS/TLS/firewall | Drives service setup and install evidence | Record three PCs/server OS, IP/DNS, ports, certificate capability | Blocking before Phase 9 |
| Backup destination/RTO/RPO | Same-disk backup is insufficient | Approve external location, frequency, retention, restore objective | Blocking before Phase 9 |
| Report templates/branding | Layout and required fields may be graded | Obtain sample receipt/SOA/reports/logo if any | Neutral Phase 8 templates implemented; blocks final report acceptance |
| Data retention/privacy | Audit/proof/login history cannot be indefinite by assumption | Instructor/business sets retention/access rules | Non-blocking prototype; blocking production claim |
| Password/session thresholds | Security behavior must be demonstrable | Approve minimum password, attempt count, idle and absolute timeout | Blocking before Phase 2 completion |
| Electron signing/auto-update | Credentials/infrastructure may be unavailable | Treat unsigned lab installer and manual update as documented limitation unless supplied | Non-blocking lab release |

## 28. Final Completion Checklist

- [ ] Official laboratory specification and approved clarifications are reflected in requirements/tests.
- [ ] Application starts from documented clean setup without manual dev-only code edits.
- [ ] Three installed clients connect to the central API over the approved LAN configuration.
- [ ] No committed secrets, real customer data, reusable private credentials, databases, proofs, backups, or logs.
- [ ] PostgreSQL migrations apply from a clean database and the upgrade path is rehearsed.
- [ ] Synthetic seed data meets every minimum count/scenario and is safely repeatable.
- [ ] Electron uses context isolation, no Node integration, narrow typed preload, CSP, and safe navigation.
- [ ] Renderer has no DB credentials/access and owns no authoritative financial rule.
- [ ] Login, lock/logout, failed-login controls, RBAC, and direct-API authorization tests pass.
- [ ] Server prevents duplicate finalized billing per service account/period.
- [ ] Exact, partial, oldest-first, and approved advance-payment behavior passes tests with no lost centavo.
- [ ] Posted corrections use linked reversals/adjustments; original history remains visible.
- [ ] Invoice, service, account, payment, batch, and receipt numbering/uniqueness policies are enforced.
- [ ] Issued/voided receipt numbers remain reserved.
- [ ] GCash evidence, deduplication, verification actor/time, and attachment controls work as approved.
- [ ] Batch shortage/overage remains visible and reconciliation follows authorization policy.
- [ ] Ledger, open invoices/credits, AR aging, SOA, dashboard, and exported reports reconcile.
- [ ] Required PDF/XLSX outputs have correct filters, peso values, dates, totals, and authorization.
- [ ] Backup includes PostgreSQL and attachments; checksum/integrity and restore are tested.
- [ ] AT-01–AT-12 automated/manual/concurrency evidence is retained with regression results.
- [ ] Clean install, API restart, installed printing/export, and target-scale query checks pass.
- [ ] Technical documentation, ERD/data dictionary, user manual, deployment/backup guide, and README are complete.
- [ ] Required screenshots, sanitized sample reports, defect log, installer, checksums, and release notes are packaged.
- [ ] Live demo is rehearsed end-to-end with fallback evidence for infrastructure-only steps.
- [ ] Student can explain the Defense Study Map modules and known limitations without relying on generated prose alone.

---

**Execution status:** The user approved phased implementation. Phases 1–8 are implemented at code level, and Phases 9–10 are code-prepared within their safety boundaries. Local typecheck, automated tests, migration/schema consistency, and production builds are the verified evidence; live PostgreSQL migration/reconciliation/recovery, completed NSIS packaging, installed printing, and three-PC LAN acceptance remain pending. Policy-dependent features stay visibly disabled until instructor decisions are approved.
