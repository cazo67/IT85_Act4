# BCIS Approved Phased Implementation Plan

Updated: 2026-09-30
Status: approved implementation direction; the individual financial policies listed below are **not** approved. Final acceptance remains incomplete.

## How to resume with limited context

Read this file and the **Current handoff** at the top of [BCIS_PROGRESS_AND_DOCUMENTATION.md](BCIS_PROGRESS_AND_DOCUMENTATION.md). These are the only two active execution files. The laboratory activity is the fixed requirements reference; other Markdown files are supporting detail or dated evidence. A new session should not infer completion from source files, old phase names, or a previous chat.

1. Confirm the current Git status and the handoff's last recorded checkpoint. Preserve all pre-existing edits, including untracked work; do not reset or broadly reformat.
2. Select the first **Open** item in the handoff's Next work list. Inspect its actual source, test, route, schema and permissions before editing. Work on one small vertical task at a time.
3. Use the relevant gate below for acceptance criteria. Add only the tests needed to prove the behavior, run the focused checks and then the required static gate when changes warrant it. Separate local, PostgreSQL, Electron, installer and LAN evidence.
4. Update the handoff **in the same work session**: status, files changed, exact commands/results, assertions, defects, current blocker and the next one actionable task. Keep older dated entries intact as history. Never mark a gate passed because it was planned, a build succeeded, or a button appeared.
5. If work stops mid-task, write **In progress** with the exact files touched, unfinished change, known failures and the command to resume. If a policy or external environment blocks that task, mark it Blocked and continue with another independent required task only when its ordering is safe.

Allowed status words: **Verified**, **Implemented but unverified**, **Partial**, **Blocked by policy**, **Missing**. “Verified” always identifies the environment and evidence. The handoff is the current status authority; this plan is the implementation and acceptance authority. Keep the detailed checklist and AT matrix as supporting references, but do not require a future session to read them to find its next step.

## Authority and document ownership

The [laboratory activity](BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md) is the requirements baseline, including CP1–CP6, AT-01–AT-12 and D1–D8. Its technology table is labelled recommended; functional and acceptance requirements remain mandatory unless the instructor records an exclusion. Archived prompts do not override this baseline.

- [This plan](BCIS_COMPLETION_PLAN.md): approved scope, gate order, task acceptance and required activity coverage.
- [Progress and documentation record](BCIS_PROGRESS_AND_DOCUMENTATION.md): current handoff, status and dated implementation evidence.
- [Development checklist](BCIS_Development_Status_Checklist.md), [AT matrix](tests/acceptance/AT-01-AT-12.md) and [documentation index](docs/README.md): supporting detail, not competing execution plans.

The earlier cleanup approval authorized documentation consolidation. This plan now defines future implementation work; it does not itself approve unresolved business rules or record a completed feature.

## Architecture and completion rule

Extend the existing Electron → Fastify → Drizzle → PostgreSQL modules. Preserve integer-centavo accounting, opaque sessions, server authorization, transactional posting, compensating history, append-only applied migrations, and Electron isolation/CSP/IPC controls. Never put database credentials or authoritative financial calculations in the renderer.

Completion requires evidence for every applicable requirement, accepted policy-dependent workflows or explicit instructor exclusions, clean deployment/recovery, three-client operation, and complete D1–D8 artifacts. Passing unit tests or building an installer is insufficient.

## Verified baseline

The read-only audit on 2026-09-28 found:

- 48 API, 3 Electron configuration and 4 shared tests passed (55 total); workspace typechecks, Drizzle consistency, source-integrity checks and diff whitespace checks passed.
- API live/ready returned 200; PostgreSQL 18 on port 5433 records migrations 0000–0012.
- The existing Cash slice includes partial payment, final settlement, compensating reversal and API restart evidence.
- Direct database totals: invoice outstanding and ledger net both 7,913,900 centavos; invoice paid and active allocations both 50,000 centavos. This is a current snapshot, not historical AR acceptance.
- One verified backup and a checksummed NSIS artifact exist. Isolated restore, clean installation, printing and three-PC acceptance remain open.
- Live data: 2 users, 51 subscribers, 61 services, 7 plans, 2 collectors, 3 areas, 1 billing month, 2 Cash payments and 1 reversal. No overdue accounts, collection batches/remittances, service-control scenarios, GCash proofs or advance credits.
- The latest audit reran non-writing checks only. Prior production-build/full static-gate results are historical, not a fresh full-gate result.

