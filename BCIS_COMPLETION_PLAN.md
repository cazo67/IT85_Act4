# BCIS Completion and Enhancement Plan

Date prepared: 2026-09-26  
Status: planning complete; implementation requires user approval  
Scope authority: `CODEX_BCIS_PLANNING_PROMPT.md`, the current repository, and documented verification evidence. The official laboratory PDF and official CP1-CP6 definitions are not present, so final rubric compliance cannot yet be certified.

## 1. Objective and completion rule

Finish BCIS as a reliable, explainable student laboratory submission while preserving its Electron -> Fastify -> PostgreSQL architecture and financial-history safeguards. Improvements beyond the minimum will be limited to changes that materially improve reliability, security, usability, verification, or submission clarity.

BCIS must not be called complete until:

1. every applicable activity requirement has a passed test or dated manual evidence;
2. every policy-dependent requirement is either approved and implemented or formally excluded by the instructor;
3. PostgreSQL, installer, printing, backup/restore, and three-client checks have been performed in their required environments; and
4. the final repository, documentation, evidence, and release package are complete and reproducible.

## 2. Current architecture to preserve

- `source/apps/desktop`: Electron main/preload plus React renderer; no database credentials or authoritative financial rules.
- `source/apps/api`: Fastify routes, authorization, domain services, report generation, PostgreSQL access, and backup orchestration.
- `source/packages/shared`: safe money, permissions, and shared contracts.
- `database`: ordered Drizzle migrations and deterministic synthetic seeds.
- `docs`, `tests`, `reports-samples`, and `release`: documentation, evidence, sample outputs, and distributables.

Preserve these design decisions:

- integer centavos for money;
- immutable finalized financial history with compensating reversals;
- transaction-scoped financial operations;
- API-enforced permissions independent of hidden UI controls;
- opaque in-memory desktop session tokens;
- context isolation, sandboxing, disabled Node integration, restricted CSP/navigation, and narrow IPC;
- central API/database deployment rather than shared database files on clients;
- append-only migration history after a migration has been exercised against a real database.

## 3. Current evidence baseline

On 2026-09-26, `tests/Run-StaticAcceptance.ps1` passed:

- TypeScript typecheck for shared, database tools, API, and desktop.
- API: 42/42 tests.
- Electron main: 2/2 tests.
- Shared package: 4/4 tests.
- API and Electron production builds.
- Drizzle schema/migration consistency.

`deployment/windows/Test-BcisPrerequisites.ps1` ran successfully as a checker but returned failure because PostgreSQL 16 `pg_dump.exe` and `pg_restore.exe` are absent. Node.js v24.15.0 and API port 4100 are available.

This baseline is static evidence only. It does not prove PostgreSQL transactions, installed Electron behavior, printing, recovery, or multi-client operation.

## 4. Requirement comparison

