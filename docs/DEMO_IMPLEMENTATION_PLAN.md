# BCIS batch-generated demonstration video implementation plan

Date: 2026-10-12, Asia/Manila. **Planning only; no pipeline has been implemented or executed.**

Status: **Revised against the unfinished current implementation; recording is not ready yet.** A polished, connected demonstration of supported paths is feasible in principle. The whole application must not be described as finished or finally accepted. Physical LAN acceptance remains pending by the user's explicit choice to use separate local clients. This plan does not change the approved application implementation gates.

Revision scope: slower, visibly imperfect desktop interaction; per-requirement current readiness; corrected collection and contact-edit scenes; minimum preparation before recording; honest bonus selection. A standalone reusable instruction is in [DEMO_RECORDING_PROMPT.md](DEMO_RECORDING_PROMPT.md). No application feature or recording pipeline was implemented.

## 1. Goal and scope

Eventually provide one project-root command that prepares an isolated synthetic BCIS environment, records twelve chapters sequentially, verifies each chapter, and assembles a silent **1920 × 1080, constant 30 fps, H.264/yuv420p MP4**. Target viewing time is **450 seconds (7:30)**; the complete result must be **strictly below 480 seconds**. All final and chapter MP4s belong in `demo-output/<run-id>/mp4/`.

The footage must capture actual Windows desktop interaction with BCIS Electron, native dialogs, real browser tabs, and a genuine terminal only where useful. Automation must be disclosed. Cards explain the system but cannot substitute for successful application actions. Preserve the clean presentation and existing useful visual style; change input pacing and movement rather than adding decorative animation. This inspection did not locate or review the user's mentioned previous animation/video, so no matching claim is made.

The user supplied `BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md` **in place of the PDF**. Its retained `Page N` footers provide the assessment page references below. No original assessment PDF was supplied or inspected; these references have not been checked against original PDF pagination. The Markdown has readable content with some extraction/encoding artifacts. Required demo tasks and acceptance-test rows are recoverable; diagram layout and original visual formatting are not independently verified.

The pasted prompt's sections 24/25/28 were examples, not actual BCIS section numbers. Use **§11.1 Required Live Demo Sequence**, **§7 Mandatory Acceptance Tests**, **§8 Minimum Demonstration Dataset**, **§11.2 Defense Questions**, **§14 Final Submission Checklist**, and **§15 Optional Enhancement Tasks**.

Authorized work in this turn: read-only inspection and this document only. No application/data/configuration edits, dependency installs, tests that mutate data, builds, service changes, screenshots, recordings, seeds, or account creation were performed. Existing dirty work is preserved. Future execution requires a separate instruction to implement/record.

## 2. Inspected project facts and evidence

Evidence labels used throughout:

- **Inspected:** source/configuration/file existence examined on 2026-10-12; functionality was not exercised this turn.
- **Recorded local evidence:** a dated repository record reports a prior check in its stated environment; not a fresh run or broader acceptance.
- **Proposed:** future pipeline behavior to implement and verify.
- **Pending:** unresolved prerequisite or acceptance boundary.

### 2.1 Repository, stack, and entry points

No applicable `AGENTS.md` was found in the workspace or checked ancestor locations; no repository `CLAUDE.md` was found. [README](../README.md), [approved completion plan](../BCIS_COMPLETION_PLAN.md), and [current handoff](../BCIS_PROGRESS_AND_DOCUMENTATION.md) establish the project context. The handoff's newest entries are at the **top**, rather than the end of the file.

Existing changes at inspection included the progress record, report renderer, Gate 5 Playwright script, test guide, Gate 6 helpers/tests, and dated evidence. Do not reset, clean, commit, or overwrite them as part of demo implementation. Record the actual dirty source digest used by a future run; a Git commit alone does not describe this checkout.

| Fact | Inspected evidence | Implication for the recorder |
|---|---|---|
| Windows Electron client → Fastify API → PostgreSQL | `source/apps/desktop/src/main/index.ts`, `source/apps/api/src/server.ts`, `source/apps/api/src/db/client.ts` | Record the desktop application; a browser-only remake would misrepresent the product. |
| React, TypeScript, electron-vite, Tailwind/shadcn/Radix, TanStack Query/Table, React Hook Form/Zod | `source/apps/desktop/package.json`, renderer `main.tsx`, `App.tsx`, feature panels | Inspect DOM for stable controls, but drive the visible OS pointer for recording. |
| Declared Electron `^44.4.3`, React `^19.3.0`, Fastify `^5.12.5`, PostgreSQL driver/Drizzle, ExcelJS/pdfmake | app package manifests; `source/package.json` declares pnpm 10.34.3, Node >=22 <25, Playwright Core `^1.63.0` | Manifest ranges are not an installed-version audit. Record actual runtime versions during future preflight. |
| API starts from `src/server.ts`; desktop main loads renderer HTML or electron-vite development URL | main source, `electron.vite.config.ts`, API manifest | Use actual BCIS entry points and preserve preload; do not serve renderer HTML with a fabricated `window.bcis`. |
| Navigation is React `activeView` state, not URL routes | renderer `App.tsx` | Select sidebar buttons by accessible name. URLs like `/payments` are not actual page routes. |
| HTTP default `http://127.0.0.1:4100`; API prefix `/api/v1` | `lib/api-client.ts`, API config/routes | Future isolated build must align `VITE_BCIS_API_BASE_URL`, `BCIS_API_ORIGIN` CSP, API binding and CORS. |
| Renderer DB isolation and native save bridge | `main/window-options.ts`, main/preload | `contextIsolation: true`, `nodeIntegration: false`, sandbox; `bcis:save-report` uses actual `dialog.showSaveDialog`. |
| Exact money in bigint centavos and decimal integer strings | payment/billing services, shared contracts, report formatting | Assertions must compare centavos, never rounded JavaScript floating-point totals. |

### 2.2 Screens, roles, sessions, and current behavior

The inspected sidebar labels are: **Dashboard, Subscribers, Service plans, Generate billing, Invoices, Receive payment, Payment history, Submit GCash proof, GCash proofs, Receivables, Collection setup, Collection batches, Reports, Audit history, Backup and recovery, User accounts, Roles and permissions**. Visibility depends on permission codes, and API routes authorize independently.

`database/seeds/01-security.ts` defines `OWNER`, `ADMINISTRATOR`, `CASHIER`, `COLLECTION_SUPERVISOR`, `ACCOUNTING_AUDITOR`, `TECHNICIAN`, and `VIEWER`. The Administrator does not receive `user.manage`, `role.manage`, `backup.restore`, or `audit.view`; the Owner does. The seeded Cashier has `payment.verify_gcash`, so an Auditor verification handoff is an illustrative separation of actors, **not a claim that Cashiers cannot verify**. Inspect actual effective permissions at run start.

Authentication uses username/password, not email. Tokens are opaque and kept in React memory. New renderer loads require login. `App.tsx`, `lib/query-client.ts`, `lib/session-boundary.ts`, and `lib/pending-command.ts` implement session boundaries/cache clearing and payment-command retention. Theme/sidebar preferences persist locally. Login may require a forced password change; finish it privately during setup for demonstration actors, rather than editing production accounts or showing a password-change detour in the video.

Inspected operational behavior:

- Subscribers have identities, contacts, addresses and multiple services; subscriber forms use schema validation. Global search opens subscriber/invoice/payment targets.
- Billing previews before finalization and a confirmation dialog, then persists invoice/ledger records. Existing unique constraints and tests target duplicate service-period billing.
- Cash posting exposes allocation preview, receipt and history. Correcting a posted payment uses a reasoned reversal and voids the original receipt without reusing its number.
- GCash submission stores a **PENDING** proof. Review loads the image separately, requires receiver-history confirmation and posts through `/gcash/proofs/:id/verify`. Duplicate normalized references return `GCASH_REFERENCE_DUPLICATE` (409). Direct GCash posting through `/payments` remains intentionally rejected; this does **not** mean the verified-proof workflow is disabled.
- Proof input validates JPEG/PNG content, filename and size (2 MiB); proof bytes are in PostgreSQL `payment_proofs.proof_data`, covered by the database archive.
- Payment posting supports surplus subscriber credit, and billing consumes eligible credit. This needs exact-example rehearsal; do not repeat stale claims that advance payments are wholly disabled.
- Collections support route snapshots and internal `DRAFT → ACTIVE → SUBMITTED → REMITTED → RECONCILED → CLOSED`. `CollectionBatchesPanel.tsx` displays `DRAFT` as **OPEN** and `ACTIVE` as **IN PROGRESS**. A difference blocks reconciliation: the UI shows a warning and hides the **Reconcile balanced batch** button until zero; it does not offer a failing reconcile click. A direct server attempt can be checked separately. An explicit confirmed exact-cash correction preserves original remittance and reason; it is not permission to settle or write off shortages.
- Receivables accept `asOf`, search, aging bucket, area, collector, plan and service-type filters. The oldest bucket's API enum is `DAYS_91_PLUS`.
- Reports provide server previews, print, PDF/XLSX native save. `monthly-collections`, `subscriber-soa`, `ar-aging`, and `collector-reconciliation` are useful scene codes.
- Backup UI creates and verifies archives; restore requires current password and `RESTORE <backup-id>` and signs users out. The main story database must not be restored during the video.

Loading/error/empty components live in `components/async-state.tsx`. Native dialogs, readable alerts, role badges, explicit record filters, disabled busy controls, and sidebar scrolling require rehearsal. The desktop defaults to 1280 × 800 and permits 640 × 600; recording must maximize the real window on a verified 1080p display. Responsive and print behavior are inspected code, not current live acceptance. Do not compress the UI until labels or money become unreadable.

### 2.3 Existing utilities and prior evidence

| Evidence | Scope supported | Boundary |
|---|---|---|
| `source/apps/api/test/gate5-playwright-smoke.ts`; [Electron evidence](../tests/evidence/2026-10-04/gate5-electron-workflow.md) | Actual development Electron via CDP; login, connectivity, Cash slice, reconciliation, reload and sign-out | Guarded `bcis_test`, API 4110, renderer 5173, CDP 9236. Not a packaged or multi-PC recording utility. It uses DOM actions and special test dates that must not be copied blindly into a natural demo. |
| [Interrupted-payment evidence](../tests/evidence/2026-10-04/gate6-interrupted-payment.md) | Lost response after commit, same `commandKey` retry, one payment/receipt/allocation/audit | Local automated evidence, not footage and not a real API crash test. |
| `gate4-gcash-proof-postgres.test.ts` | Pending/rejected/corrected proofs, verification, duplicates, advance credit, reversal and rollback assertions exist | Inspected test intent plus dated handoff evidence; fresh full GUI demonstration still required. |
| `gate4-approved-postgres.test.ts` | Confirmed payment methods, invoice void rules, original shortage preservation and exact correction | Its collection fixture inserts a remitted batch directly. Do not present that fixture as a recorded complete batch creation. |
| [AT-12 isolated restore](../tests/evidence/2026-10-04/gate5-at12-isolated-restore.md) | 2/2 tests passed; real archive, shared snapshot, separate-target restore and financial/report comparison | 2026-10-04 guarded local run only; not production recovery or clean-machine installation. |
| [Report cell verification](../tests/evidence/2026-10-06/gate6-report-export-cells.md) | All 15 families' XLSX populated cells/summaries compared to preview; PDF checks; full guarded API 72 passed, restore opt-in skipped | In-memory artifacts; does not prove installed Save/Open/Print or independent SQL for all report families. |
| `tests/Run-StaticAcceptance.ps1`, `tests/Test-SubmissionReadiness.ps1` | Existing required source/type/test/build/schema gates | Run later when implementation is authorized. Static results cannot replace live evidence. |
| `database/scripts/migrate.ts`, seeds `01-security.ts` and `02-master-data.ts` | Migrations and deterministic security/master data | Master seed can overwrite changed plan prices. Run once against a new owned demo target, never blindly reseed shared databases. |