## Priority defects

Track details and acceptance in [the defect log](docs/defect-log.md).

1. Packaged file-origin API requests fail CORS (Origin: null returned 500 while ordinary health returned 200).
2. Cash/batch retry buttons generate new command keys; preserve a command key across uncertain submissions and retries.
3. Shared query cache survives sign-out and is not scoped to users; cancel/clear or safely partition it and test account switching.
4. Generic service updates permit suspension/reactivation outside the independent approval workflow.
5. Backup manifest totals and pg_dump do not share a consistent snapshot during concurrent writes.
6. Complete drawer focus trapping/restoration and verify all layouts for overflow.

These findings are unresolved. Do not describe this documentation update as fixing them.

## Complete activity coverage

The system is for three office PCs on a LAN. Keep one central Fastify/PostgreSQL server, straightforward indexed and paginated queries, and basic reliable security. The activity also states large data targets; check representative query/index behavior, but do not add cloud services, microservices or speculative scaling infrastructure. All required end-to-end behavior and the database relationships/constraints in activity sections 3–5 remain in scope.

| Activity requirement | Implementation gate | Minimum proof before complete |
|---|---|---|
| Seven roles, login/logout/lock, inactive/failed-login handling, granular server permissions, audit | 1–3, 5 | Role matrix and forbidden direct API calls, session changes, audit actor/reason |
| Subscribers, contacts/addresses, multiple Internet/Cable/Combo services, plans, future-only prices and global search | 2–3 | Create/edit/deactivate, historical invoice price intact, restart and cross-client visibility |
| Monthly billing, all required invoice states, lines, unique numbers, duplicate prevention, immutable ledger and printable SOA | 2–4 | Preview/finalize/retry/concurrency, invoice/ledger/SOA reconciliation, controlled void/credit where approved |
| Cash, GCash, Bank Transfer, Cheque and Other; exact/partial/advance; oldest-first allocation, proof review, receipts and reversal | 2–4 | Each enabled method posts with correct permission/audit; AT-01–06; no lost centavo or repeated receipt |
| Areas, routes, collectors, route sheets, batch lifecycle, remittance and shortage/overage | 3–4 | Cash and non-cash totals, AT-07/08, persisted differences and approved closure |
| AR aging, overdue filters/details, suspension and reconnection | 3–4 | Current/1–30/31–60/61–90/90+ reconciliation, distinct actors and service history |
| Dashboard, required reports, PDF/XLSX, receipt/statement printing and dense usable UI | 3–4, 6 | Source totals match exports; role access; installed printing; responsive keyboard navigation |
| Transactional posting, exact money, uniqueness, indexes/pagination, sanitized errors/logs, proof validation and secure Electron boundary | 1–5 | Real database rollback/concurrency, security tests, no renderer DB access/secrets |
| PostgreSQL and attachment backup/verification/restore, installer and three simultaneous LAN PCs | 5–6 | AT-09/12, isolated restore totals, clean install, reconnect/interruption, restricted DB/firewall |
| Documentation, synthetic demo dataset, instructor checkpoints, AT-01–AT-12 and D1–D8 | 7 | Dated artifacts, checksums, accepted test outcomes, complete demonstration and defense |

Payment methods, invoice/batch state labels and screen navigation are currently incomplete relative to the activity. Map current `OPEN` and batch statuses to the required semantics explicitly; where a real missing state or action is needed, implement it with a reviewed migration and tests. A UI label alone does not satisfy a database workflow.

The required acceptance scenarios are: AT-01 exact Cash; AT-02 partial Cash; AT-03 advance credit; AT-04 oldest-first arrears; AT-05 duplicate verified GCash reference; AT-06 reversal; AT-07 balanced remittance; AT-08 visible blocked shortage; AT-09 simultaneous clients; AT-10 direct API authorization; AT-11 repeated billing; AT-12 isolated backup/restore. Retain their exact examples and expected values from the activity and record results in the progress handoff. AT-08 can prove visible shortage and blocked balanced closure before any shortage settlement policy is approved.

Demo data target from the activity: at least five distinct role-covering users, seven plans (3 Internet, 2 Cable, 2 Combo), 50 subscribers, 60+ service accounts, two collectors, three areas, three billing months, mixed approved payments, ten overdue accounts across aging buckets, an approved reversal/void example and two service-control scenarios. Use synthetic records only. The existing counts meet some, not all, of these targets.