| Requirement area | Current state | Completion gap |
|---|---|---|
| Electron/Fastify/PostgreSQL architecture | Implemented at code level | Live database and installed-client proof required |
| Authentication and seven roles | Implemented with Argon2, opaque sessions, lock/logout, role permissions, and API guards | Idle auto-lock/session policy approval and packaged-role evidence required |
| Subscriber, address, contact, plan, service-account management | Implemented | Live CRUD, duplicate, lifecycle, pagination, and UI evidence required |
| Global search | Missing as a cross-module feature | Current search is mainly subscriber/user scoped; implement the required account/name/contact/address/service/invoice/receipt search |
| Billing and immutable ledger debit | Implemented at code level | PostgreSQL transaction, retry, concurrency, and reconciliation evidence required |
| Exact/partial/oldest-first cash payment | Implemented at code level | Live allocation, receipt, ledger, SOA, and failure-injection evidence required |
| Advance payment/credit | Deliberately blocked | Instructor must define ownership, application, refund, and allocation policy before implementation |
| GCash proof and duplicate protection | Schema foundation exists; posting/upload deliberately blocked | Instructor must define duplicate scope, override, verification separation, attachment limits, and retention |
| Receipt and reversal | Implemented at code level | Installed print/preview, void watermark, PostgreSQL balance, and audit proof required |
| Collection batches/remittance | Balanced cash workflow implemented | Live reconciliation required; shortage/overage close policy remains unresolved |
| AR aging and as-of history | Implemented at code level | PostgreSQL historical reconciliation and approved Asia/Manila timezone behavior required |
| Suspension/reconnection | Manual request/approve/complete path implemented | Automatic cutoff, qualifying payment, rejection/cancellation, and fees need approved rules |
| Dashboard and four reports | Implemented with PDF/XLSX samples | Official report list/branding, live totals, installed print, and visual review required |
| Audit logging/viewer | Implemented at code level | Live actor/before-after coverage audit and retention decision required |
| Backup/restore | Orchestration and safety rules implemented | Source files are currently ignored by Git; real tools, backup, catalog verification, isolated restore, and checksum reconciliation required |
| Electron security | Strong foundation and two tests | Installed navigation/CSP/permission/IPC tests and production configuration proof required |
| API logging/error contract | Implemented foundation | Service log rotation, operational capture, and redaction evidence required |
| Seed/demo data | 7 plans, 3 areas/routes, 2 collectors, 50 subscribers, and 60 services | Clean PostgreSQL execution, repeatability, required financial scenarios, and count assertions required |
| AT-01 through AT-12 | Rule-level evidence exists | All rows remain Partial or Blocked except limited automated authorization evidence |
| Installer/release | NSIS configuration exists | No installer or release checksums exist |
| Documentation | Markdown overview/manual/ERD/deployment/checklists exist | Final PDF/DOCX exports, traceability, screenshots, acceptance report, defense deck/guide, and final manifest are missing |
| Git/AI workflow | Repository initialized | Zero commits and zero tracked files; meaningful history and reviewable checkpoints are missing |
| Official rubric | Unavailable | Obtain and map official PDF plus CP1-CP6 before final acceptance |

## 5. Critical findings to address first

1. `.gitignore` contains `backups/`, which ignores both `source/apps/api/src/modules/backups/` and `source/apps/desktop/src/renderer/src/features/backups/`. A commit made now would omit working source required by imports.
2. The repository has no commits and no tracked files. Deliverable D1 therefore is not satisfied.
3. The official laboratory specification and CP1-CP6 definitions are absent.
4. GCash and advance-payment demonstrations are required by the supplied activity brief but cannot be safely implemented from the available policy.
5. No PostgreSQL-backed integration tests currently prove the main domain services. Most automated evidence is rule-level.
6. No NSIS installer, UI screenshot set, signed acceptance output, or final documentation export exists.
7. The desktop uses a single large navigation shell and has no required cross-module global search.
8. Session expiry exists, but automatic idle locking is not implemented in the renderer.

## 6. Planned file structure

### Create during implementation

```text
BCIS_PROGRESS_AND_DOCUMENTATION.md
docs/
  requirements-traceability.md
  defense-guide.md
  submission-manifest.md
  generated/
    technical-documentation.pdf
    user-manual.pdf
    erd.pdf
tests/
  integration/
    auth-postgres.test.ts
    billing-postgres.test.ts
    payments-postgres.test.ts
    collections-postgres.test.ts
    receivables-postgres.test.ts
    backup-restore.test.ts
  acceptance/
    acceptance-test-report.md
  evidence/
    YYYY-MM-DD/
      environment.md
      commands.log
      checksums.sha256
  screenshots/
    .gitkeep
release/
  .gitkeep
```

Create integration files only when a disposable PostgreSQL test database is available. Generate binary documentation and release artifacts from reviewed sources; do not hand-edit generated output.

### Update during implementation