The newest handoff records 19 migrations on guarded `bcis_test`, but normal `bcis` remains at 15. These are **recorded counts**, not a live database query this turn. Do not migrate either database for this video. Older README/manual/technical-overview claims about disabled GCash, retry/CORS defects, or untested isolated restore are stale relative to current source and later evidence. This planning task does not update those documents or resolve remaining application gates.

Read-only tool discovery found:

- `ffmpeg` and `ffprobe` on PATH, reporting **8.1.2**; `ffmpeg -h demuxer=gdigrab` exposes desktop-region size/offset, framerate and `draw_mouse` options. No capture was started.
- OBS at `C:\Program Files\obs-studio\bin\64bit\obs64.exe` and its `obs-websocket.dll` exist. OBS version, configuration and usable websocket authentication were not tested.
- Chrome and Edge executable paths exist; `source/node_modules/playwright-core` exists. No browser was launched.
- Node, Corepack and Python resolve; `pwsh` did not resolve in this PATH check. Prefer the existing `powershell.exe` for the future root command.
- No project MP4/MKV/WebM or purpose-built batch capture pipeline was found in the inspected file listing. Failure traces/screenshots and report sample PDFs already exist; samples are not fresh export evidence.

## 3. Assessment requirement inventory with page references

### 3.1 Mandatory visible actions: every §11.1 task separately

Page references use the supplied Markdown's trailing page markers. D01–D04 are on **p.14**; D05–D13 are on **p.15**.

| ID | Section/task/page | Required action | Observable evidence |
|---|---|---|---|
| D01 | §11.1 task 1, p.14 | Administrator login and dashboard | Successful named Administrator session, role badge, live dashboard and API/DB ready status. |
| D02 | §11.1 task 2, p.14 | Create/open subscriber with Internet/Cable service | Search result, account number, actual service and plan/rate. Opening an existing synthetic record satisfies the task. |
| D03 | §11.1 task 3, p.14 | Generate/display monthly invoice and ledger debit | Prepared September invoice number, ₱999 total, actual dates and matching ledger debit for that subscriber. Display is an expressly allowed assessment alternative. |
| D04 | §11.1 task 4, p.14 | Post exact/partial Cash and print/preview receipt | ₱500 Cash, partial status, ₱499 remaining, receipt preview and actual print interaction if available. |
| D05 | §11.1 task 5, p.15 | Verify/post GCash with proof; duplicate-reference protection | Pending claim, proof preview, explicit training receiver-history check, verified ₱499 posting, rejected normalized duplicate. |
| D06 | §11.1 task 6, p.15 | Subscriber ledger and SOA | Original debit and both credits; September 1–October 12 date-range SOA closing balance ₱0, subject to actual recording date. |
| D07 | §11.1 task 7, p.15 | Overdue subscriber, AR aging/filtering | A named route subscriber, arrears, aging bucket and visible filter result. |
| D08 | §11.1 task 8, p.15 | Create/open collector batch, record collections, remit and reconcile difference | Same route/collector, new Cash collection, submitted/remitted state, shortage preserved, exact correction, zero reconciliation and closure. |
| D09 | §11.1 task 9, p.15 | Payment reversal and audit | Original payment remains, linked reversal/reason/actor, voided receipt, restored ₱500 due, read-only audit event. |
| D10 | §11.1 task 10, p.15 | Management report exported PDF/XLSX | Same report saved in **both** formats with real save dialogs, PDF opened in browser, XLSX validated independently. |
| D11 | §11.1 task 11, p.15 | Lower-role restriction | Cashier lacks User accounts/Backup controls; real authenticated admin API request returns 403. |
| D12 | §11.1 task 12, p.15 | Backup creation and explanation of tested restore | Newly created/verified archive, truthful card explaining the separate-target tested restore and its evidence date. |
| D13 | §11.1 task 13, p.15 | Simultaneous office clients if infrastructure allows | Separate local Electron sessions read/write the same server with fresh reads. **Physical office-PC LAN demonstration pending**, per user choice. |

### 3.2 Mandatory acceptance evidence; not twelve additional full video scenes

§7 says all twelve tests are required. Keep exact numeric cases in the external acceptance package even when the video illustrates the same rule with another amount. A 7:30 video does not certify the whole application or replace this package.

| ID | §7 page | Exact required scenario | Video/support strategy |
|---|---|---|---|
| AT-01 | p.11 | ₱999 exact payment → zero/PAID/receipt | Separate rehearsal fixture and retained API/SQL assertions; optional receipt glance only if time remains. Main combined-method settlement is not labelled this exact test. |
| AT-02 | p.11 | ₱999 invoice, ₱500 partial → ₱499 | Direct B04 scene plus SQL allocation/ledger/receipt comparison. |
| AT-03 | p.11 | ₱1,000 monthly, ₱3,000 advance without lost value | Separate synthetic plan/fixture; verify ₱1,000 allocation + ₱2,000 credit and future use. External acceptance evidence; no false claim that another-price test is this exact case. |
| AT-04 | p.11 | August/September ₱999 each, ₱1,200 → August 0, September ₱798 | Separate connected route-account fixture and oldest-first assertions; retained acceptance evidence. |
| AT-05 | p.11 | Already-used verified GCash reference blocked/warned by policy | Direct B05 duplicate after verification; normalization case too. |
| AT-06 | p.11 | Reversal preserves original, linked reversal, restored balances, actor/reason | Direct B09 plus retained reconciliation. |
| AT-07 | p.11 | ₱20,000 collected/remitted → zero, may close | Retained independent balanced fixture; B08 also demonstrates exact corrected zero and closure. Do not relabel a corrected case as an untouched balanced fixture. |
| AT-08 | p.11 | ₱20,000 collected/₱19,500 remitted → ₱500 shortage, no silent balanced close | Direct B08 shortage warning and unavailable reconcile/close controls before explicit correction; genuine server refusal retained separately. |
| AT-09 | p.12 | Two/three PCs operate concurrently, no corruption/numbering/session issues | B11 local processes plus concurrent API assertions. **Actual multi-PC case remains pending**, not passed by same-host sessions. |
| AT-10 | p.12 | Cashier directly calls admin user/backup operation → server refusal | B11 direct authenticated GET `/api/v1/users` returns 403; no secret printed. |
| AT-11 | p.12 | Generate same period twice, no duplicate finalized service invoice | B03 shows finalized-period Already billed/zero-pending preview. The actual second-finalization request and before/after invoice counts are retained separately; the preview alone is not a passed AT-11 test. |
| AT-12 | p.12 | Backup, change data, restore approved backup; integrity/records return | B12 creation/explanation; independent isolated drill before recording. Prior dated local evidence exists, but future run must bind evidence to its source/version. |

§7.1 (p.12) additionally requires domain outputs, API/integration results, desktop E2E/reproducible manual evidence, balances/report artifacts, and defect/root-cause/fix/regression evidence. Do not manufacture terminal output or treat skipped database tests as passed.

### 3.3 Other acceptance, delivery, and defense obligations

| Reference/pages | Obligation | Evidence placement |
|---|---|---|
| §2 pp.3–4; §4.4 p.8; §5 pp.8–9 | API-only DB access, secure Electron boundary, server RBAC, validated input, migrations, constraints, immutable finance/audit | Source/configuration review and integration package; introduction/technical cards only explain these findings. |
| §3 pp.4–6; §4 pp.6–8 | Subscribers, billing, Cash/GCash and other methods, collections, service control, reports, errors/loading/forms/print | Mandatory scenes plus complete application acceptance outside video. Showing one report cannot certify all required reports. |
| §4.5 p.8 | Reliability/scale, indexed/paginated queries, transactional posting, database/attachment recovery | Retained tests, query/scale evidence and restore drill; small demo data cannot prove target scale. |
| §8 pp.12–13 | Recommended minimum synthetic dataset, privacy | Counts/relationships and scenario checks before recording; dataset details in section 9 below. |
| §9 p.13, D1–D8 | Source, release, technical/user docs, tests, sample reports, UI evidence, presentation/defense | Submission package, independent of generated MP4s. |
| §10.1 p.14 | Critical financial/security/restore failures can cap score | Block compliant-completion claims when relevant checks fail. |
| §14 pp.16–17; §16 p.17 | Three clients, migration/backup/tests, correct money/history/reports, release/docs and ability to explain | Final application acceptance ledger; video alone is insufficient. |
| §11.2 p.15; §12 pp.15–16 | Live technical defense and accountable understanding | Presenter must answer questions and inspect genuine code live; silent cards do not replace this. |

Prepare concise defense notes on PostgreSQL versus shared SQLite; server business logic; duplicate billing/receipts/GCash; allocations; reversals; reproducible ledger totals; transaction rollback versus lost responses; server authorization versus hidden buttons; snapshot/hash/restore verification; and future mobile/PWA design. Label any future mobile feature as a proposal.

### 3.4 Optional bonuses

§15 p.17 lists mobile/PWA offline sync, approved SMS/email, self-service portal/SOA, official payment gateway, QR receipts/lookup, GIS, technician work orders/inventory, and advanced owner analytics. **None was confirmed as an implemented complete bonus suitable for this recording. Allocate zero seconds to assessed bonuses.**

Two inexpensive existing supplementary features are selected conditionally: **global account lookup** in B03 and **printable route-sheet snapshot** in B08. Preview the real print layout only if the native print pilot succeeds and timing allows; the actual snapshot table remains visible regardless. Role badges and API recovery also stay within the mandatory story. These are useful extras beyond the numbered live-demo actions, **not §15 bonuses**: search and route sheets already belong to the activity's core functional requirements.

The current source/module/dependency inspection did not find a complete mobile/PWA queue, reminder provider, customer portal, online gateway, QR receipt implementation, GIS screen, technician work-order/inventory module, or predictive owner analytics. Ordinary subscriber lookup is not QR lookup; a desktop SOA is not a customer portal; suspension/reconnection records are not a complete work-order/inventory bonus. This is a source-inspection finding, not a live test of every optional possibility.

If a genuine §15 enhancement is later requested, a QR receipt/account lookup is a candidate for a separately scoped design, and technician work orders are a larger candidate. Both need real implementation, permission/privacy decisions and tests; neither belongs in the minimum work before this recording. Do not promise “a few PDF bonuses” when none is demonstrably implemented. Feasible existing extras take priority over new optional development, and all mandatory scenes take priority over extras.

## 4. Feasibility findings and blockers

### 4.1 Requirement-to-implementation feasibility

All endpoints below are relative to `/api/v1`.