## Gated execution order

### Gate 0 — Baseline and contracts

Retain existing dirty files; review changes without resets or broad reformatting. Maintain the [integration contract map](docs/architecture/integration-contract-map.md). Reconcile current requirements against the supplied activity rather than archived planning assumptions.

Current state: contract map and requirements audit are documented. The dirty tree is deliberately preserved. Recheck this gate when routes/screens/schema change; do not repeat the entire audit at the start of every session.

Exit: every module has UI/API/permission/table/evidence mapping and a current status.

### Gate 1 — Readiness, session and retry reliability

Repair the priority connectivity, cache, retry and service-control authorization defects. Preserve route contracts unless an incompatible defect is demonstrated. Confirm dev and packaged owner login, forced password change, lock/logout and lower-role denials. Use existing PostgreSQL 18/5433 and API 4100; keep all credentials separate and outside Git.

Execute as four reviewable tasks in this order:

1. **D-010 packaged connection:** inspect `source/apps/api/src/app/build-app.ts`, `source/apps/api/src/config/env.ts`, Electron main/preload and renderer API configuration. Fix the file-origin CORS case narrowly while retaining the allowlist and Electron CSP. Add an API regression for allowed packaged and denied foreign origins; launch the packaged client and prove live/ready plus login.
2. **D-011 retry identity:** inspect the Cash and batch payment panels, API idempotency logic and `payments`/batch uniqueness. Persist one command key for a pending user action through uncertain response/retry; issue a new key only for a genuinely new action. Test dropped response, same-key retry, different payload conflict and one payment/receipt/allocation/ledger set.
3. **D-012 session isolation:** inspect `App.tsx`, `query-client.ts`, `query-keys.ts` and authentication routes. Cancel/clear or partition queries and pending requests on logout, lock/expiry and account/permission changes. Test switching from Owner to a lower role without showing previous data.
4. **D-013 service authority:** inspect `subscriber-routes.ts`, `subscriber-service.ts` and receivables service-control routes. Reject generic status changes that require suspension/reconnection approval; retain ordinary approved service editing. Test direct API attempts and the approved multi-actor flow.

Do not use production credentials or an existing customer's account as test fixtures. A development Electron launch cannot replace the packaged-client check.

Exit: installed/dev API access works; retry after a lost response cannot duplicate payment; account changes cannot show another session's cached records; service controls cannot bypass approval.

### Gate 2 — Cash workflow and database integration

Use a dedicated disposable bcis_test database with explicit target guards. Add real PostgreSQL integration tests for auth, subscriber/service CRUD, billing, allocations, ledger, receipts, reversal, collections, AR, reports and permissions. Prove failure rollback, uniqueness, repeated command keys, concurrent billing/payment and restart persistence. Re-run the full subscriber → service → billing → partial Cash → reports/audit → restart workflow through Electron.

Review `database/scripts/migrate.ts`, deterministic seeds, the API domain services/schema and `source/apps/api/test/`. Reject test configuration pointing at `bcis` or a production name before any test cleanup. Cover exact/partial/oldest-first and compensating reversal through real transactions; assert `invoice total − active allocations = receivable = ledger debits − credits` at the chosen cutoff. Test that failures leave no partial invoice, allocation, receipt, ledger or audit rows.

Exit: independently reconciled totals and transaction failure/concurrency evidence; no development/production data used by destructive tests.

### Gate 3 — Incremental frontend and approved operations

Migrate one proven module at a time: auth/session → subscribers/services → billing/invoices → payments/ledger → receivables → collections → reports/audit/administration.

The sidebar, themes, breadcrumbs, shared QueryClient, dashboard/subscriber queries, subscriber TanStack Table and new-subscriber React Hook Form are already present. Extend them rather than restarting them. Keep server permission enforcement authoritative.

For each module, implement its missing API/domain behavior, data validation and role checks only where the activity requires them; then update the corresponding existing panel. Verify create/edit/state-change, errors, permission denial, persistence after restart, audit/report effects and cross-role visibility before moving to the next module. Keep navigation consistent with the activity's Dashboard, Subscribers, Billing, Payments, Collections, Receivables, Services, Reports and Administration groups; do not start a renderer rewrite.

Preserved tasks from the frontend-first plan:

| Original task groups | Remaining implementation/verification |
|---|---|
| PLAN-001–004; FND-001–007 | Contract mapping; role navigation; shared loading/empty/error/unauthorized/API-unavailable states; status badges; confirmations; keyboard/focus; persisted shell/theme preferences and responsive checks. |
| FQ-001–004 | Remaining RHF/Zod forms and query migrations; cache invalidation after mutations; operational sorting/filtering/pagination/row actions; review pagination contract changes before rollout. |
| AUTH-001–004 | Packaged login, forced change, lock/unlock/logout, expiry, approved idle-lock behavior and cross-role navigation. |
| SUB-001–005; PLANM-001–003 | Subscriber identity/contact/address editing, deactivation, profile tabs, multiple services/addresses, service detail/editing, plan editing/archive and future-only pricing without changing history. |
| BILL-001–006; LED-001–003 | Cycle/preview/finalization, invoice list/detail/statuses, controlled adjustment gates, ledger date filters and SOA opening/activity/closing reconciliation. |
| PAY-001–009 | Fast cashier search/preview/post, stable retries, exact/partial flows, additional required methods, receipt history/reprint/void indication and compensating reversal. |
| GC-001–005 | Approved proof entry, two-pane queue, duplicate detection, verification/rejection, independent actor rules and verified-only posting. |
| COL-001–003; BATCH-001–006 | Areas/routes/collectors, printable route sheets, full batch lifecycle, account totals, remittance, visible differences and authorized closure. |
| AR-001–004; SRV-001–004 | Outstanding/aging/overdue, collector/area/plan/type/age filters, overdue fields, configured policies, technician assignment and approved service history. |
| DASH-001–002; RPT-001–009 | Compact KPIs, billing/collection and method summaries, collector performance, overdue alerts/recent payments, complete required reports and navigation-free printing. |
| ADM-001–004 | Users, permissions, read-only audit and approved settings; effective permission changes must invalidate sessions/cache appropriately. |
| INT-001–010; BKP-001–004; TEST-001–004; LAN work | Covered by Gates 1, 2, 5 and 6; retain their workflow evidence requirements. |

Search must cover account/name/contact/address plus invoice, receipt and GCash reference according to permissions. Reports must cover daily/weekly/monthly/annual collections, methods, billing versus collection, revenue by plan/service/area, master list, ledger/SOA, collector assignments/remittances/performance/differences, reversals/voids and user/audit activity.

Pagination currently uses nested items/page/pageSize/hasMore and inconsistent defaults. The prior integration plan proposes a data collection plus sibling meta with page/pageSize/total/totalPages, default 50 and maximum 100. Treat that as an explicit API/client migration to review and test, not an already implemented contract.

Exit: policy-independent operations work through the UI with validation, authorization, persistence, audit/report effects and cross-role evidence. Re-run the vertical workflow after each migration.

### Gate 4 — Written policies and required financial features

Cash-only is an interim safety boundary, not final laboratory compliance. Bank Transfer, Cheque and Other are required by the activity and currently missing. GCash, advance credit and invoice adjustment/void remain gated until their detailed rules are recorded and tested.

Retain these unresolved decisions from the original implementation plan:

- GCash normalization/uniqueness scope, warn-versus-block, overrides, sender information, verifier separation, reject/review flow, proof types/size/storage/retention and attachment backup.
- Advance-credit subscriber/service ownership, automatic/manual application, allocation, transfer, refunds and reporting.
- Void/credit/adjustment authority, reasons and compensating ledger treatment; manual allocation/write-off only with explicit authority.
- Shortage/overage approval, later settlement and batch-linked payment correction. AT-08 visibility and blocked balanced closure can be tested now without defining settlement.
- Suspension thresholds/grace, reconnection qualification/fees, technician assignment, rejection/cancellation.
- Number formats/scopes/resets/gaps, Asia/Manila timezone and month-end/due-day rules, tax/discount/penalty/proration only when enabled and approved.
- Password/failed-login/idle/absolute-session thresholds, retention/access rules, report templates/branding, backup frequency/destination/retention/RTO/RPO.
- LAN addresses/firewall/TLS or approved isolated HTTP; signing/manual-update limitations where relevant.

The current billing rule uses period-end invoice dates and the configured due day in the following month, with days 1–28. This remains a documented provisional rule, not new policy approval. Proposed JPEG/PNG proof limits in archived plans are suggestions, not approved limits.