- `.gitignore`: scope runtime backup exclusions to runtime data paths without ignoring source modules.
- `README.md`, `docs/README.md`, `tests/README.md`: add authoritative navigation and exact verification boundaries.
- `source/package.json`: add reliable verify, integration, evidence, and submission-check scripts where justified.
- `tests/Run-StaticAcceptance.ps1`: retain fail-fast native exit handling; add artifact/source-presence checks.
- `deployment/windows/Test-BcisPrerequisites.ps1`: retain Windows PowerShell compatibility and add version/path diagnostics only if needed.
- `source/apps/api/package.json`: retain stable test timeouts and add integration scripts separately from unit tests.
- `source/apps/api/src/modules/*`: change only for confirmed defects, approved policies, global search, and verified requirements.
- `source/apps/desktop/src/renderer/src/*`: add global search, idle lock, clearer workflow feedback, and evidence-ready UI only after API contracts are approved.
- `database/migrations/*`: append new migrations; do not rewrite exercised history.
- `database/seeds/*`: add deterministic financial/demo scenarios and count assertions.
- `tests/acceptance/AT-01-AT-12.md`: update only from retained evidence.
- `docs/defect-log.md`, `docs/release-notes.md`, and each affected phase verification file: record actual results, not planned claims.

### Retain without redesign

- Electron/Fastify/PostgreSQL responsibility boundaries.
- Existing schema modules, domain services, report renderers, shared money/permission contracts, and sanitized sample reports.
- Existing financial invariants and policy-safe fail-closed behavior.
- Existing migration files `0000` through `0011`, unless a disposable database proves they have never been applied and a documented correction is safer. Default action is append-only migration.

## 7. Phased implementation plan

### Phase 0 - Requirement baseline and safe repository capture

Work:

- obtain the official laboratory PDF, CP1-CP6 definitions, required report templates/logo, and instructor decisions;
- correct `.gitignore` so backup source modules are trackable while runtime archives remain excluded;
- confirm all intended source/document/sample files appear in `git status`;
- scan for secrets, customer data, dumps, backups, logs, and generated build output;
- create the first meaningful baseline commit only after review.

Verification:

```powershell
git check-ignore -v source/apps/api/src/modules/backups/backup-service.ts
git check-ignore -v source/apps/desktop/src/renderer/src/features/backups/BackupPanel.tsx
git status --short --untracked-files=all
git ls-files
rg -n -i "BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key|access[_-]?token" . -g "!source/node_modules/**"
```

Acceptance: both backup source folders are trackable, runtime artifacts remain ignored, no secret/data artifact is staged, and the baseline commit contains the complete application.

Rollback: revert only the `.gitignore`/documentation commit; never delete untracked source as cleanup.

### Phase 1 - Verification harness and local reliability

Work:

- preserve fail-fast PowerShell behavior and stable authentication timeouts;
- add a submission verifier that checks critical source, migrations, samples, documentation, and prohibited files;
- add API route tests for permissions, validation, error contracts, and policy-blocked endpoints;
- add focused React/Electron tests for session state, permission navigation, report save validation, and idle lock;
- add encoding/render checks for Markdown and UI labels on Windows;
- record dependency audit findings without forced major-version overrides.

Verification:

```powershell
& .\tests\Run-StaticAcceptance.ps1
corepack pnpm --dir source audit --prod --audit-level high
```

Acceptance: a deliberately failing child command makes the runner exit nonzero; all normal checks pass twice from a cold terminal; critical source cannot be silently ignored.

Rollback: keep tests and scripts in isolated commits so any unreliable check can be reverted without touching application logic.

### Phase 2 - Required local feature completion

Work that does not require policy invention:

- implement server-side global search across the required identifiers with bounded pagination;
- add permission-aware desktop global search and direct navigation to results;
- implement configurable renderer idle warning/lock while retaining the API's absolute session expiry;
- improve loading, empty, retry, validation, keyboard, focus, text-plus-color status, and narrow-window behavior;
- ensure every state-changing screen shows a safe confirmation and actionable error;
- add missing rejection/cancellation actions only if their behavior is already unambiguous and non-financial.

Likely files:

- `source/apps/api/src/modules/search/search-routes.ts` and `search-service.ts`;
- `source/apps/api/src/app/build-app.ts` and `source/apps/api/src/server.ts`;
- `source/apps/desktop/src/renderer/src/features/search/GlobalSearch.tsx`;
- `source/apps/desktop/src/renderer/src/App.tsx`;
- `source/apps/desktop/src/renderer/src/features/auth/*`;
- `source/apps/desktop/src/renderer/src/lib/api-client.ts`;
- new focused unit/route/UI tests.

Acceptance: search results are authorized, bounded, deterministic, and cover account/name/contact/address/service/invoice/receipt; idle warning and lock work without persisting credentials; existing workflows and static tests remain green.

Rollback: add search and idle-lock as separable commits; preserve existing navigation as a fallback until the new behavior passes UI checks.

### Phase 3 - Policy-dependent functional completion

Do not begin until written instructor/business decisions exist.

Work:

- GCash proof upload, validation, quarantine/storage, duplicate detection, verify/reject, separation of duties, retention, backup inclusion, and UI;
- advance credit creation, ownership, future application, refund rules, ledger treatment, and UI;
- invoice void/adjustment authorization and compensating history;
- collection shortage/overage approval and settlement;
- suspension/reconnection thresholds, qualifying payment, fees, rejection, and cancellation;
- approved numbering, timezone, tax/discount/penalty/proration, retention, and password/session rules.

Acceptance: every policy maps to schema constraints, API permissions, audit events, UI states, tests, user documentation, and demo evidence with no lost centavo.

Rollback: each policy ships behind a fail-closed server rule and separate migration/feature commit. Never weaken the existing disabled behavior until the approved replacement passes.

### Phase 4 - PostgreSQL integration and financial proof

Environment: PostgreSQL 16+ on a disposable local or lab database.

Work:

- add documented clean-create, migrate, upgrade, and seed commands;
- assert seed counts and required exact/partial/arrears/overdue/collection scenarios;
- test billing, payment, reversal, collection, aging, service control, audit, and idempotency through real transactions;
- test rollback through injected failures;
- run concurrent duplicate billing/payment attempts;
- independently reconcile invoices, allocations, ledger, receipts, batches, and reports.

Verification outline:

```powershell
& .\deployment\windows\Test-BcisPrerequisites.ps1
corepack pnpm --dir source db:migrate
corepack pnpm --dir source db:seed-security
corepack pnpm --dir source db:seed-master-data
corepack pnpm --dir source test:integration
Invoke-RestMethod http://127.0.0.1:4100/api/v1/health/ready
```

Acceptance: clean and upgrade paths succeed, seeds are repeatable, all financial totals reconcile, failures leave no partial rows, and concurrency results are deterministic.

Rollback: use only disposable databases during development; restore from a verified pre-test backup before any rehearsal against a retained environment.

### Phase 5 - Desktop E2E, printing, and presentation quality

Work:

- run the packaged or production desktop against synthetic PostgreSQL data;
- exercise all role views and required workflows;
- verify receipt/report print preview and a real approved printer;
- verify PDF/XLSX content, peso/date formatting, totals, filenames, and spreadsheet safety;
- audit 1024x680 minimum and representative larger displays, keyboard operation, overflow, and text-plus-color states;
- capture sanitized UI screenshots and command/database evidence.

Acceptance: required screens and demo sequence operate end to end with no raw SQL/stack traces, no clipped critical controls, and matching database/report evidence.

Rollback: UI polish remains separate from domain changes; keep the last verified renderer build available during demonstration rehearsal.

### Phase 6 - Backup, installer, LAN, and recovery

Environment: PostgreSQL tools, isolated restore target, target Windows version, printer, and three PCs.

Work:

- create and verify a real custom-format backup and manifest;
- restore to an isolated target using a single transaction;
- compare pre/post financial counts and centavo totals;
- build NSIS, install/uninstall cleanly, and calculate SHA-256 checksums;
- configure restricted firewall scope and TLS or document accepted isolated HTTP;
- run three clients concurrently with distinct users;
- verify API restart, client recovery, logs, exports, and printing.

Verification:

```powershell
corepack pnpm --dir source --filter @bcis/desktop dist:win
Get-FileHash .\release\* -Algorithm SHA256
```