| Tasks | Screen / role / endpoint | Implementation and proposed checkpoint | Method / unresolved concern |
|---|---|---|---|
| D01 | Dashboard; `ADMINISTRATOR`; `/auth/login`, `/auth/me`, `/health/live`, `/health/ready`, `/dashboard` | Actual login and Online/Ready, role identity and populated KPIs. Auth guards and local evidence exist. | Desktop capture. Native process launch/build URL is still a preflight requirement. |
| D02–03 | Subscribers, Generate billing, Invoices; Administrator; `/subscribers`, `/subscribers/:id`, `/billing/preview`, `/billing/finalize`, `/invoices`, `/subscribers/:id/ledger` | Open linked service, display prepared September bill and real debit, preview finalized period with Already billed/zero pending. | Existing-cycle finalization returns the existing cycle; it does not add a newly created service. Create all intended fixtures before finalizing their period. Retain a real duplicate-finalization test separately. |
| D04 | Receive payment; Cashier; `/payments/preview`, POST `/payments`, GET `/payments/:id` | Allocation 50000, residual 49900, one receipt; actual receipt preview/print dialog. | Actual print UI is unverified. Receipt component preview meets D04's preview alternative; do not claim physical printing. |
| D05 | Submit GCash proof → GCash proofs; Cashier → Auditor; `/gcash/proofs`, `/:id/image`, `/:id/verify` | Submission creates no payment; explicit receiver-confirmed verify creates 49900 credit once; duplicate returns 409 and UI error. | Code/test evidence supports feasibility; complete role-switch/UI timing and native image chooser unverified. No real provider/Facebook interaction required or implied. |
| D06 | Subscriber ledger and Statement of Account; Auditor; `/subscribers/:id/ledger`, `/reports/subscriber-soa/preview` | September bill debit 99900, credits 50000 + 49900, closing zero. | Ledger/SOA filter posting time, not invoice period. Use September 1–actual recording day, and verify both date concepts visibly. |
| D07 | Receivables; Auditor; `/receivables/overdue-accounts`, `/receivables/aging`, `/receivables/filter-options` | Relevant route subscriber and aging/filter totals reconcile to SQL. | Full dataset must include bucket-spanning overdue examples; counts not live-inspected now. |
| D08 | Collection batches; Collection Supervisor; `/collection-batches/:id`, `/collections`, `/submit`, `/remittance`, `/remittance-correction`, `/reconcile`, `/close` | Total 2000000, remit 1950000, signed difference -50000, warning with reconciliation/close unavailable, confirmed correction to 2000000, original retained, close. | 60-second scene depends on opening an honestly preprepared ACTIVE/IN PROGRESS batch. Server refusal is verified separately; no invented UI error or invisible trigger. |
| D09 | Payment history → Audit history; Auditor; `/payments/:id/reverse`, `/audit-logs` | Reverse the original Cash payment, preserve receipt as voided, restore 50000 due, expose actor/reason. | Current source supports this; collection Cash must belong to other subscribers to avoid confusing reversal effects. |
| D10 | Reports; Auditor; `/reports/monthly-collections/preview`, `.../export?format=pdf|xlsx` | Same parameters, visible save confirmations, actual PDF open, XLSX parsed with ExcelJS. | Native save, PDF viewer and optional workbook viewer require OS automation rehearsal. Packaged-client exports not yet accepted. |
| D11 | Cashier workspace and genuine terminal; GET `/users` | Hidden admin controls plus actual 403 using Cashier credentials held privately. | A sanitized helper may make the real request and print only role/method/path/status/error code. No mock response or token on screen. |
| D12 | Backup and recovery; Owner; `/backups/preflight`, POST `/backups`, `/:id/verify` | New VERIFIED archive, size/checksum/catalog; separately tested restore explanation. | Private PostgreSQL tools/cluster and file ACLs need preflight. Never restore normal/shared DB to fit a scene. |
| D13 | Three separate local Electron clients, same API/DB | Concurrent valid write/read plus explicit refetch across roles, no duplicate receipts/session crossover. | User chose local clients. Useful local concurrency evidence only; physical LAN condition stays pending. |

For nested collection endpoints, append the listed suffix to `/collection-batches/:id` (including `/collections`); for GCash append to `/gcash/proofs`. Read current route schemas rather than assuming mutation bodies or version numbers.

### 4.2 Material prerequisites and limits

1. **Desktop automation feasibility:** OS pointer movement, file chooser, save dialog, print UI, window focus and DPI mapping must pass a short technical rehearsal. Headless Playwright/video cannot satisfy desktop-switch evidence.
2. **Capture display:** a real interactive, unlocked 1920 × 1080 Windows desktop at suitable scaling is required. Display resolution, permissions, disk space and remote-session behavior were not verified. Fail preflight if unavailable; do not upscale an unreadable small viewport and call it native 1080p.
3. **Disposable infrastructure:** private PostgreSQL cluster/tools, owned API ports, isolated desktop profiles and complete synthetic fixtures must be prepared. Do not use the partially migrated normal DB or accumulate new financial state in shared `bcis_test`.
4. **Packaged-client acceptance:** prior launch was not observed/successfully accepted. Default plan records clearly identified source-built Electron clients. It does not claim NSIS installation, packaged Save/Print, clean installation or production readiness.
5. **Physical LAN:** explicitly excluded from this recording's execution configuration, not from the assessment. D13's infrastructure qualification must be visible in the evidence report and closing card; AT-09's physical-PC acceptance remains pending.
6. **Timing:** 450 seconds is a hypothesis until two readable rehearsals succeed. Full acceptance suite, clean install, full restore and live defense cannot all be performed in 7:30; retain them as distinct evidence. Never silently drop a D01–D12 scene to meet the cap.
7. **Documentation drift:** source and dated evidence supersede stale feature-status descriptions for planning; they do not authorize new financial policy decisions. Unresolved settlement/write-off, reconnection policy and full service-control acceptance remain outside this video's completion claim.

Conclusion: **A finished-looking presentation of supported workflows is plausible; presenting the unfinished system as fully finished is not supported by the evidence. Recording cannot start yet.** The pipeline, deterministic fixtures, native UI pilot and all planned visible paths still need preparation/rehearsal. Full physical-LAN/application acceptance cannot be claimed. Any failed mandatory behavior blocks a compliant local demonstration; produce a clearly labelled partial result only if separately requested, not a fabricated success scene.

### 4.3 Current readiness for every mandatory live task

“Strong candidate” means current implementation plus recorded local evidence supports a rehearsal. It does **not** mean footage exists, the installed client passed, or a new live verification occurred. No mandatory task is currently certified recording-ready because the proposed pipeline/environment do not exist.

| Task / chapter | Current readiness | Minimum before recording | Does it block the selected video? |
|---|---|---|---|
| D01 / B02 | Strong candidate: source login/dashboard and dated local Electron smoke | Current Administrator role/session plus live connectivity/readability pilot on owned environment | Yes if launch/login/ready fails. Packaged login blocks only a packaged-release claim. |
| D02 / B03 | Strong candidate: subscriber/service UI and local Cash slice | Discover and open the prepared correct subscriber/service; verify persisted rate | Yes if the account/service cannot be read genuinely. New registration is not required by the create-or-open task. |
| D03 / B03 | Strong candidate: invoice, ledger and cycle-preview code/evidence | Prepare September invoice before capture, avoid finalized-cycle/new-service ordering error, verify actual posting/date range | Yes if invoice/debit is missing or inconsistent. Generating new billing on camera is not required by generate-or-display. |
| D04 / B04 | Strong candidate: partial Cash/receipt and lost-response evidence | Rehearse exact ₱999/₱500/₱499 example, allocation, receipt and preview | Yes if Cash/receipt/balance fails. Physical printing is not required for the task's preview alternative. |
| D05 / B05 | Implemented and API-tested locally; complete recorded multi-actor GUI path not established | Real file chooser, pending image, receiver-confirmed verify, fresh read and duplicate UI guard | Yes if verification or duplicate protection fails; upload alone cannot stand in. |
| D06 / B06 | Implemented; actual ledger/SOA components and report evidence | Verify the main account's exact date-range opening/debits/credits/closing and readable preview | Yes if either view is wrong/missing; no separate SOA implementation assumed. |
| D07 / B07 | Implemented; aging/overdue/filter code | Owned bucket-spanning dataset and independent as-of totals/filter rehearsal | Yes if arrears or filtering cannot be demonstrated. Full service-control completion is separate. |
| D08 / B08 | Implemented; API shortage/correction test, actual forms | Prepare genuine route entries, show existing UI warning/hidden controls, correct/reconcile/close through real UI | Yes if lifecycle/totals/correction/history fails. A fake “Reconcile” error button must not be added. |
| D09 / B09 | Strong candidate: local persisted Cash reversal evidence and current audit screen | Current Auditor session, exact B04 payment, real confirm/reversal, receipt and audit read | Yes if history/balance/audit does not match. |
| D10 / B10 | Server PDF/XLSX evidence exists; native Save/Open remains unaccepted | Save both real exports via native dialogs, open PDF, parse XLSX and reconcile selected report | Yes if a required export cannot be produced. Old sample files and in-memory tests are insufficient footage. |
| D11 / B11 | Server guards plus current role/cache source and local evidence | Verify actual Cashier permissions, true API 403, no credential output; real contact edit for cross-role scene | Yes if access/session isolation fails. No role masking or fake denial output. |
| D12 / B12 | Strong candidate: dated actual backup/isolated-restore evidence, current backup UI | Create/verify fresh owned backup; explain a genuinely tested isolated restore and its evidence date | Yes if backup creation fails or no valid tested restore can be explained. Running restore on camera is not required. |
| D13 / B11 | Local separate-client proposal; physical multi-PC acceptance absent | Three isolated local clients, current role identities, actual shared mutation/fresh reads | Local scene blocks if sessions are unsafe. Physical LAN remains explicitly pending under the selected profile. |

### 4.4 Completion gaps outside the narrow live sequence

These are current-source limitations or open evidence, not instructions to silently complete the full system before a short demonstration:

| Requirement / current evidence | Actual gap | Effect on demo and minimum action |
|---|---|---|
| §3.4 invoice states, `db/schema/billing.ts` | Invoice enum is `OPEN`, `PARTIALLY_PAID`, `PAID`, `VOID`; `DRAFT` belongs to billing cycles. Full DRAFT/UNPAID/OVERDUE/CREDITED invoice-state parity is not established. | Show real labels/amounts; do not relabel OPEN as a different stored state or claim full invoice-state coverage. No new status code is necessary for the selected display/payment story. |
| §3.4 adjustments and §3.6 allocation rules | An `ADJUSTMENT` line enum and untouched-invoice void path do not establish complete adjustment/credit-note/manual-allocation workflows. | Use supported reversal; keep missing full adjustment workflows in the completion ledger. Do not invent an adjustment scene. |
| §3.8 noncash collections, `payment-service.ts` | Service-scoped batch payments reject noncash with `BATCH_NONCASH_NOT_APPROVED`; full noncash batch accounting is not established. | Show the supported Cash collection/remittance required by D08. Do not claim this proves every collection method. |
| §3.10 service control, `receivable-service.ts`, `db/schema/service-control.ts` | Request/approve/complete exists; reconnection explicitly posts no fee because fee policy is unapproved. Complete technician assignment, configurable grace/threshold policy and full reject/cancel execution are not established. | Prepare only supported real scenarios for §8; record dataset-policy gaps if unresolved. Do not call these a complete work-order bonus. Not a new mandatory §11.1 scene. |
| §3.6 methods / current payment routes and Gate 4 tests | Cash, verified-proof GCash, confirmed Bank Transfer/Cheque/Other and credit logic now exist despite stale prose saying missing. Exact full GUI/current-policy acceptance is still incomplete. | Rehearse Cash/GCash for footage; verify AT-03 and required other-method cases separately. Do not implement duplicates of existing methods from stale notes. |
| §4.5 scale versus `billing-service.ts` | Single finalization rejects >10,000 eligible services; target subscriber/data volumes and all large-run behavior remain unaccepted. | Use a small complete synthetic dataset. Do not claim target-scale acceptance from it; no scale rewrite is required for the local demo. |
| §7/§14 installation, physical printing/LAN, source-to-release equivalence | Packaged launch/manual Save/Print/clean install and real three-PC acceptance remain unverified in newest handoff. | Source-built Electron is acceptable for this planned source demo with disclosure; a “finished installed deployment” claim is blocked. |
| §8 dataset and §15 bonus rule | Full scenario population is not established by master-data counts; no complete listed optional enhancement confirmed. | Prepare/validate scenario data; select existing supplementary search/route views, not invented scored bonuses. |