Record each rule in documentation/tests, then domain/API/schema constraints, then UI, then remove only its gate. Preserve authorization before revealing record/policy state.

The official activity gives the expected outcome, but not enough detail for several financial decisions. Obtain written decisions in the progress record before implementing the corresponding posting/settlement path. Work on independent required modules while waiting. **Do not mark Gate 4 or final acceptance complete while required GCash/advance/payment-method/adjustment workflows are disabled**, unless the instructor explicitly excludes them in writing.

Exit: enabled required financial workflows have written rules and reconciliation/audit evidence.

### Gate 5 — Recovery and automated acceptance

Retain tests/Run-StaticAcceptance.ps1 as the required static gate, serialized workspace execution and single-worker API tests. Add dedicated PostgreSQL integration and Playwright Electron smoke/full workflows. Capture traces/screenshots on failure and retain separate sanitized acceptance artifacts. Introduce lint only after a reviewed configuration/script; record the activity's linting expectation meanwhile.

Create and verify backups, restore into an isolated target, and compare counts/centavos/report outputs. Include attachments when proof storage is enabled. Verify consistency under concurrent writes and rollback behavior. Never rehearse over the sole retained database.

Inspect `source/apps/api/src/modules/backups/backup-service.ts` and resolve D-014 so the manifest and archive represent a consistent snapshot. Record fixture creation, dump validation, isolated target identity, before/after row counts and centavo totals. Playwright Electron smoke must cover launch/login/dashboard/navigation/API-unavailable/logout; full workflow must cover the Cash vertical slice. Keep screenshots and traces only on failure except sanitized final UI evidence.

Exit: static, PostgreSQL and Electron suites pass from clean documented setup; AT-12 proves restored records and financial integrity.

### Gate 6 — Installer, reports and LAN

Build and checksum the current source; do not assume the existing installer includes later renderer edits. Test clean Windows install/uninstall, packaged connectivity, receipt/report printing, PDF/XLSX opening, API restart and reconnect. Configure one API/database server and three distinct client accounts; desktop clients reach only the API. Record firewall scope and TLS or approved isolated-HTTP limitations.

Use the approved office/LAN environment; document server and client versions/addresses without secrets. Test simultaneous operations, duplicate prevention and interrupted payment retry from real clients. Keep PostgreSQL inaccessible from desktop PCs. Confirm every required report family against database totals and representative exported files; the four existing sample families alone do not cover the activity.

Exit: AT-09, clean-install, print/export and interrupted submission evidence retained; no duplicate numbering or lost value.

### Gate 7 — Documentation and submission

Bring demo data to the activity's recommended coverage: five users, three billing months, mixed approved payment methods/amount cases, ten overdue accounts across aging buckets, reversal and two suspension/reconnection scenarios. Existing subscriber/plan/service/collector/area counts meet their thresholds.

Complete D1–D8: source/history, working release, technical guide/ERD/data dictionary/security/API/IPC/deployment/recovery, user manual, test/defect evidence, reports, screenshots and defense presentation. Produce reviewed document exports, acceptance report, release manifest/checksums and rehearse the official demo.

Map CP1 architecture, CP2 core data/RBAC, CP3 financial core, CP4 collections/AR, CP5 reports/security/backup and CP6 final QA to evidence. Update the current handoff and dated evidence after each completed gate; synchronize the detailed checklist and AT matrix when their corresponding requirement or scenario status changes.

Exit: all applicable requirements evidenced; no Partial, Missing or Blocked item represented as passed.

## Execution safeguards and evidence

Preserve existing uncommitted work. Keep feature changes reviewable; append migrations after clean/upgrade tests; use synthetic data and excluded credentials/runtime archives. Evidence records need environment, date, actor/role, commands, assertions, expected/actual values, result and artifact checksum. Sanitize exports and never include passwords, tokens, customer data or backups in Git.

The activity states target volumes of 20,000 subscribers, 500,000 invoices, 500,000 payments and 1,000,000 ledger-related entries. Keep clean relational structure, relevant indexes and bounded pagination; sample representative query plans where practical. This remains a small three-PC office system, so do not add mass-use infrastructure, cloud services, microservices, mobile apps or analytics. None of those would substitute for financial and recovery correctness.

For implementation rollback, use reviewed changes and isolated test data; do not reset unrelated work or rewrite applied migrations. Historical plans and verification results remain available from the documentation index.