Acceptance: AT-09 and AT-12 pass with dated evidence; the installer works on a clean client; all three clients can operate safely; recovery totals match.

Rollback: rehearse only on isolated systems; retain verified backup/checksum and installer from the last accepted build; never restore over the sole live database during testing.

### Phase 7 - Final documentation, defense, and release

Work:

- produce requirement traceability, technical documentation, user manual, ERD export, acceptance report, defect log, defense guide/deck, screenshots, and submission manifest;
- map every claim to command, screenshot, database assertion, artifact checksum, actor, date, and environment;
- update `BCIS_PROGRESS_AND_DOCUMENTATION.md` after every completed phase;
- create the release tag only after all applicable gates are signed.

Acceptance: D1-D8 exist in the required structure, links resolve, generated files match reviewed sources, no sensitive data is included, and no Partial/Blocked item is described as passed.

Rollback: regenerate binary documents from versioned Markdown; do not manually patch generated PDFs or acceptance evidence.

## 8. Local versus external work

### Achievable on the current machine after approval

- `.gitignore` and repository integrity repair;
- static test/harness improvements;
- route, domain-rule, renderer, Electron, and documentation tests that do not need PostgreSQL;
- global search and idle-lock implementation at code level;
- accessibility/responsive/error-state improvements;
- requirement traceability, defense guide, evidence templates, and final-source documentation;
- installer attempt if required electron-builder resources are obtainable.

### Requires PostgreSQL or additional local infrastructure

- migrations and seed execution;
- real transaction, rollback, concurrency, reporting, and reconciliation tests;
- `pg_dump`/`pg_restore` backup and isolated restore;
- authenticated full Electron workflows against durable data.

### Requires instructor/business decisions

- GCash workflow and duplicate policy;
- advance credit/refund/allocation;
- adjustment/void rules;
- shortage/overage settlement;
- automatic suspension/reconnection and fees;
- numbering, billing calendar/timezone, penalties, tax, discount, proration, retention, and security thresholds;
- official reports, templates, branding, and CP1-CP6 scope.

### Requires target hardware or people

- three-PC LAN/concurrency acceptance;
- firewall/TLS approval;
- physical printer checks;
- clean Windows installation/uninstallation;
- signed instructor/user acceptance and defense rehearsal.

## 9. Practical enhancements beyond the minimum

Include:

- fail-fast submission verification;
- cross-module global search required by the brief;
- configurable idle warning/lock;
- deterministic evidence folders and SHA-256 manifest;
- focused accessibility and narrow-window checks;
- clear health/preflight diagnostics;
- a concise defense guide linking workflows to code and evidence.

Do not add unless a demonstrated need appears:

- microservices, Redis, message queues, Kubernetes, cloud storage, auto-update infrastructure, analytics, or a second database;
- speculative financial policies;
- broad framework rewrites or visual redesigns that threaten working flows.

## 10. Main risks and controls

| Risk | Control |
|---|---|
| Source silently omitted by ignore rules | Track critical-file assertions and review `git check-ignore` before the first commit |
| Invented financial policy changes balances | Require written decisions; keep endpoints fail-closed until approved |
| Unit tests mistaken for live acceptance | Separate static, integration, installed, hardware, and sign-off evidence |
| Migration damages retained data | Append migrations, test clean/upgrade paths, back up before rehearsal |
| Flaky or false-positive verification | Fail on native exit codes, use bounded timeouts, run twice from a cold terminal |
| Secrets/customer data enter submission | Synthetic-only data, focused scans, `.env`/archive exclusions, staged-file review |
| UI polish breaks financial behavior | Separate UI/domain commits and rerun reconciliation/E2E gates |
| Installer/demo fails offline | Build and rehearse early; retain checksummed fallback evidence and last accepted installer |

## 11. Approval checkpoint

No implementation phase should start until the user approves this plan. After approval, execute phases in order, update `BCIS_PROGRESS_AND_DOCUMENTATION.md` after each phase, and stop for required instructor or environment input rather than fabricating acceptance.