### 4.5 Minimum work before recording, in order

1. **Correct the script only:** use existing controls, September display path, actual status labels, contact-edit flow and warning-based shortage demonstration. Those planning corrections are included here; they are not application fixes.
2. **Prepare owned demo state:** complete synthetic roles, main invoice/payment chain, overdue route, collection entries and exact acceptance fixtures. Validate all identifiers/amounts and current policy boundaries. Preserve normal and shared test databases.
3. **Build the external recording controller after authorization:** native pointer/input, masked credential entry, file chooser/save, profile isolation, capture/checkpoint/retry and media verification. No recording script exists now.
4. **Rehearse mandatory paths:** prioritize GCash GUI, native PDF/XLSX saves, collector correction/closure, audit read and local-session fresh reads, which have weaker complete desktop evidence than the Cash slice. Repeat dated verification on current source where needed.
5. **Fix only reproduced blockers:** if rehearsal fails, retain exact trigger/expected/actual/root cause and propose the smallest affected application change. No current-source failure was executed/reproduced in this planning turn; do not prescribe a rewrite or mark an untested path passed.
6. **Rehearse natural input and timing:** two readable runs under 480 s. Optional extras and harmless imperfections are trimmed before mandatory evidence. Start final recording only after this exit gate passes.

The plan can therefore make the presentation polished without completing every outstanding application feature first. It cannot make the unimplemented recording pipeline runnable now, waive mandatory live actions, or certify unfinished assessment requirements through appearance.

## 5. One connected story

“BCIS staff bill a synthetic household, receive and verify its payments, review route arrears and a collector's remittance, correct a payment with preserved history, then protect and verify the records.”

Use **Mara Demo / DEMO-MAIN** as a lookup key for the main subscriber; actual account/invoice/payment IDs and generated numbers must be discovered. Her Internet service costs ₱999, begins billing in September 2026, and has one genuinely prepared September invoice dated September 30, due October 10. Set `dueDay=10` explicitly. Do not generate an October invoice dated October 31 while presenting an October 12 current-date story. Other subscriber records on the same area/route provide realistic overdue and collection context. These names/keys are proposals, not existing database facts.

Sequence and causality:

1. Introduction establishes the three-client/API/PostgreSQL purpose and clearly discloses automated synthetic demonstration.
2. Administrator verifies live connection and opens Mara's service, then displays the genuinely prepared September bill and matching posted debit. The activity permits display instead of generation; prior fixture preparation is disclosed. The recorded payments create the subsequent visible changes.
3. Cashier receives ₱500; the receipt and ₱499 remaining establish why another payment is needed.
4. Cashier submits synthetic GCash proof for ₱499. Auditor checks the separate synthetic receiver record and verifies it. Pending upload alone does not pay the invoice; the verification does. Retrying the reference shows protection against double collection.
5. Auditor reads the ledger/SOA from the server and sees the same invoice settled to zero.
6. The same collector route still has overdue subscribers. Filtering finds **Nilo Demo / DEMO-AR**, connecting receivables to the collector workflow.
7. Collection Supervisor opens that route's prepared ACTIVE batch, records Nilo's new ₱500 collection, and shows a ₱500 remittance shortage. An explicit counted-cash correction retains the discrepancy history before zero reconciliation and closure.
8. Auditor reverses Mara's original Cash payment with a meaningful correction reason. Her GCash payment remains valid; the original Cash receipt is voided and ₱500 due returns.
9. Management exports reflect currently posted payments and the preserved collection correction. A report is a consequence of the transactions, not an unrelated sample file.
10. Cashier cannot access privileged operations. Administrator corrects a synthetic contact through the existing form; Auditor reloads the profile and sees the saved replacement. Local clients show fresh server results across roles, and the owned API outage/recovery demonstrates understandable connection handling.
11. Owner creates/verifies a backup of this final state. A short card explains the real separate-target restore evidence and states the physical-LAN/live-defense limits.

Cards: white background, dark `#0F172A` text, at least 32 px body and 44 px heading, 2–4 short lines, no decorative animation. Keep a small “Automated demo · Synthetic data” label. Suggested exact copy:

- Intro: “BCIS working prototype. Invoice, Cash and verified GCash, collector accountability, audit, and recovery. Automated desktop demonstration using synthetic data.”
- GCash lead: “An uploaded image records a pending claim. Only receiver-history confirmation posts the payment. All payment evidence here is synthetic.”
- Collections lead: “A ₱500 shortage must remain visible. A confirmed cash correction preserves the original remittance before reconciliation.”
- Security lead: “Each role has its own session. The API enforces permissions even when called directly.”
- Closing/restore: “Backup verified. Restore is tested separately against a disposable database with financial comparisons. Local clients shown; physical LAN and live technical defense remain separate.”

Longer technical explanation belongs in the supporting Markdown, not a dense card. Record cards as actual browser content switched to on the desktop, not replacement screenshots or fake application screens.

## 6. Requirement-to-batch coverage matrix

| Requirement | Primary chapter | Supporting evidence / limit |
|---|---|---|
| D01 | B02 | Real Administrator login; readiness and dashboard. |
| D02 | B03 | Existing synthetic Internet account opened and identified. |
| D03 | B03 | Genuine prepared invoice/debit displayed; finalized-period preview shows Already billed/zero pending. |
| D04 | B04 | New partial Cash; receipt preview, optional actual print UI. |
| D05 | B05 | Proof submission, pending, receiver-confirmed verification, duplicate error. |
| D06 | B06 | Same main account's fresh ledger and SOA. |
| D07 | B07 | Same route's overdue account, aging/filter. |
| D08 | B08 | Open batch, new collection, submit/remit, visible shortage warning/unavailable controls, correction/reconcile/close. |
| D09 | B09 | Same Cash payment reversed and audited. |
| D10 | B10 | Same monthly report saved PDF and XLSX; genuine PDF viewer. |
| D11 | B11 | Cashier UI and real direct API 403. |
| D12 | B12 | New verified backup; actual prior/fresh isolated restore explained. |
| D13, conditional | B11 | Separate local processes; physical PCs explicitly pending. |
| AT-01/03/04 | External pre-record acceptance package | Exact examples tested and retained; no invented on-screen pass. |
| AT-02/05/06/08/10 | B04/B05/B09/B08/B11 | Matching visible amounts/guard states plus independent financial/server assertions; shortage API rejection retained separately. |
| AT-11 | B03 preview plus external acceptance package | Actual duplicate finalization/count assertions outside footage; UI preview is illustrative evidence, not the test result. |
| AT-07/12 | B08/B12 plus external package | Independent pure-balanced fixture and isolated restore drill remain separate from footage. |
| AT-09 | B11 plus external package | Local concurrency assertions; physical-PC acceptance pending. |
| Architecture/security explanation | B01/B11/B12 cards | Genuine source/test evidence and live defense are still needed. |
| §8 dataset | Preflight; context in B02/B07 | Full scenario/count report, not 50 repetitive subscriber clicks. |
| Supplementary core extras | B03/B08 | Existing global search and route-sheet snapshot; native print preview only if feasible within budget. Not scored §15 bonuses. |
| §15 bonuses | None verified | No claim or time allocated to missing optional enhancements. |

## 7. Detailed batches and timing budget

### 7.1 Budget and outputs

Budgets include cards, natural typing, actual loading and readable holds. The sub-budgets below are **card / interaction-and-typing / expected waits / evidence holds** in seconds. Loading estimates are not guarantees.

| ID / story purpose | References | Role/session | Preconditions / screens | Budget (split) | Time range | Output |
|---|---|---|---|---:|---|---|
| B01 Introduce office workflow | §2, §11, §12 | Card browser | Ready isolated desktop; intro tab | 14 (14/0/0/0) | 0:00–0:14 | `01_introduction.mp4` |
| B02 Establish live authenticated office | D01 | Administrator/client A | App login; private credentials; Dashboard | 28 (0/16/4/8) | 0:14–0:42 | `02_administrator_connection_dashboard.mp4` |
| B03 Establish subscriber debt | D02–03, AT-11 preview | Administrator/A | Main service and prepared September invoice/debit; Subscribers/Billing/Invoices/ledger | 46 (0/32/4/10) | 0:42–1:28 | `03_subscriber_monthly_invoice.mp4` |
| B04 Receive partial Cash | D04, AT-02 | Cashier/client B | B03 persisted; Receive payment/receipt | 42 (0/30/3/9) | 1:28–2:10 | `04_partial_cash_receipt.mp4` |
| B05 Verify GCash once | D05, AT-05 | Cashier/B → Auditor/client C | Main outstanding ₱499; local synthetic proof/receiver log | 54 (5/35/4/10) | 2:10–3:04 | `05_gcash_proof_duplicate_guard.mp4` |
| B06 Read resulting ledger/SOA | D06 | Auditor/C | B05 persisted, September 1–October 12 range; Subscribers | 28 (0/17/3/8) | 3:04–3:32 | `06_subscriber_ledger_statement.mp4` |
| B07 Find route arrears | D07 | Auditor/C | Seeded overdue cases; Receivables | 30 (0/19/3/8) | 3:32–4:02 | `07_overdue_aging_filters.mp4` |
| B08 Reconcile collector accountability | D08, AT-08; AT-07 rule | Supervisor/A after private role setup | ACTIVE route batch with genuine ₱19,500 prior collections; Collection batches | 60 (4/41/5/10) | 4:02–5:02 | `08_collector_remittance_shortage.mp4` |
| B09 Correct main Cash with history | D09, AT-06 | Auditor/C | Main original Cash payment eligible; History/Audit | 32 (0/21/3/8) | 5:02–5:34 | `09_payment_reversal_audit.mp4` |
| B10 Export management result | D10 | Auditor/C → PDF browser | B09 committed; Reports/native Save/browser | 36 (0/24/4/8) | 5:34–6:10 | `10_management_pdf_xlsx_exports.mp4` |
| B11 Show restrictions, shared state, recovery | D11, conditional D13, AT-10 | Cashier/B, Auditor/C, Administrator/A | All local sessions active; real terminal helper, Dashboard/History | 42 (4/27/3/8) | 6:10–6:52 | `11_role_clients_recovery.mp4` |
| B12 Protect final records and close | D12, §11.2 limits | Owner/A after private role setup | PG tools ready; Backup and recovery/card browser | 38 (8/16/5/9) | 6:52–7:30 | `12_backup_restore_closing.mp4` |
| **Total** | **D01–D12 plus qualified local D13** | | | **450 (35/278/41/96)** | **7:30** | `99_complete_demo.mp4` |

Reserve **29 additional seconds** for normal variation, giving a 479-second operational ceiling. Final encoded duration must still be <480. At 30 fps the target is 13,500 frames; fail if the final result reaches 14,400 frames or reports duration >=480. Time/frame/mux duration checks all apply.

### 7.2 Ordered actions, visible checkpoints, and retry rules

**B01 — Introduction (14 s).** Preconditions: preflight passed, desktop notifications closed privately, card browser already on intro. (1) Start full-desktop capture. (2) Hold readable card for 12 s. (3) Move pointer to app taskbar/window and switch naturally in the final 2 s. Evidence: truthful purpose, automation and synthetic-data label. Retry: media-only, no database mutation; preserve the completed take until a new one passes.

**B02 — Administrator connection/dashboard (28 s).** (1) Show actual BCIS login and enter the Administrator username and masked password; disable typing logs for secret entry. (2) Sign in; assert the effective role and dashboard heading. (3) Click **Check connection**, wait for API online/DB ready. (4) Scroll just enough to display real KPI values. Hold ready state and role badge. Retry from the baseline checkpoint; a network error must remain an error, not be replaced with a fabricated ready state.

**B03 — Subscriber/monthly invoice (46 s).** (1) Use existing global search for Mara's discovered account number/name; optionally type `Mraa`, pause, and correct to `Mara` **before submitting**. Open the correct record. (2) Show active Internet service `NET-50`, current rate ₱999 and September billing start. (3) Open **Invoices**, set billing month to September 2026 and search the discovered invoice number (the panel has no subscriber filter), then display her actual prepared September invoice, total ₱999, invoice date September 30 and due October 10. (4) Open her ledger and hold the matching ₱999 debit with its real posting time. (5) Go to **Generate billing**, set `2026-09`, **Preview**, and show **Already billed**/zero pending. Do not invent a conflict popup or a finalize button where the finalized/zero-pending UI hides it. The independent AT-11 test really calls finalization twice and compares invoice counts off camera. This uses the expressly allowed generate-or-display path; it does not claim invoice generation was recorded. Retry: read-only baseline restore if state drifted; no repeated financial submit is needed. Removing new bill finalization from footage frees time for slower search, form reading and visible correction.

**B04 — Partial Cash/receipt (42 s).** (1) Switch visibly to client B, already privately authenticated as Cashier; show role badge. (2) **Receive payment**, search the same account, select Mara; hold ₱999 outstanding. (3) Type `500.00`, keep method Cash, **Preview allocation**; hold ₱500 allocated and ₱499 remaining. (4) **Confirm and issue receipt**, wait for persisted receipt. (5) Hold account, unique receipt number, Cash and ₱500. (6) Open actual print UI if the rehearsal succeeds; preview and cancel, without claiming physical output. The application's receipt preview is the mandatory fallback allowed by D04. Fresh-read invoice/payment/ledger afterward. Retry: after uncertain response inspect the owned DB first and retain the same command key if resubmitting the same intent. A committed take that must be rerecorded requires checkpoint restore and downstream invalidation.

**B05 — GCash proof/verification/duplicate (54 s).** (1) Show the 5 s lead card, then switch back to Cashier. (2) **Submit GCash proof**, find Mara, enter `499.00`, synthetic sender name/contact and the run-specific reference using the slower field-by-field profile; pause to check labels, and use the **real file picker** for the watermarked synthetic PNG. Amount, contact and reference have no intentional errors. (3) Submit and hold **PENDING**; assert no new payment yet. (4) Switch to Auditor C, **GCash proofs**, open this exact reference and actual image. (5) Switch briefly to the browser's labelled synthetic receiver-log tab; match receiver reference/amount/status, then return to BCIS. (6) Check **Receiver GCash history confirmed**, click **Review verification and posting**, and confirm **Verify and post GCash payment**; hold VERIFIED/payment/receipt evidence. (7) Switch to Cashier, submit the same proof/reference with lowercase/hyphen variation; hold the genuine duplicate error, then clear the rejected form. Check exactly one verified payment and one receipt. Retry: proof submission and verification state must be reconciled before retry. For a clean retake restore pre-B05, not a direct DB deletion of posted payments. Never use real GCash credentials or claim a synthetic receiver log is an official provider connection. This chapter has the greatest typing/timing risk; move contingency here before speeding up.

**B06 — Ledger/SOA (28 s).** (1) Return to Auditor C and search Mara. (2) Set September 1–October 12 and refresh ledger, adjusted to the actual recording day if different. (3) Hold debit ₱999, Cash credit ₱500, verified GCash credit ₱499, running zero. (4) Open **Statement of Account**, apply the same range, **Preview**, and hold zero closing balance and account/date identifiers. Ledger posting time is distinct from the September invoice date; show actual values. Retry: read-only; refresh against the recorded B05 state. Do not proceed if ledger and invoice disagree.

**B07 — Overdue/aging (30 s).** (1) Open **Receivables**, set as-of `2026-10-12`. (2) Show aging buckets and total. (3) Filter the shared area/collector and a populated overdue bucket; find Nilo. (4) Open/show oldest invoice, months unpaid and arrears; identify the same route/collector for B08. Nilo begins with three unpaid ₱999 invoices (July–September), ₱2,997 due. Other synthetic accounts populate the 91+ bucket. Retry: read-only; restore filters and as-of date, not monetary state.

**B08 — Collector remittance/shortage (60 s).** (1) Show 4 s accountability card. Switch to Collection Supervisor A (authenticated privately between chapters). (2) Open the designated internal **ACTIVE**, visibly **IN PROGRESS**, batch for the same route/collector; identify that it already contains ₱19,500 of synthetic prior collections and show the actual route-sheet snapshot table. If timing and the print pilot allow, briefly open/cancel **Print route sheet** as a supplementary core feature. (3) **Record cash collection**: select Nilo's discovered route account, type `500.00`, review, **Post collection**. Hold cumulative ₱20,000 and independently verify its receipt; this panel is not assumed to open a receipt automatically. (4) **Submit batch**, type `19500.00` and **Save remittance**. (5) Hold signed difference `-₱500` and the real warning that the batch cannot reconcile/close until exact match; reconcile and close are unavailable. Do not manufacture a click/error response. A genuine direct API refusal is retained in separate acceptance evidence. (6) Enter the shorter meaningful reason **“Synthetic cash recount confirmed”** slowly, check the counted-cash box, **Record exact-match correction** to ₱20,000; show original ₱19,500 remittance retained. This is a training cash-count scenario, not a write-off. (7) **Reconcile balanced batch**, **Close batch**, confirm the actual close dialog. Hold CLOSED/zero. Retry: restore pre-B08 checkpoint; never use stale versions or overwrite original remittance. Drop optional print preview before mandatory evidence or readable input if timing is tight.

**B09 — Reversal/audit (32 s).** (1) Auditor C opens **Payment history**, filters Mara and selects the discovered B04 Cash payment, not the GCash or collector payment. (2) Reverse with reason “Synthetic correction: Cash entry posted to the wrong account.” Confirm the real dialog. (3) Hold REVERSED and the voided original receipt; fresh ledger/invoice shows ₱500 due. (4) **Audit history** (filters are action, entity type and dates only; no subject filter): narrow by action and today's date, hold actual actor, reason and reversal event. Retry: detect existing reversal and do not issue another. A retake needs pre-B09 checkpoint restore plus downstream regeneration.

**B10 — Reports/export (36 s).** (1) Auditor opens **Reports → Monthly collections**, sets October 1–12, **Preview**. (2) Hold actual collection totals, with reversed Cash excluded and Mara's ₱499 GCash retained. (3) **Save PDF** and select the run's `reports/` path in the real native dialog. (4) **Save XLSX** similarly. (5) Open the newly saved PDF in a real Chrome/Edge tab, show report title/dates/totals and briefly switch to the other genuine evidence tab and back. Inspect workbook with ExcelJS off camera; show an actual installed spreadsheet viewer only if available and time permits. File-save messages plus independent parse are required; no fake workbook UI. Retry: reuse persisted financial state and create attempt-specific report paths; validate files before marking complete.

**B11 — Roles/local clients/recovery (42 s).** (1) Show 4 s security card and Cashier B's role badge/navigation; User accounts and Backup controls are absent. (2) Switch to a genuine terminal and run the prepared real-request helper for GET `/api/v1/users` using the Cashier session privately; hold role, path, **403**, and actual error code. Never echo a bearer token or credential command. (3) Client A, privately reauthenticated as Administrator before this chapter, opens Mara's **Manage contacts → Edit** for a prepared secondary contact of type **OTHER**, sets **Contact value** to `Demo desk B`, then **Save contact changes**. Client C independently reloads/opens the same profile and shows the saved active replacement; the server retains the prior row inactive. The real contact form exists; a notes-edit UI does not. The primary mobile/reference/financial identity is unchanged. Supervisor lacks `subscriber.update`. This is local concurrent-client evidence. (4) Stop **only the run-owned API process**, click Dashboard **Check connection** to show offline/unavailable, restart and check online/ready. No financial command is submitted during outage. External lost-response-after-commit evidence remains distinct. Retry: watchdog recovers API; preserve the saved contact state, not an invented note marker. If timing cannot fit the real contact form and recovery, keep D11/local-client fresh reads and remove optional outage first, documenting it in the manifest.

**B12 — Backup/tested restore/closing (38 s).** (1) Owner A, authenticated privately between chapters, opens **Backup and recovery**. (2) Show actual tool readiness, **Create backup**, wait for newly CREATED archive, then **Verify**. (3) Hold VERIFIED, size/checksum/catalog result. (4) Switch to an 8 s white closing card explaining the separate-target restore drill, financial comparison, local-client qualification and live-defense boundary. Use the fresh run drill's date/hash if performed; otherwise identify the 2026-10-04 evidence as prior local evidence and mark current-version restore pending. Do not show a stale result as a fresh test. Retry: inspect backup history for the created archive; take a new read-only snapshot if a new take is needed. No in-place restore of the story database.

### 7.3 Rehearsal and cuts

Perform an unrecorded technical rehearsal on a disposable clone first, then two full capture rehearsals from identical baseline state. Measure individual action, OS-dialog, query, card and hold durations and review at normal speed. Pre-authentication between chapters is permitted and must be documented; do not use invisible API writes to replace recorded payment/verification/reversal actions.

Reduce repetition first: remove optional print-dialog interaction (keep receipt preview), route print preview (keep real snapshot), extra workbook-viewer opening, optional B11 outage, repeated scrolling and duplicate dashboard tours. Keep every mandatory action, amount, role and error readable. Planned input imperfections share a total 6-second sub-budget inside the existing action budgets; remove staged harmless imperfections before shortening mandatory holds. Slower typing is not a license to accelerate footage afterward. Spend the 29 s contingency on real loading/native dialogs. If the readable rehearsals still reach 480 s, report the conflict and revise scope/timing with the user; do not publish a supposedly complete overlong or incomplete result.

Estimated viewing duration: **7:30**. Future end-to-end generation wall time is longer: provisional **20–40 minutes after prerequisites**, including fixture setup, checkpoints, capture, encoding and automated inspection; first setup/rehearsal/manual review may take substantially longer. Measure and report actual wall time rather than treating this estimate as verified.

## 8. Capture tooling and interaction style

### 8.1 Selected approach

Use **FFmpeg gdigrab full-desktop region capture** as the default, because installed help confirms its availability, native pointer capture and region controls. Raw capture goes to MKV, no audio input. Record a verified 1920 × 1080 primary display/region at 30 fps with `draw_mouse=1`. Set offsets from actual monitor geometry; do not assume (0,0) on a multi-monitor desktop. The official [FFmpeg gdigrab documentation](https://ffmpeg.org/ffmpeg-devices.html#gdigrab) describes desktop-region and mouse capture.

Use existing **Playwright Core** to attach to/inspect real Electron controls, wait for conditions, collect geometry and assert actual results. Use an external Windows helper built with PowerShell/.NET, Win32 `SendInput`/cursor APIs and UI Automation for **visible OS-level movement, typing, native dialogs and focus**. This helper is proposed and must be prototyped before committing to unattended generation. Playwright mouse clicks alone must not be assumed to move the OS cursor. Use normal keys rather than synthetic DOM values in recorded actions.

Playwright's Electron support is experimental and does not automatically intercept native dialogs, per its [official Electron documentation](https://playwright.dev/docs/api/class-electron). Do **not** stub `showSaveDialog`, print, proof selection, payment HTTP responses or business logic to produce success footage. Geometry/condition inspection is allowed; mutations must originate from the visible application interaction. Off-camera fixture creation and independent verification remain explicitly logged.

OBS is a fallback **only if** gdigrab fails the 30 fps/readability pilot. Use an isolated portable OBS profile/scene collection with display capture and no audio, controlled through its already-present websocket plugin after explicit local configuration. Do not overwrite the user's OBS settings or secretly install plugins. A fresh OBS technical rehearsal is required; file presence alone is not readiness. No mobile capture tool is needed because this is an Electron desktop activity.

Application-content `recordVideo` is unsuitable as primary footage: it omits native dialogs, browser chrome and terminal/window switches. Failure screenshots/traces remain diagnostics only. There is no screenshot animation or cursor drawn over static application images.

### 8.2 Natural, reproducible interaction — revised human-input profile

The user specifically rejects continuously smooth/gliding cursor animation and near-instant form filling. The revised profile must resemble ordinary desktop work: coarse pointer placement, braking, a stop, occasional small correction, reading a label, typing a short burst, checking it, then moving to the next field. Variation does not mean jitter, arbitrary wrong actions or a claim that automation was manual.

- Seed bounded variation once per run. Use **piecewise movement with nonuniform velocity and real stops**, not one continuous Bezier/sinusoidal/ease-in-out path applied to every target. A typical move uses 2–5 short directional segments: a quick coarse move, deceleration, 80–250 ms stop, and an optional short final correction. Some nearby moves are a single short movement and stop. Do not move the cursor while the operator would be reading.
- Near targets, keep occasional overshoot around 2–7 px **inside a safe target neighborhood** followed by one correction. Stop on unexpected geometry/focus changes. Repeated perfect centering is avoided, but never click another account or neighboring destructive control as “human error.” Keep most movement direct; no cinematic arcs or constant-speed sliding.
- Typical ordinary movement 220–750 ms; selected decision pauses 350–1000 ms. After opening a form, read labels for 500–1200 ms. Use measured physical screen coordinates, DPI and current window bounds; DOM mouse movement alone does not prove OS cursor movement.
- **Visible text entry:** nominal 140–320 ms per character, with short bursts and 300–800 ms pauses at words/field boundaries. Use 180–400 ms per digit for reviewed money/reference inputs where useful; exact IDs may be typed in small groups. Pace is field-specific rather than identically slow everywhere. Never `fill()`/paste a whole form on camera to create instantly completed fields. Native file paths may use the normal file-picker path field, with that choice logged.
- Read what was entered for 600–1200 ms before proceeding. Revisit one harmless text field once if scheduled. Tab or click naturally between fields; do not immediately click every next control at the exact same cadence.
- Password entry is masked, and secret input never receives staged spelling mistakes, exposure, or action/trace/clipboard logging. Secret preparation may remain private. All monetary values, selected account identities, provider references, verification flags and confirm buttons are correct before any submit.
- Scroll in short wheel bursts separated by stops, usually 180–380 px, with occasional smaller final adjustment and 450–900 ms reading pauses. Hold important amounts/statuses for 2–4 s as budgeted. Actual readiness controls waits; elapsed time alone is not success.
- Add a small subdued click ring for 120–180 ms using a separate transparent, noninteractive desktop overlay tied to **actual** OS click events. Verify it appears in capture and does not steal focus or obscure labels. It must not simulate application controls.
- Keep full Windows/Electron/browser chrome where useful. Cards and PDF/receiver-log views use actual browser tabs; switch visibly. Electron itself is not represented as a browser tab.
- Lock the capture runner to one interactive desktop with an exclusive run lock; parallel role operations may be prepared via separate clients, but physical cursor actions remain serialized. Stop on unexpected focus or user activity rather than clicking an unknown window.
- Close unrelated sensitive windows privately and suppress notifications only within the owned recording session. Restore changed display/session preferences afterward; never terminate unrelated user processes.

### 8.3 Bounded harmless mistakes and corrections

Use **at most two corrected text mistakes and one harmless missed click in the entire video**, scheduled in nonfinancial fields. Not every field/chapter should contain a mistake. Store the exact planned before/after text and timing seed, and make the action log say `planned_harmless_correction`; do not label it a spontaneous/manual event.

| Scene | Optional visible imperfection | Required final result / guard |
|---|---|---|
| B03 search | Type `Mraa`, stop 450–900 ms, backspace/retype to `Mara`, then search. Alternatively omit the mistake and simply pause to check. | Only submit the corrected search. No wrong subscriber is opened. Final account is matched by discovered ID/number. |
| B08 correction reason | In `Synthetic cash recount confirmed`, briefly type `recout`, stop, use Backspace to fix to `recount`, then finish. | Final complete reason is reviewed; amount/count confirmation untouched. No incorrect mutation is submitted. |
| B11 nonfinancial contact form | One click on a known blank form margin near the intended input, pause 250–500 ms when focus did not change, then click **Contact value** correctly. | Helper asserts no submit, route/account change or destructive action occurred. Skip if the safe blank area cannot be proven from geometry. |

Backspace at roughly 100–220 ms per character; corrections should be noticeable without becoming a comedy routine. These imperfections share **no more than 6 seconds** across all chapters, already included in interaction budgets; they must not consume mandatory evidence time. If slower typing causes an overrun, remove the optional mistakes/extras before shortening readable financial checkpoints.

Never introduce a wrong amount, wrong subscriber, duplicate receipt, unconfirmed GCash verification, misleading server failure, accidental reconciliation, reversal, backup restore or password error for naturalness. The assessment's actual duplicate-reference and shortage scenarios are separate deliberate business demonstrations, with real validation responses, not staged random mistakes.

The future timing prototype must count actual typed characters and native-dialog interactions per chapter. If B05 cannot fit 54 s with this profile, allocate part of the 29 s contingency or reduce repeated navigation; do not silently revert to instant typing or speed up footage. Captured cursor trails must show stops/nonuniform segments, and the human review explicitly checks that the motion no longer resembles smooth animation.

Normalize successful raw takes to H.264, yuv420p, 1920 × 1080, `fps=30`, CFR, square pixels, no audio, consistent timebase and `+faststart`. Start with libx264 CRF 18–20 and a preset the machine can sustain; validate small text after encoding. Encode after capture where possible to reduce capture load. Do not speed up footage to satisfy the cap.

## 9. Sample-data and session strategy

### 9.1 Owned environment

Default proposal: a **private PostgreSQL cluster**, started from installed PostgreSQL tools on a free loopback port, preferred `55432`; database `bcis_demo`, separate restore target `bcis_demo_restore`. Both must be verified against their cluster path, port, database identity and run ownership before mutation. Tool discovery for `initdb`/`pg_ctl`, permissions and actual port availability is a future prerequisite, not a verified fact.

Use preferred API port `4112`; reserve/check separate local CDP ports `9241`, `9242`, `9243`. Serve cards on loopback `4182` if free, or use local file tabs. Record resolved endpoints in a sanitized manifest and never attach to someone else's listener. A dedicated run cluster avoids stopping the shared Windows PostgreSQL service or mutating `bcis`, `bcis_test`, or `bcis_restore_test`.

Run migrations and seeds through the existing reviewed tooling with the **explicit owned target**, privately supplied environment and no existing `.env` rewrite. Build copied current source (including approved dirty files) in a run-local work area excluding secrets, `node_modules`, previous outputs and generated artifacts; use the existing locked dependency store via a separately prepared install if needed. Dependency preparation happens only after future implementation authorization. Do not let a demo build replace the user's normal `out/` or `release/` artifacts.

Align copied renderer's `VITE_BCIS_API_BASE_URL=http://127.0.0.1:4112`, Electron `BCIS_API_ORIGIN` and API `BCIS_ALLOWED_ORIGINS` (explicit `null` for file-origin source-built clients; card origin only if actually needed). CSP alone does not set the API client URL. Record source/build hashes. Any renderer dev servers must have separate owned ports and consistent origins; default to source-built actual Electron assets, not a renderer-only preview.

Existing guarded tests are intentionally hardcoded to `bcis_test`/19 migrations; **do not weaken their guards** or run them against the new name by accident. Reuse their assertion ideas in the demo's own strictly owned verifier. Existing static tests can run unchanged; any rerun of shared-target integration tests remains a separate explicitly scoped task.

### 9.2 Synthetic records and exact state transitions

Use stable semantic fixture keys in the manifest, discover generated UUIDs/numbers from API responses or parameterized lookup queries, and assert a unique match. Do not assume seed UUIDs, sequence values, first list options or static receipt IDs.

| Fixture | Proposed preparation | Expected state |
|---|---|---|
| Office | At least 5 users: Owner, Administrator, Cashier, Collection Supervisor, Accounting Auditor; optionally Viewer/Technician | Private random credentials, exact effective permissions recorded without secrets. |
| Catalog | Existing seven plan types: 3 Internet, 2 Cable, 2 Combo; 2 collectors, 3 areas/routes | Preserve synthetic original rates; do not overwrite any shared catalog. |
| General subscribers | At least 50 synthetic subscribers and 60 services across all three types; use existing master seed once, then controlled fixture additions | Contacts clearly synthetic; counts and relationship integrity asserted. No real customers/providers. |
| Main household | Mara Demo with fixture key DEMO-MAIN; active NET-50 at 99900; billing begins `2026-09-01`, dueDay 10; shared route/collector; no debt before September/credit; secondary nonprimary OTHER contact `Demo desk A` | Baseline already has one genuine September invoice (September 30/October 10), 99900 due. B03 displays it; B04: 49900 due; B05/B06: 0; B09 onward: 50000 due. B11 changes secondary contact to `Demo desk B` through existing UI, preserving history. |
| Main proof | Watermarked “SYNTHETIC TRAINING PROOF”; run reference `DEMO<run-token>499`; amount 49900, training sender/receiver record | PENDING does not change ledger; verified once yields one payment/receipt; normalized repeat blocked. |
| Route overdue | Nilo Demo / DEMO-AR, same route; three 99900 unpaid invoices for July/August/September 2026 | B07 outstanding 299700; B08 new collection 50000 → 249700. |
| Aging population | At least ten overdue accounts across current/1–30/31–60/61–90/91+ buckets, with June or earlier due dates where needed | As-of `2026-10-12`; bucket totals equal outstanding invoice totals. Three billing months minimum; use four or more where aging requires it. |
| Active collector batch | Same route/collector, enough eligible unpaid route balances; created/started off camera; real prior API Cash entries total 1950000 from other subscribers | B08 opening honestly ACTIVE; new 50000 → total 2000000; remit1950000 → difference -50000; exact correction2000000 → 0; original preserved; reconciled/closed. |
| Other acceptance cases | Separate exact999, advance1000/3000, Aug/Sep999/1200, pure-balanced20000 fixtures | Independent expected-centavo tables and pass/fail results. Do not contaminate Mara's debt or receipt story. |
| Service-control examples | At least two synthetic suspension/reconnection scenarios prepared via currently supported workflow with distinct authorized actors | Validate actual approval rules; record fee/technician-policy limitations. If blocked, report §8 dataset incompleteness and do not invent policy. No full service-control scene is required by §11.1. |

Create historical seed invoices through domain-approved fixture paths with financial invariants, not arbitrary edits to posted balances. Existing activation dates need controlled adjustment **before** first billing in the disposable fixture so selected months bill the intended accounts. Create Mara and the other intended September services **before finalizing September**: `BillingService.finalize()` returns existing results for a finalized cycle and will not insert a late-created subscriber's invoice on a second run. The main subscriber is not eligible for June–August because its billing start is September. No October invoice is needed for her story. All off-camera prepared transactions appear in the fixture report. A prepared batch/invoice is clearly “opened/displayed,” not presented as newly created on camera.

Anchor aging to `2026-10-12`, collection reports to October 1–12, and main ledger/SOA to **September 1–October 12**. Invoice dates are period-end; ledger posting dates and payment dates are actual transaction timestamps. The application timestamps posting using the real clock; **do not change the system clock or falsify payment timestamps**. If actual recording occurs later, regenerate date-dependent fixtures and update all cards/filters/expected ranges together, preferably billing the previous completed month. Preserve money expectations and aging distribution. Do not blindly use the old smoke script's years 2400+ or 8900+ as visible demo dates.

The synthetic receiver log is a separate labelled training artifact with reference, amount and confirmed receiver transaction. It is not real Facebook/GCash integration, and no provider transaction is performed. Use local HTML/PNG assets generated by the future pipeline; no image-generation service is necessary.

### 9.3 Roles and persisted state

Run three separate actual Electron processes with independent run-local user-data directories. A launch-only wrapper outside app source may set `app.setPath('userData', ...)` **before importing the actual built main entry**, preserving preload and business behavior; verify build module format and path ordering in the prototype. Do not inject fake authentication or stub native APIs. If reliable profile separation cannot be established, block multi-client recording until it is corrected.

Client A begins Administrator, becomes Supervisor for B08, returns to Administrator for B11, then becomes Owner for B12; role transitions between chapters are private setup with logout and query-cache clearing, documented in the manifest. Client B remains Cashier. Client C remains Accounting Auditor. Show the role badge at every visible handoff. Stored database state persists across batches; renderer memory does not. On resume, log in again privately and confirm identities, never deserialize session tokens from manifests.

Credentials stay in process memory or Windows Credential Manager, outside scripts/config/manifests/logs/recordings. Any `initdb` password file must be temporary, outside the repository with user-only ACL, and removed immediately after use. The API gets a least-privilege run-owned DB role; cluster administration is a separate private credential. Disable PowerShell transcription/debug echo and Playwright tracing while credentials are entered. Clear any temporarily used credential clipboard without disturbing unrelated clipboard content beyond the owned operation. Never display connection URLs containing passwords.

## 10. Checkpoints, retries, recovery, and cleanup

### 10.1 Run and batch state contracts

Proposed run states: `PREPARED → REHEARSED → RECORDING → VERIFYING → ASSEMBLING → COMPLETE`; failures produce `FAILED` with the last intact checkpoint. “Complete video” is separate from “fully accepted application.”

Per-batch record: ID, input checkpoint hash, semantic fixture IDs/generated numbers, source/build digest, role identities (no token), attempt ID, capture monotonic start/end, card/window/action timestamps, post-action assertions, output hash, exact frame count/duration and status. Batch status is `PENDING`, `RECORDING`, `CAPTURED`, `VERIFIED`, or `FAILED`. Only VERIFIED footage is eligible for assembly.

Create consistent owned-cluster `pg_dump` checkpoints **before and after** each financial mutation chapter B04/B05/B08/B09. Also retain the prepared baseline for read-only B03 and the contact-state checkpoint around B11. Checkpoints include whole database and necessary fixture assets, not just selected row exports. Quiesce writes at the boundary, verify dump/catalog/hash and keep a logical financial snapshot. Persist the current manifest atomically.

Read-only chapter retries can reuse their committed input state. A media-normalization failure reuses original raw capture and does not replay application actions. A mutation retake restores its **pre-chapter checkpoint into the owned cluster**, revokes old sessions, reauthenticates privately and regenerates dependent chapters. Never delete a posted payment to make the UI look fresh.

### 10.2 Dependency-aware resume

Main dependency chain: `B01 → B02 → B03 → B04 → B05 → B06 → B07 → B08 → B09 → B10 → B11 → B12`. Read-only scenes still depend on the correct historical financial state. B03 displays a real baseline invoice; B11 adds an authorized secondary-contact replacement; B12 must back up the final committed state.

`-Resume` validates manifest/source/build/fixture/media hashes and restores the checkpoint appropriate to the **first missing batch**, rather than recording an early scene against the final-state database. `-RetryBatch 05` archives the old take, restores pre-B05 and invalidates B05–B12 for assembly. Successful predecessor media remains unchanged. Later existing media stays on disk as superseded evidence and is never silently deleted.

A UUID `commandKey` belongs to one Cash intent and is retained after an uncertain response. First query persisted status; retry only the same intent/key when the UI still owns it. Full financial retakes use database restore, not another new key against the committed state. GCash references are per fixture/run; verification is reconciled by proof/payment ID. All versioned collection actions reread current versions; never blindly replay a stale version after a 409.

### 10.3 Service ownership and failure recovery

Before launch write owned PID, executable path, process start time, cluster data path, bound endpoint and run ID to the private runtime registry. Revalidate identity before stop/restart. Never stop a process merely because it owns a desired port; choose a free port or fail. Never invoke `Stop-Service` for shared PostgreSQL or terminate all Node/Electron/Chrome processes.

The optional B11 outage stops only the run's API child process while PostgreSQL remains available. Parent `finally` plus an independent run-owned watchdog must restart it if capture/controller fails, then confirm ready. A sudden machine shutdown leaves a recovery marker; the next invocation repairs owned services before resume. Do not claim a watchdog survives power loss. If the user interrupts the run, stop recording gracefully, recover the API, preserve raw footage and report exact state.

Stop FFmpeg gracefully (`q` on its private input channel), await process completion, probe the MKV, normalize to a temporary MP4, verify, then rename atomically. If forced termination occurs, inspect surviving MKV; do not label truncated footage verified. Keep earlier VERIFIED chapters, raw takes and reports after later failures. Do not concatenate a partial recording to fill a missing scene.

Default cleanup stops only owned app/browser/capture/API/watchdog/private-cluster processes, revokes synthetic actors and removes short-lived secret material. Retain raw media, checkpoints and nonsecret artifacts for retry/review, with backups in a restricted local directory. Recursive deletion of a run is a separate explicit maintenance action, preceded by resolved path/ownership checks. Preserve all prior run directories and the user's databases/services/configuration.

## 11. File/folder structure and exact proposed filenames

Only this plan exists as a result of the current task. **Every implementation file below is proposed.** Prefer the existing source workspace dependencies and pure Node/PowerShell built-ins; no root package or unrelated app changes are required.

| Proposed file | Purpose |
|---|---|
| `tools/demo/Invoke-BcisDemo.ps1` | Root entry point; validates options, run lock, environment ownership, launch/recovery and Node runner exit code. |
| `tools/demo/windows-desktop.ps1` | Persistent JSON-lines IPC helper for Win32 pointer/keyboard, UI Automation, native file/print/save dialogs, focus and measured DPI. No secret arguments/logging. |
| `tools/demo/click-overlay.ps1` | Owned noninteractive subtle click indicator tied to real click events; no application UI simulation. |
| `tools/demo/watchdog.ps1` | Independent owned-process/API recovery and interruption marker handling. |
| `source/tools/demo/run.ts` | Sequential orchestrator and dependency-aware retry/resume; calls fixture/capture/verify/assembly modules. |
| `source/tools/demo/config.ts` | Typed nonsecret settings, safe path/endpoint/identity guards, tool resolution and source digest. |
| `source/tools/demo/environment.ts` | Private PostgreSQL cluster, run-local source/build environment, explicit migration/seed invocation and process registry. |
| `source/tools/demo/launch-desktop.cjs` | Before-main userData separation and actual Electron main loading; preserve native bridge and record launch mode honestly. |
| `source/tools/demo/fixtures.ts` | Deterministic semantic records, synthetic proof/receiver artifacts and full §8/exact-acceptance fixture checks. |
| `source/tools/demo/sessions.ts` | Ephemeral role login, identity verification, cache/session-safe handoffs and secret-free request helper for the real 403. |
| `source/tools/demo/interactions.ts` | Playwright condition/geometry inspection mapped to native input, stopped piecewise pointer movement, slower field-by-field typing, bounded harmless-correction schedule and action event recording. |
| `source/tools/demo/batches.ts` | Ordered B01–B12 actions, refs, readable holds, pre/postconditions and names. |
| `source/tools/demo/checkpoints.ts` | Consistent dump/hash/financial snapshots, owned restores and downstream invalidation. |
| `source/tools/demo/capture.ts` | gdigrab process lifecycle, raw takes, monotonic boundaries and FFmpeg normalization. |
| `source/tools/demo/cards.ts` | Render actual browser intro/chapter/security/restore cards and labelled training receiver log. |
| `source/tools/demo/verify.ts` | Independent SQL/report/role/coverage and ffprobe/frame/secret-review outputs; fail incomplete results. |
| `source/tools/demo/assemble.ts` | Explicit ordered VERIFIED chapter list, concat, final probe/decode/hash and continuity boundary checks. |
| `source/tools/demo/README.md` | Actual implementation prerequisites, commands, credentials procedure, limits and recovery instructions. |
| `source/tools/demo/safety.test.ts` | Meaningful safety tests: reject shared DBs/unowned PIDs/escaped paths, preserve predecessors, invalidate downstream retakes, reject final MP4 as a chapter. |
| `.gitignore` (future narrow addition only) | Exclude `/demo-output/` and owned sensitive runtime outputs without hiding source `tools/demo` files. No change made now. |

Proposed output layout:

```text
demo-output/<run-id>/
  mp4/
    01_introduction.mp4
    02_administrator_connection_dashboard.mp4
    03_subscriber_monthly_invoice.mp4
    04_partial_cash_receipt.mp4
    05_gcash_proof_duplicate_guard.mp4
    06_subscriber_ledger_statement.mp4
    07_overdue_aging_filters.mp4
    08_collector_remittance_shortage.mp4
    09_payment_reversal_audit.mp4
    10_management_pdf_xlsx_exports.mp4
    11_role_clients_recovery.mp4
    12_backup_restore_closing.mp4
    99_complete_demo.mp4
  raw/                 # attempt-specific MKVs; never MP4s
  staging/             # partial normalization/assembly files use .part/.tmp suffixes
  logs/                # sanitized controller/capture/service logs
  manifests/           # run.json, batches.json, assembly.json; no credentials/tokens
  checkpoints/         # dumps, financial snapshots, hashes
  runtime/             # private cluster data, process registry, browser/client profiles
  work/                # isolated copied source/build outputs
  assets/              # synthetic proof PNG, receiver-log HTML, cards HTML
  frames/              # sampled frames and contact sheets
  reports/             # live exported PDF/XLSX, parse comparisons, backup manifest
  verification/        # ffprobe JSON, decoded-frame checks, coverage/acceptance/manual review
  superseded/          # old raw takes/attempt metadata; no .mp4 extension outside mp4/
```

All files with the **`.mp4` extension**, including old takes, stay under the one `mp4/` directory; if retaining superseded MP4s, place them under `mp4/superseded/` and exclude them from assembly. Non-MP4 raw media/logs/frames/backups stay in sibling directories. Final assembly staging uses a non-`.mp4` temporary suffix and explicit container format before atomic publication into `mp4/`. Preserve prior runs.

Use a timestamp plus random suffix for `<run-id>` and record Manila timezone, e.g. `20261012-153000-ph-<token>`; this is an example, not the time of an executed run. Treat run IDs as a restricted filename component and resolve all paths before writing.

## 12. Proposed single execution command

From `C:\ITSD 85 Projects\lab-04-bcis-billing-system`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\demo\Invoke-BcisDemo.ps1 -Profile LocalClients -TargetSeconds 450 -MaxSecondsExclusive 480
```

**This command does not exist yet and must not be presented as runnable.** Its future default prepares owned infrastructure, validates prerequisites and credentials privately, runs the accepted sequential chapters, verifies them and assembles the final result. It must fail before recording if mandatory prerequisites/fixtures/rehearsal approval are absent. Human quality review remains required before declaring a trustworthy final demonstration.

Proposed optional modes, using the same entry point:

```powershell
# Same source, fixtures and approved action timing; rebuild/restore the correct checkpoint.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\demo\Invoke-BcisDemo.ps1 -Profile LocalClients -RunId <run-id> -Resume

# Re-record B05 and invalidate/regenerate all dependent chapters, preserving old takes.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\demo\Invoke-BcisDemo.ps1 -Profile LocalClients -RunId <run-id> -RetryBatch 05
```

Other proposed switches: `-PreflightOnly`, `-Rehearse`, `-VerifyOnly`, `-KeepOwnedServices` (explicit opt-in only). Defaults do not install dependencies, provision privileged services globally, reuse shared databases, prompt for secrets on camera, or accept a failed coverage check. A source/fixture change requires a new run rather than reusing incompatible verified chapters.

## 13. Implementation phases and dependencies

| Phase | Authorized future work | Exit condition |
|---|---|---|
| P0 Confirm implementation scope | User instructs implementation; reread current source/handoff and preserve dirty work | Explicit implementation scope; local-client qualification retained. |
| P1 Safety and capture prototype | Preflight, owned registry, native pointer/DPI/file chooser/save/print, 10-second desktop pilot | Pointer/click indicator and native dialogs visible; readable 1080p CFR silent H.264; no app stubs. Fail here if interactive desktop unavailable. |
| P2 Disposable environment and fixtures | Private cluster/build/client profiles; migrations, semantic fixture IDs, independent exact-case assertions | No shared DB/service touched; §8 counts/scenarios and owned backup/restore drill verified or recorded as blockers. |
| P3 Sessions and narrative actions | Implement actual B01–B12 UI interactions and checkpoints; native security request helper | Genuine before/after results, role isolation, readable card text, no secret output. |
| P4 Rehearsal and recovery | Two timing rehearsals, mutation retake, controlled owned outage, interrupted capture/resume | All D01–D12 readable within 450+29 s; correct checkpoint restoration and API recovery; earlier media survives. |
| P5 Sequential capture and assembly | One command, chapter normalization/verification, explicit ordered concat | Twelve VERIFIED chapters exactly once; final file <480 s, silent H.264 1080p CFR30, no corrupt frames. |
| P6 Human review and handoff | Full normal-speed review, sampled frames, secrecy check, acceptance limits | Review record completed; limitations and actual evidence dates reported; physical LAN/live defense pending where applicable. |

No application feature implementation is silently included. If inspection/rehearsal finds a mandatory feature defect, record the blocker and request separate application-fix scope after preparing the concrete finding; never alter financial policy as a recording workaround.

## 14. Verification and completion criteria

### 14.1 Before recording

- Verify every D01–D12 row has actions, role, endpoint, visible checkpoint and chapter; D13/AT-09 local-versus-physical distinction is explicit.
- Record source/dirty-build hashes, actual tool versions, endpoint/profile/window geometry/DPI and nonsecret process identities. Confirm a real 1080p interactive session, cursor capture, free disk and stable frame pacing.
- Confirm exact roles/permissions, masked login, forced-change completion and clean client caches. Owner and Administrator must not be confused.
- Validate dataset counts and relationships, invoice uniqueness, historic snapshots, chronological ledger, oldest-first allocation and synthetic proof normalization. Ensure actual generated IDs/numbers are used.
- Prepare independent SQL expectations for main balance transitions, Nilo/collector totals, report calculations and exact AT fixtures; all authoritative comparisons use bigint centavos.
- Execute applicable unchanged static checks in the authorized implementation phase and retain outputs. Run separate owned-environment integration/rehearsal checks; clearly distinguish skipped guarded tests and historical records.
- Perform the owned isolated restore drill, verifying database identity before restore, archive hash/catalog, all relevant counts/centavo aggregates, proof bytes and report totals. Do not require a destructive restore of the story DB on camera.
- Verify actual file chooser/save/print behavior; do not treat browser download interception as native Electron save acceptance.
- Preflight failure scenes: Cashier 403, duplicate GCash 409, shortage UI warning/unavailable controls plus separate direct server refusal, finalized-cycle zero-pending preview plus separate duplicate-finalization test, optional actual owned API outage/recovery. Do not expect nonexistent buttons/dialogs. An error message is evidence only when triggered by the intended real operation.
- Two normal-speed rehearsals must preserve all mandatory actions within the timing cap; approve budgets from measured results before final run.

### 14.2 Automated media verification after each chapter and final assembly

Use the installed ffprobe according to its [official output/stream/frame documentation](https://ffmpeg.org/ffprobe.html). Proposed checks include:

```powershell
# Future generated file only; not executed during this planning task.
ffprobe -v error -show_format -show_streams -count_frames -of json <chapter-or-final-path>
ffprobe -v error -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time,duration_time -of json <chapter-or-final-path>
```

Parse outputs rather than judging console text. Require exactly one intended video stream, width 1920, height 1080, codec `h264`, pixel format `yuv420p`, SAR 1:1, `r_frame_rate` and `avg_frame_rate` 30/1, and **zero audio streams**, not merely a muted audio track. Confirm all decoded presentation timestamps are monotonic and advance by 1/30 second within one stream-timebase tick; nominal rates alone do not prove CFR. Compare decoded frame count to duration and timeline; inspect duplicate/frozen stretches separately so CFR conversion does not hide lost capture frames.

Require finite positive chapter durations, all twelve chapter totals under the approved ceiling, and **final format and video durations strictly <480 seconds**. Inspect exact rational frame/timebase values near the limit; fail safely rather than accepting a rounded “8:00.” A 450-second target is preferable to living on a boundary.

Decode each chapter and final file fully with FFmpeg's null output, rejecting errors/truncation. Normalize parameters identically before concatenation. Build the assembly from a manifest of **exactly B01–B12 in order**, each VERIFIED once, never from `*.mp4` globbing. Exclude `99_complete_demo.mp4`, superseded files and temporary outputs. Validate concat input hashes, boundary frame offsets, final frame-count sum and final output hash; if remuxing changes timebase, recheck decoded CFR.

### 14.3 Frames, content, data and secrecy

Extract first/middle/last frames from every batch plus the time of each financial checkpoint. Extract additional frames 0.5 s before, during and 0.5 s after every logged role/window/tab switch and around chapter joins. Save under `frames/`; do not place PNGs or verification reports in `mp4/`.

Automated content assertions verify actual subscriber, service, invoice, receipt, proof, batch and report relationships. Compare B04/B05/B09 invoice/allocation/receipt/ledger/audit states and B08 original/corrected remittance records with independent SQL. A successful React component render is not a financial assertion. PDF/XLSX bytes must come from the recorded export operation; compare workbook cells/totals with server preview and independent SQL for the selected reports. An existing sample report does not count.

Review the **entire** video at normal speed for readable money/text/cards, visible genuine cursor/clicks, **stopped/nonuniform pointer movement instead of smooth gliding**, readable field-by-field typing, sparse harmless corrections, actual file/print interactions, correct roles, chronological continuity, same records, fresh reads, correct error causes, and missing/obscured evidence. Full playback is required even if frame samples look correct. Confirm that no planned harmless error was submitted as a wrong financial transaction and no unavailable UI action was fabricated.

Check all frames/logs/manifests/artifacts for exposed passwords, session tokens, credential URLs, private notification content or real customer/payment data. Machine pattern checks assist but cannot replace human review. If a secret is exposed, stop publication, revoke the synthetic credential/session, quarantine the take, then rerecord affected scenes and dependent assembly. Never publish a redacted success that conceals required evidence.

### 14.4 Deliverable status and completion ledger

Retain `verification/coverage.md` mapping each D/AT reference to actual chapter/timecode or supporting evidence with status **shown**, **verified separately**, **prior evidence only**, **pending**, or **failed**. Keep physical LAN, packaged installation, physical printing, full-scale targets and live defense distinct. Record current-version restore status truthfully.

Video completion requires all D01–D12 scenes captured, independently reconciled where applicable, all media checks passed, a human review record, and complete/unique assembly. D13 is qualified as local-only by user choice. Application/assessment completion still requires outstanding physical-PC and other activity acceptance/deliverables; this pipeline must never mark the whole BCIS project accepted automatically.

## 15. Remaining questions and decisions

Decisions already resolved:

1. The supplied Markdown replaces the PDF; use its preserved pages and actual §11.1/§7/§15 references. No missing PDF path blocks planning.
2. Project root and requested document path are known; no existing demo plan was overwritten.
3. User chose **local separate clients**; keep physical LAN evidence and physical-PC AT-09 acceptance pending. No multi-PC provisioning is needed for the selected recording profile.
4. Default to real source-built Electron, desktop capture with FFmpeg, separate local roles, private demo cluster, twelve chapters, 450 s target, at most two text corrections/one safe missed click, and zero falsely claimed optional assessed bonuses. Existing global search/route snapshot are conditional supplementary core extras.
5. Existing dated restore/report/Cash evidence informs feasibility but is not relabelled as a fresh recording or packaged-client acceptance.

Future preflight must resolve display/DPI and native automation viability, installed PostgreSQL cluster tools, free owned ports, effective role permissions, complete synthetic service-control/dataset scenarios, current-version restore evidence, and achievable timings. These are explicit implementation exit checks, not reasons to guess successful results now.

No additional configuration answer is required to complete this revision. **BCIS remains unfinished; the recording pipeline is missing; no current-source feature was live-tested this turn.** The supported story can be polished after the minimum exit checks, but unsupported/full-system/physical-LAN claims remain excluded. Implementation and recording remain **not started** until explicitly requested.


## 16. Revision after review (2026-10-12) — implementation authorized

Corrections applied from the review. Application code stays unchanged.

1. **Invoices lookup:** Invoices filters only by billing month and invoice number; B03 uses month plus discovered number.
2. **Month/date inputs:** billing month, ledger/SOA ranges, receivables as-of and report ranges are native `type=month|date` inputs. Keystrokes are per segment (e.g. `092026`, not `2026-09`); typing time is recounted per scene and rehearsed.
3. **Global search:** covers account, name, contact, address, invoice and receipt only. The UI states GCash-reference lookup is unavailable pending policy approval; that is a §3.2 gap and must not be claimed.
4. **Display:** two monitors. `DISPLAY2` is primary 1920x1080; `DISPLAY1` is 1366x768 non-primary. Capture/offset/DPI are measured at preflight and the window is pinned to the primary.
5. **PostgreSQL tools:** not on PATH; resolved from `C:\Program Files\PostgreSQL8in` (v17 also installed).
6. **Profiles:** no single-instance lock exists in the main process and tokens live in renderer memory; prefer `--user-data-dir` over a launch wrapper if the pilot confirms isolation.
7. **Timing gate:** both full rehearsals must finish within **465 s**; the 479 s ceiling is not a target.
8. **Audit scene:** see B09 above.
9. **Bonuses:** a source search found no PWA, QR, SMS/email, GIS, work-order, forecasting or gateway implementation. No assessed bonus is claimed.

**Restore evidence correction:** the AT-12 restore ran 2026-10-04 at **19 migrations** (0017-0018 already applied, restored identity `bcis_restore_test`, archive SHA-256 `018f604d...c5`); it does not predate those migrations. Later source changes (Gate 6) touched only the XLSX renderer and test helpers. It is still prior local evidence, not a fresh run; a run-owned drill is added for the demo.

BCIS remains unfinished: packaged install, native printing, physical LAN and full acceptance are pending.
