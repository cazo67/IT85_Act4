# BCIS Progress and Documentation Record

Last updated: 2026-10-02 (Gate 3 collector-performance report slice)
Current stage: Gates 1 and 2 verified locally; Gate 3 in progress (auth/session, subscriber/service/plan/contact/address, invoice/SOA, payment-history/ledger, receivables/overdue, route sheet, balanced batch lifecycle, collector assignment desktop/history and as-of report, collector reconciliation and performance reports, dashboard summary, daily/weekly/annual collection, billing-versus-collection, subscriber master-list and subscriber ledger-detail report slices verified locally)
Completion claim: not complete and not finally accepted

Runtime at this handoff: Isolated API 4110/Electron 5173/CDP 9236 are stopped. Normal API 4100 is running against the ignored `/bcis` connection and `/api/v1/health/ready` returned 200. No `bcis` data was used for destructive tests.

This is the living status record for BCIS. Update it after every implementation phase. A checked item must point to retained evidence; code presence alone is not enough for live acceptance.

## Current handoff — read this first at every restart

**Operating pair:** This file records what actually happened and exactly where to resume. [BCIS_COMPLETION_PLAN.md](BCIS_COMPLETION_PLAN.md) is the single approved implementation plan, requirement map and gate definition. The [laboratory activity](BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md) is the external requirements baseline. The checklist, AT matrix, old plans and dated sections below support review but do not decide what to implement next.

**Next task:** Continue Gate 3 with a Cash payment reversal and voided-receipt report as one bounded policy-independent slice. Inspect immutable payment reversals, original payments, receipt void metadata, actor/reason audit fields and existing payment-history permissions. Define the report's date membership (reversal date versus original payment date), current-state semantics and centavo signs before implementing. Add a server-authoritative preview/PDF/XLSX report and desktop controls without enabling invoice voiding, adjustment or any new reversal authority. Prove guarded `bcis_test` original/reversal/receipt linkage, independent counts/centavos, empty/invalid inputs, Owner/authorized read-only roles, export restrictions, Electron preview and process-restart persistence; run the static gate. Revenue attribution, user/audit activity reports and administration remain separate Gate 3 slices; invoice void policy stays fail-closed. Preserve the dirty tree and Gates 1–2 evidence. Do not mark Gate 3 complete without exit evidence; clean-account install/uninstall remains Gate 6.

**Gate 3 collector-performance report (2026-10-02):** Added `collector-performance` to `report-model.ts`, `report-routes.ts`, `report-service.ts` and `ReportsPanel.tsx`. The current-state report groups batches by collector ID for an inclusive batch-date range, shows recorded account/batch counts and expected, collected and remitted Cash, and separately counts unremitted batches, confirmed signed differences, remitted batches with unresolved nonzero differences, and header/account-total mismatches. It does not infer productivity targets or settle shortage/overage. Documented formulas and current-state limitations in `docs/architecture/financial-invariants.md`; no financial posting, batch lifecycle or permission rules changed. Guarded `gate1-postgres.test.ts` focused 3/3 passed: independent batch/account/remittance SQL matched collector totals, balanced and blocked-overage fixtures remained distinct, empty/invalid/oversize ranges, Owner/Supervisor/Viewer/anonymous access, Viewer export denial and parsed PDF/XLSX were checked. Electron dev `gate3-auth-electron-smoke.ts --performance-report-only` passed Owner, Supervisor and Viewer preview, role-aware export controls and no horizontal overflow; after isolated API 4110 and desktop 5173 restart, `--expected-performance-batch=BAT-47600921-000156` passed against the same unresolved fixture (`batchDate=4760-09-21`). Full guarded Gate 1/2/3 PostgreSQL suite passed 7/7. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, workspace typechecks/builds, source-integrity and Drizzle check. `git -c core.safecrlf=false diff --check` exited 0; isolated test processes stopped and normal API 4100 `/health/ready` returned 200. No development/customer destructive test or GCash posting occurred. Physical export save/printing, installed-app/narrow-window review and remaining reports are unverified; Gate 3 remains Partial. Exact next task is above.

**Gate 3 collector-assignment as-of report (2026-10-02):** Added `collector-assignments` to `report-model.ts`, `report-routes.ts`, `report-service.ts` and `ReportsPanel.tsx`. The selected date uses the existing half-open `effective_from <= asOf < effective_to` assignment rule; each effective service assignment appears once with subscriber/service number, collector, route/area and effective dates. Subscriber/service statuses and names are explicitly current data, not historical snapshots. Summary counts assigned services, distinct subscribers and collectors. Preview requires `report.view`, `subscriber.view` and `service.view`; export additionally requires `report.export`. Documented the semantics in `docs/architecture/financial-invariants.md`; no assignment-write or financial logic changed. Extended guarded `gate1-postgres.test.ts`: focused 3/3 passed, comparing boundary dates, unique service rows and summary counts to independent SQL, empty/invalid/missing inputs, Owner/Supervisor/Viewer/anonymous access, Viewer export denial and parsed PDF/XLSX. Electron dev `gate3-auth-electron-smoke.ts --assignment-report-only` passed Owner, Supervisor and Viewer preview, role-aware export controls and no horizontal overflow; after isolated API 4110 and desktop 5173 restart, `--expected-assignment-service=SVC-0000277` passed against the same fixture (`asOf=6555-07-21`). Full guarded Gate 1/2/3 PostgreSQL suite passed 7/7. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, workspace typechecks/builds, source-integrity and Drizzle check. `git -c core.safecrlf=false diff --check` exited 0; isolated processes stopped and normal API 4100 `/health/ready` returned 200. No development/customer destructive test or GCash posting occurred. Physical export save/printing, installed-app/narrow-window review and remaining reports are unverified; Gate 3 remains Partial. Exact next task is above.

**Gate 3 subscriber ledger-detail report (2026-10-02):** Added `subscriber-ledger` to `report-model.ts`, `report-routes.ts`, `report-service.ts` and `ReportsPanel.tsx`, reusing the existing report preview/PDF/XLSX flow. It shows UTC posting timestamp, sequence, type/reference, debit/credit and deterministic running balance for a selected subscriber and inclusive date range; opening and rows are read in one repeatable-read PostgreSQL snapshot. The existing SOA remains unchanged. Preview requires `report.view`, `subscriber.view` and `receivable.view`; export additionally requires `report.export`. The desktop adds account/name lookup so subscribers beyond the first picker page can be selected. Documented the current session-local posting-date cutoff, reversal visibility and permissions in `docs/architecture/financial-invariants.md`. Extended guarded `gate2-cash-postgres.test.ts`: focused 2/2 passed, checking independent SQL row/sequence/timestamp/centavo totals after Cash reversal, running/closing balance, empty/invalid/missing subscriber, Owner/Viewer/Technician/anonymous access, parsed PDF/XLSX and persistence after Fastify recreation. Electron dev `gate3-auth-electron-smoke.ts --ledger-report-only` passed Owner/Viewer lookup, preview, role-aware export controls and no horizontal workspace overflow; after restarting isolated API 4110 and desktop 5173, `--expected-ledger-account=SUB-0000273` passed against the same ledger fixture. The initial smoke clicked Preview while the Find request still had the form busy; a readiness wait fixed the test. Full guarded Gate 1/2/3 PostgreSQL suite passed 7/7. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, workspace typechecks/builds, source-integrity and Drizzle check. `git -c core.safecrlf=false diff --check` exited 0. Isolated test processes stopped; normal API 4100 `/health/ready` returned 200. No development/customer destructive test or GCash posting occurred. Physical export save/printing, installed-app/narrow-window review, historical-as-of policy and remaining reports are unverified; Gate 3 remains Partial. Exact next task is above.

**Gate 3 subscriber master-list report (2026-10-02):** Added `subscriber-master` to `report-model.ts`, `report-routes.ts`, `report-service.ts` and `ReportsPanel.tsx`. The server returns one current-state row per subscriber (including inactive records), account/name search, status filtering, primary active contact/address, area, subscriber-level collector and distinct service-type/count fields; a lateral aggregate prevents multiple service accounts from duplicating subscriber rows. Preview requires `report.view` and `subscriber.view`; export additionally requires `report.export`. The desktop has status/search controls and uses the existing report preview/PDF/XLSX flow. Documented snapshot and permission semantics in `docs/architecture/financial-invariants.md`. Extended guarded `gate1-postgres.test.ts` and Electron `gate3-auth-electron-smoke.ts`. Focused Gate 1 PostgreSQL passed 3/3, including one subscriber with two services, inactive status, filters, independent counts, empty/invalid inputs, Owner/Viewer access and parsed PDF/XLSX output. Electron dev `--master-report-only` passed Owner/Viewer preview, inactive filtering, export-control visibility and no horizontal overflow; after isolated API 4110 and desktop 5173 restart, `--expected-master-account=SUB-0000254` passed against the same fixture (inactive `SUB-0000256`). The first smoke attempt selected the report before its form rendered; the test now waits for form readiness. The broader guarded suite first found a random billing-year collision in `gate3-service-postgres.test.ts`; its fixture now selects an unused year from `bcis_test` without changing billing behavior. Focused service test passed 1/1; full guarded Gate 1/2/3 suite passed 7/7. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, workspace typechecks/builds, source-integrity and Drizzle check. `git -c core.safecrlf=false diff --check` exited 0. Isolated test processes stopped; normal API 4100 `/health/ready` returned 200. No development/customer destructive test or GCash posting occurred. Packaged-app export/printing, narrow-window visual review and remaining reports are unverified; Gate 3 remains Partial. Exact next task is above.

**Gate 3 billing-versus-collection report (2026-10-02):** Added `billing-vs-collection` to the report catalog/routes and `ReportService` as a single PostgreSQL statement snapshot that unions non-VOID invoice amounts by `invoice_date` with currently POSTED payment amounts by session-local `paid_at::date`, grouped by month. The signed period difference is billed minus collected; it is not AR or invoice-cohort recovery. The desktop shows that caveat beside the selected report. Documented current-state void/reversal and unresolved historical/timezone semantics in `docs/architecture/financial-invariants.md`. Changed `report-model.ts`, `report-routes.ts`, `report-service.ts`, `ReportsPanel.tsx`, guarded `gate1-postgres.test.ts`, `gate2-cash-postgres.test.ts` and `gate3-auth-electron-smoke.ts`. Focused guarded Gate 1/2 PostgreSQL passed 5/5: report rows/summaries matched independent invoice/payment SQL for a payment day and a non-void invoice day, exact signed centavo difference, empty/invalid/oversize ranges, Owner/Viewer preview, anonymous/Viewer export denial, parsed XLSX money and PDF bytes. A Gate 2 reversal fixture proved the collected summary falls by exactly the reversed payment. No live VOID fixture was created because invoice voiding remains policy-gated; the explicit `status <> 'VOID'` query and independent non-VOID SQL comparison are verified, but end-to-end void treatment is not claimed. Full guarded Gate 1/2/3 suite passed 7/7. Electron dev `--collection-reports-only` passed Owner/Viewer report preview, caveat text, role-aware export controls and no horizontal workspace overflow; after isolated API 4110 and Electron 5173 restart it passed against the same synthetic payment `PAY-00000220`. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, builds, source-integrity and Drizzle check. `git diff --check` exited 0; isolated processes stopped, normal API 4100 `/health/ready` returned 200. Installed-package save/printing and narrow-window visual review remain unverified. No `bcis` destructive test or GCash posting occurred. Gate 3 remains Partial. Next exact task is above.

**Gate 3 annual collection report (2026-10-02):** Added `annual-collections`, a complete calendar-year month-by-method view of currently `POSTED` payments, to `report-model.ts`, report routes/service and the desktop report catalog with a single Year input. It preserves the existing `monthly-collections` output and posting logic. Documented current-state reversals, PostgreSQL session-local date cutoffs and non-fiscal calendar-year semantics in `docs/architecture/financial-invariants.md`. Changed `gate1-postgres.test.ts` and `gate3-auth-electron-smoke.ts` for guarded role, centavo, PDF/XLSX, invalid/empty/leap-year, UI and restart checks. Focused guarded Gate 1 passed 3/3; independent PostgreSQL month/method sums and the existing monthly report full-year total matched the annual summary, with Owner/Viewer preview, denied anonymous/Viewer export, parsed workbook money and PDF bytes. Electron dev `--collection-reports-only` passed Owner/Viewer annual preview/year field, export-control visibility and no horizontal overflow; after API 4110 and Electron 5173 restart it passed against the same synthetic posted payment `PAY-00000196`. The first broader guarded run failed in an older Gate 2 test because a random synthetic year collided with an already finalized billing cycle, leaving zero new invoices; `gate2-cash-postgres.test.ts` now chooses an unused year from guarded `bcis_test` without changing billing code. Focused Gate 2 then passed 2/2 and the full guarded suite passed 7/7. An initial static-gate invocation was interrupted; the next run failed because its generated shared `dist/index.js` contained NUL bytes. Rebuilding `@bcis/shared` restored that generated artifact; the final `tests/Run-StaticAcceptance.ps1` passed (API 51 passed/7 guarded skipped, desktop 8, shared 4, builds/source-integrity/Drizzle). `git diff --check` exited 0. Isolated test processes were stopped. Normal API 4100 was initially unavailable after the interrupted run; restarted against ignored `/bcis` configuration and `/api/v1/health/ready` returned 200. Installed-app export/save/printing, narrow-window visual review and final historical reversal/timezone policies remain unverified; no `bcis` destructive test or GCash posting occurred. Gate 3 remains Partial. Next exact task is above.

**Gate 3 daily/weekly collection reports (2026-10-02):** Added `daily-collections` (single-day payment/account detail) and `weekly-collections` (ISO Monday week by method, bounded inclusive range) to the report catalog and existing report routes; the existing monthly report code/output was unchanged. Both query currently `POSTED` payments only, use the existing PostgreSQL session-local `paid_at::date` cutoff, return centavos as strings and support the shared PDF/XLSX exporters. The desktop catalog selects a single Date field for daily and existing From/To fields for weekly; its initial date uses the local calendar. Documented current-state reversal and unresolved formal timezone/historical-as-of policies in `docs/architecture/financial-invariants.md`. Changed `report-model.ts`, `report-routes.ts`, `report-service.ts`, `ReportsPanel.tsx`, `gate1-postgres.test.ts`, `gate3-auth-electron-smoke.ts` and the invariants document. Focused guarded PostgreSQL Gate 1 passed 3/3 after one TypeScript test-fixture null guard; daily rows and weekly centavo totals matched independent SQL, Owner/Viewer preview and anonymous/Viewer export denials passed, Owner PDF/XLSX bytes and workbook metadata passed, and empty/invalid/multi-day-daily ranges were checked. Full guarded Gate 1/2/3 passed 7/7. Electron dev `--collection-reports-only` passed Owner/Viewer previews, role-aware export controls and no horizontal workspace overflow; after restarting isolated API 4110 and Electron 5173, it passed again against the same synthetic payment `PAY-00000187`. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, builds, source-integrity and Drizzle check. `git diff --check` exited 0; normal API 4100 `/health/ready` returned 200, isolated processes stopped. Physical print/save dialog, installed package, narrow-window visual review, historical cutoff policy, and remaining reports are unverified. No `bcis` destructive test or GCash posting occurred. Gate 3 remains Partial. Next exact task is above.

**Gate 3 dashboard summary (2026-10-02):** Extended `ReportService.dashboard` with validated calendar dates, month-to-date payment-method amounts/counts, current collector-batch performance for batches dated in the selected month (explicitly not a historical snapshot), five oldest overdue service alerts, and five latest active-as-of payments. Kept centavos server-side as integer strings; the desktop renders six compact KPIs plus billing-versus-collection, methods, collectors, overdue and recent-payment panels with empty/error states, responsive wrapping and local-calendar date default. Changed `report-service.ts`, `DashboardOverview.tsx`, desktop `api-client.ts`, guarded `gate1-postgres.test.ts` and Electron `gate3-auth-electron-smoke.ts`. Focused guarded PostgreSQL passed 3/3 after replacing a brittle top-five collector fixture assertion with direct SQL totals; full guarded Gate 1/2/3 passed 7/7. `tests/Run-StaticAcceptance.ps1` passed (API 51 passed/7 guarded skipped, desktop 8, shared 4, builds and Drizzle check). Electron dev `--dashboard-only` passed Owner/Viewer navigation/rendering and no horizontal overflow, then passed again after restarting isolated API 4110 and desktop 5173; an initial restart attempt exited with Windows code 3221226505 without application output, and the immediate rerun passed. Isolated processes stopped; normal API 4100 `/health/ready` returned 200. `git diff --check` exited 0 (line-ending warnings only). Packaged-client dashboard, narrow-window visual review and installed-client proof remain unverified. GCash was not enabled and no development/customer destructive test ran. Gate 3 remains Partial. Next exact task is above.

**Gate 3 collector reconciliation report (2026-10-02):** Documented the report's batch/account/remittance snapshot and confirmed-difference rule in `docs/architecture/financial-invariants.md`. `ReportService.collectorReconciliation` now derives account and collected-account counts plus account-level uncollected centavos from frozen batch rows in one PostgreSQL statement, includes stored non-cash (zero while GCash is gated), exposes expected/collected/remitted Cash and signed difference, and labels each row NOT REMITTED, BALANCED, SHORTAGE or OVERAGE with a visible TOTALS MISMATCH prefix when header/account sums disagree. Before remittance the row difference remains the stored provisional `remitted - collected` value, but only recorded remittances contribute to the confirmed-difference summary; unresolved differences are not settled or marked balanced. The 14-column PDF uses A3 landscape, while XLSX keeps numeric money cells. Guarded `bcis_test` Gate 1 focused tests passed 3/3: report batch/account centavo reconciliation, balanced and blocked-overage rows, aggregate summaries, Viewer read-only/anonymous denial, Owner PDF/XLSX exports including parsed workbook values, empty and invalid ranges. Electron dev `gate3-auth-electron-smoke.ts --batches-only` passed Owner report navigation/preview after closing synthetic batch `BAT-92670220-000067`; its first attempt clicked before the async catalog loaded, so the smoke gained a readiness wait and the final run passed. After stopping/restarting isolated API 4110 and desktop 5173, `--report-restart-check=BAT-92670220-000067` passed the persisted report row, account/exception columns and BALANCED state. The full guarded Gate 1/2/3 PostgreSQL set passed 7/7; required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` exited 0 (line-ending warnings only). No migration or development/customer destructive test was used. Isolated test processes stopped; normal API 4100 `/health/ready` returned 200. Physical printer output and installed-package report rendering remain unverified. Only one of several required report families was completed here; Gate 3 remains Partial. Exact next task is above.

**Gate 3 collector assignment desktop/history (2026-10-02):** The official activity requires defining areas/routes and assigning subscribers to collectors but does not explicitly authorize edit/deactivate lifecycles for setup records, so those were not invented. Added `collection.manage_routes`-protected `GET /api/v1/service-accounts/:id/collector-assignments` with collector/route names and half-open effective dates; missing service returns 404 and Viewer/anonymous requests return 403/401 before record lookup. The Subscriber profile's existing assignment form now shows current and previous assignments, only offers active collectors/routes from active areas, labels its inputs, shows loading/empty/error/retry states and the valid replacement-date hint, blocks submission while loading, and refreshes after a change. Existing POST route, financial history and batch snapshots remain unchanged. Subscriber route date validation now rejects impossible calendar dates before PostgreSQL. Guarded `bcis_test` Gate 1 focused tests passed 3/3: initial/previous assignment dates, inactive collector/route and invalid-date rejection, Owner/Supervisor access, Viewer/anonymous denial and history after a fresh API instance. Electron dev `gate3-auth-electron-smoke.ts --assignments-only` passed Owner subscriber search, no-assignment state, collector/route assignment, same-date 409 message and later valid change (`SUB-0000191`); after stopping/restarting isolated API 4110 and desktop 5173, `--assignment-restart-check=SUB-0000191` passed visible Current/Previous history. The full guarded Gate 1/2/3 PostgreSQL suite passed 7/7; required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. No migration or development/customer destructive test was used. `git diff --check` exited 0 (line-ending warnings only). Isolated test processes stopped; normal API 4100 `/health/ready` returned 200. Packaged-client, physical printing and three-PC LAN remain unverified; Gate 3 remains Partial. Exact next task is above.

**Gate 3 collection assignment dates and role/report verification (2026-10-02):** Added the half-open assignment-date rule to `docs/architecture/financial-invariants.md`. `SubscriberService.assignCollector` now locks the service row, rejects missing service/inactive or missing collector/route and non-increasing replacement dates before closing an existing assignment and inserting the new one transactionally. `CollectionService.createBatch` selects route assignments effective on its `collectionDate`, rather than only currently open assignments; later changes cannot rewrite saved route sheets. Guarded `bcis_test` Gate 1 test was extended to prove invalid collector/route/date errors, no premature future-collector visibility, historical old-collector visibility, later new-collector visibility, ended old-collector exclusion, balanced/overage collector-report rows, and audit entries. A separate isolated API instance proved Owner/Supervisor setup access, Viewer/anonymous denial, Supervisor area/route/collector and empty-batch creation, invalid inputs, Viewer batch denial, Owner batch read and report preview. Focused Gate 1 tests passed 3/3. Electron dev `gate3-auth-electron-smoke.ts --collection-setup-only` passed Supervisor setup navigation and area creation plus hidden Viewer setup navigation. The full guarded PostgreSQL run initially caught a pre-existing SOA timezone defect: its opening used UTC midnight while rows used PostgreSQL local `::date`, double-counting a current-day entry just after local midnight. `ReportService.subscriberSoa` now uses the same database-local date boundary for opening and rows; focused Gate 2 passed 2/2 and the final guarded Gate 1/2/3 set passed 7/7. Required `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/7 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` exited 0 (line-ending warnings only). No migration was needed; no development/customer data was used for destructive tests. Isolated API 4110/Electron 5173/CDP 9236 stopped; normal API 4100 `/health/ready` returned 200. Full setup maintenance/assignment desktop controls, all required report families, packaged-client printing and three-PC LAN remain unverified. Gate 3 remains Partial; exact next task is above.

**Gate 3 balanced batch lifecycle (2026-10-01):** Documented the transition rule first in `docs/architecture/financial-invariants.md`. Append-only migration `0014_remitted_batch_state.sql` adds stored `REMITTED` to the existing enum without rewriting historic `DRAFT`/`ACTIVE` or already-remitted `SUBMITTED` rows. Desktop labels `DRAFT` as OPEN and `ACTIVE` as IN PROGRESS; raw API statuses remain unchanged. A remittance now atomically inserts its immutable row and advances the batch from SUBMITTED to REMITTED; reconciliation accepts REMITTED or a legacy SUBMITTED row only when a remittance exists, with zero difference. The desktop shows REMITTED and requires a confirmation dialog before authorized close. Updated API client status typing, migration documentation and opt-in test guards to 15 migrations. Focused collection-rules tests passed 2/2; guarded `bcis_test` Gate 1 tests passed 2/2 including balanced Cash collection/remit/reconcile/close, version/conflict handling, audit rows, retained centavo totals and a blocked overage; the full guarded Gate 1/2/3 PostgreSQL set passed 6/6. Electron dev `--batches-only` passed Owner route-sheet display and the complete Cash batch lifecycle (`BAT-97770220-000020`); after stopping/restarting both isolated API 4110 and desktop 5173, `--batch-restart-check=BAT-97770220-000020 --expect-closed` passed persisted CLOSED status, remitted/collected cash and route sheet. Its first restart assertion incorrectly expected the hidden action label “Remittance” on a closed screen; correcting it to the visible “Remitted cash” metric passed. Required `tests/Run-StaticAcceptance.ps1` passed: API 51/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. Migration `0014` was applied separately to `bcis_test` and local development `bcis`; read-only checks showed `bcis_test|15|1` and `bcis|15|1` (database, migration count, REMITTED enum value). `git diff --check` exited 0 (line-ending warnings only). Isolated API/Electron processes stopped; normal API 4100 `/health/ready` returned 200. No development/customer financial rows were used for destructive tests. COLLECTION_SUPERVISOR, setup validation, report effects, physical printing, packaged display and three-PC LAN are not yet evidenced by this slice. Gate 3 remains Partial; next task is above.

**Gate 3 durable collector route sheets (2026-10-01):** Documented the snapshot rule first in `docs/architecture/financial-invariants.md`: include finalized non-void invoices issued by the batch date and due by the end of that month; split unpaid centavos by **due month** (current month versus earlier), because BCIS invoices issue at billing-month end and are normally due the next month. Payment allocations are measured through the batch date; later payment/address changes cannot rewrite a saved sheet. Generated append-only migration `0013_route_sheet_snapshot.sql` plus schema metadata with nullable address/current-bill/arrears columns and a split-equals-expected constraint; legacy rows remain null rather than being backfilled from mutable data. `CollectionService.createBatch` now copies the installation address and as-of centavo split into each batch account in one repeatable-read transaction, and `getBatch` reads/serializes the batch header and account rows in one repeatable-read snapshot so simultaneous collection posting cannot create a false total mismatch. The desktop detail prints account/subscriber, service, address, current bill, arrears, total due and collected; old batches are labelled legacy/incomplete. Updated API client types, the collection-date validator, current migration documentation and all opt-in test guards to require 14 migrations; the local Owner recovery utility accepts either 13 or 14 while upgrading. Guarded `bcis_test` tests passed: Gate 1 2/2 after extending its fixture to two billing months, exact current-plus-arrears reconciliation, immutable sheet after a Cash collection and later service-address change, anonymous 401 and Viewer 403; the full guarded Gate 1/2/3 PostgreSQL set passed 6/6 again after the final read-snapshot change. An initial Gate 1 run exposed that its old collection date was before the invoice's month-end issue date; the fixture and written rule were corrected to the following due month before the final passing run. Electron dev `--batches-only` passed a synthetic Owner opening a new route sheet (`collectionRouteSheetOwner=true`), then the isolated API was stopped/restarted and `--batch-restart-check=BAT-95520220-000015` passed (`routeSheetPersistedAfterApiRestart=true`). Final `corepack pnpm --dir source typecheck` and `tests/Run-StaticAcceptance.ps1` passed after the read-snapshot change: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. The reviewed nullable migration was applied through `corepack pnpm --dir database migrate` separately to guarded `bcis_test` and local development `bcis`; read-only PostgreSQL checks confirmed `bcis|14|3` and `bcis_test|14|3` (database, migration count, new-column count). No development/customer financial rows were used for destructive tests. Isolated API 4110/Electron 5173/CDP 9236 stopped; normal API 4100 `/health/ready` returned 200 and `git diff --check` exited 0. Physical paper/PDF printer output, packaged-client display, three-PC LAN and older legacy-sheet visual inspection remain later acceptance checks. Gate 3 remains Partial. Exact next task is above.

**Gate 3 collection batch summary module (2026-10-01):** Audited `CollectionService`, `CollectionBatchesPanel.tsx`, route permissions and COL-001–003/BATCH-001–006. The pre-existing print button was only a partial batch snapshot: schema `collection_batch_accounts` has no address/current-bill/arrears snapshot, so a full immutable route sheet was deliberately not claimed or fabricated from live values. Added a read-only server summary to `GET /api/v1/collection-batches/:id`: account/pending/partial/collected counts, uncollected centavos calculated from batch-account rows, and whether account sums match the frozen batch header. The desktop detail now displays these values, warns if totals disagree, and labels the existing print action **Print batch snapshot**. No posting, remittance, reconciliation, permission or settlement behavior changed. Extended guarded `bcis_test` `gate1-postgres.test.ts` to compare initial/after-collection summary to batch amounts, check a fresh service instance, anonymous 401 and Viewer 403; focused run passed 2/2. The first expanded run hit the unchanged in-memory login-rate limit after adding a redundant Viewer login; the test now reuses its existing Viewer actor and passes. Focused Electron dev `gate3-auth-electron-smoke.ts --batches-only` passed with a synthetic Owner creating an assignment/batch through API and opening its summary in Electron (`collectionBatchSnapshotOwner=true`). The current role matrix has COLLECTION_SUPERVISOR but no distinct COLLECTOR login role; a Collector-specific login was not claimed. `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` exited 0 (line-ending warnings only). Isolated API 4110/Electron 5173/CDP 9236 were stopped; the normal API on 4100 was restarted from the ignored `/bcis` configuration and `/health/ready` returned 200. No development `bcis` data was used for destructive tests. Physical printing, full route-sheet fields and process-restart proof for this summary remain unverified. Gate 3 remains Partial. Exact next task is above.

**Gate 3 grouped overdue follow-up module (2026-10-01):** Added `receivable.view`-protected `GET /api/v1/receivables/overdue-accounts`, grouped by subscriber service and calculated from unpaid, overdue invoice balances at the selected as-of date. It returns months unpaid (distinct billing cycles), invoice count, oldest unpaid invoice/due date, maximum days late, area, effective collector, subscriber-level last non-reversed payment and total arrears as decimal-string centavos. The route uses the existing validated search/area/collector/historical-plan/type/age filters and 50-row default/100 maximum paging. The old invoice-level list remains; its plan filter now matches the historical invoice plan displayed. `api-client.ts` adds typed grouped rows; `ReceivableOverview.tsx` adds an Invoice detail/Overdue accounts toggle and grouped table while preserving global aging cards and read-only Viewer access. Guarded `bcis_test` `gate2-cash-postgres.test.ts` passed 2/2 after the final test change: one-month partial balance and last payment before reversal, two-month arrears after reversal, grouped total equal to invoice rows/ledger balance after Fastify recreation, oldest invoice, empty page/bucket, filter and invalid-page/unauthenticated behavior. Focused Electron dev `gate3-auth-electron-smoke.ts --ar-only` passed with a synthetic Viewer (`groupedOverdueViewer=true`), showing the grouped row and no suspension action. The first Electron attempt used an incorrect test API base URL with a duplicate `/api/v1` path; correcting only the launch environment made the smoke pass. `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` exited 0 (line-ending warnings only). Isolated API 4110/Electron 5173/CDP 9236 stopped; normal API 4100 `/health/ready` returned 200. No development `bcis` data was used for destructive tests. This is local read-only AR evidence, not installed-client, physical printing, all dashboard AR KPIs or final AT acceptance. Gate 3 remains Partial. Exact next task is above.

**Gate 3 receivables filter/aging module (2026-10-01):** Extended the `receivable.view`-protected `/api/v1/receivables` list with validated search, aging-bucket, area, effective collector, plan and service-type filters and added `/api/v1/receivables/filter-options`. Invoice rows now include subscriber/account, service, historical invoice plan, area/collector, due date, server-calculated days late/age bucket, outstanding centavos and last non-reversed subscriber payment as of the selected date. Added `ReceivableOverview.tsx` with global aging cards, 50-row paging, operational filters, loading/empty/error states and a read-only invoice table; the existing service-control panel and approval authority remain unchanged. `api-client.ts` was extended with typed filter contracts. Guarded `bcis_test` `gate2-cash-postgres.test.ts` passed 2/2 after the final source change, covering filters, pagination, empty result, invalid input, unauthenticated 401, Technician view, reversal and invoice/ledger/aging reconciliation after Fastify recreation. Focused Electron dev smoke `gate3-auth-electron-smoke.ts --ar-only` passed against isolated API 4110/Electron 5173/CDP 9236 with a synthetic Viewer, filtered 91+ invoice visibility and no suspension request action. One earlier smoke no-op was traced to clicking Apply while data was loading; the harness now waits until enabled. A later isolated API restart cleared the smoke harness's in-memory login-rate limit. `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` exited 0 (line-ending warnings only). Isolated API/Electron stopped; normal API 4100 `/health/ready` returned 200. No development `bcis` data was used for destructive tests. The overdue list is still invoice-level, not grouped with months unpaid/oldest invoice/total arrears, so AR-001–004 and Gate 3 remain Partial. Exact next task is above.

**Gate 3 subscriber ledger module (2026-10-01):** Added `receivable.view`-protected `GET /api/v1/subscribers/:id/ledger` with validated optional posting-date range, page default 1/pageSize default 50/max 100, chronological entries, `hasMore`, and server-calculated range opening, page opening, per-entry running and range closing balances. A repeatable-read transaction gives one consistent snapshot; money remains `bigint` internally and strings over HTTP. The old unfiltered `/statement` response remains unchanged for compatibility, but the desktop profile no longer loads all rows or truncates them to four descriptions. Added `SubscriberLedger.tsx`, typed `getLedger`, and a permission-aware 50-row table with date controls and paging. Files: `billing-routes.ts`, `billing-service.ts`, `gate2-cash-postgres.test.ts`, `gate3-auth-electron-smoke.ts`, desktop `lib/api-client.ts`, `features/subscribers/SubscriberPanel.tsx`, new `features/subscribers/SubscriberLedger.tsx`, and this handoff. Guarded `bcis_test` Gate 2 suite passed 2/2: three one-row pages with carried balances and exact `hasMore`, prior/same/next-day boundaries, debit-credit/outstanding reconciliation, Viewer/Technician `receivable.view`, unauthenticated 401, missing subscriber 404, invalid date/page 400, reversal debit on page four and persistence after Fastify recreation. An initial passing run emitted a node-postgres warning from concurrent queries on one transaction connection; queries were serialized, and the final passing run had no warning. Isolated API 4110/Electron dev 5173/CDP 9236 `--ledger-only` smoke passed Viewer subscriber search/profile, ledger visibility and date filtering (`subscriberLedgerViewer=true`). `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` showed no whitespace errors (line-ending warnings only). Isolated processes stopped; normal API 4100 `/health/ready` returned 200. Actual physical printing and installed-package rendering remain later checks. Gate 3 remains Partial. Exact next task is above.

**Gate 3 payment history/receipt/reversal module (2026-10-01):** Improved `PaymentHistoryPanel.tsx` with subscriber filtering, 50-row paging, explicit detail/receipt view, void indication and a two-step reasoned reversal confirmation. Added `ReceiptView.tsx` to render the server receipt snapshot and clearly mark a reversed receipt/allocations as voided; only `receipt.print` sees Print and only `payment.reverse` sees Reverse. `App.tsx` passes the print permission, `api-client.ts` adds typed payment detail and subscriber-filtered list calls, and `PaymentService.list` now uses `pageSize+1` so an exact full last page does not falsely show Next. No posting, allocation, ledger or reversal accounting behavior changed. Guarded `gate2-cash-postgres.test.ts` passed 2/2 with exact-page `hasMore=false`, Viewer detail, Technician list denial, original receipt/allocation values, reversed receipt/allocation state, and payment state after Fastify recreation. `gate3-auth-electron-smoke.ts --payments-only` passed against isolated API 4110 and Electron dev renderer 5173/CDP 9236: synthetic Owner inspected and reversed a Cash payment, saw a voided copy, and Viewer saw the voided history without print/reverse actions (`paymentHistoryReceiptReversal=true`, `viewerReadOnly=true`). `corepack pnpm --dir source typecheck` and the final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. Isolated test processes stopped. Physical printer operation, installed-package rendering, and the complete paginated subscriber ledger remain unverified. Gate 3 remains Partial. Exact next task is above.

**Gate 3 ranged SOA module (2026-10-01):** Added `StatementOfAccount.tsx` on the subscriber profile with posting-date range, server-supplied opening/activity/closing balances, print, and role-gated PDF/XLSX save via the existing Electron preload. `App.tsx` passes `report.view`/`report.export` independently of `receivable.view`; `SubscriberPanel.tsx` shows the SOA only with report permission and retains its existing receivable summary. No API, financial calculations or invoice void rules changed. Extended guarded `gate2-cash-postgres.test.ts`: prior-day empty, same-day debit-minus-credit equals outstanding, next-day opening equals outstanding, Viewer preview 200/export 403, Owner PDF signature, and closing balance after compensating reversal plus Fastify recreation; 2/2 tests passed on local `/bcis_test`. Extended `gate3-auth-electron-smoke.ts` with `--soa-only`; isolated API 4110 and Electron dev client 5173/CDP 9236 passed Viewer subscriber search/profile, SOA preview, visible Print and hidden unauthorized Save PDF (`subscriberStatementViewer=true`). `corepack pnpm --dir source typecheck` and `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` reported no whitespace error (line-ending warnings only). Isolated processes stopped; normal API 4100 `/health/ready` returned 200. Files changed for this task: `App.tsx`, `features/subscribers/SubscriberPanel.tsx`, new `features/subscribers/StatementOfAccount.tsx`, `gate2-cash-postgres.test.ts`, `gate3-auth-electron-smoke.ts`, and this handoff. Physical print/save dialog and installed-package rendering were not exercised; they remain later acceptance checks. Gate 3 remains Partial. Exact next task is above.

**Gate 3 invoice listing/detail module (2026-10-01):** Extended the existing `billing.view`-protected `/api/v1/invoices` query with validated invoice-number search and exact `pageSize+1` hasMore detection; list/detail now include subscriber account/name, service number and server-calculated outstanding centavos, while preserving existing response fields and immutable finalized rows. Added a typed `getInvoice` client, query keys and a read-only `InvoicesPanel` with search, month filter, Previous/Next, loading/empty/error recovery, customer context, line items and billed/paid/outstanding totals; no void/adjustment UI was enabled. Files: `source/apps/api/src/modules/billing/billing-routes.ts`, `billing-service.ts`, `source/apps/api/test/gate2-cash-postgres.test.ts`, `source/apps/api/test/gate3-auth-electron-smoke.ts`, `source/apps/desktop/src/renderer/src/features/billing/InvoicesPanel.tsx`, `lib/api-client.ts`, `lib/query-keys.ts`. Guarded `bcis_test` Gate 2 Cash test passed 2/2 with added invoice pagination/search, invalid search 400, unauthenticated detail 401, Viewer read, line-item sum = invoice = ledger debit, paid/outstanding amounts and post-reversal API-restart persistence. Focused Electron dev smoke `corepack pnpm --dir source --filter @bcis/api exec tsx test/gate3-auth-electron-smoke.ts --invoices-only` passed: synthetic Owner creates service/billing via API, Viewer searches the exact invoice and opens read-only detail (`invoiceSearchDetailViewer=true`). `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` found no whitespace error (LF/CRLF warnings only); isolated API 4110/Electron 5173/9236 stopped and normal API 4100 `/health/ready` returned 200. This is local list/detail evidence, not printable ranged SOA, all invoice states, packaged acceptance or Gate 3 exit. Gate 3 remains Partial. Exact next task is above.

**Gate 3 address replacement/deactivation module (2026-10-01):** Added `subscriber.update`-authorized `PUT /api/v1/subscribers/:id/addresses/:addressId` and `PATCH .../active` in `source/apps/api/src/modules/subscribers/subscriber-routes.ts`/`subscriber-service.ts`. Under a subscriber-row lock and optimistic version, replacement inactivates the old row and inserts a new active row rather than rewriting history; deactivation preserves rows, promotes the oldest active fallback if primary, and blocks the last active address. Both actions return `ADDRESS_IN_USE` 409 for any address referenced by a service account, including a terminated one. Service create/edit now recheck the active address inside their transactions after the same parent lock, preventing a concurrent address change from attaching an inactive address. Audit stores IDs/type/primary only, not address text. Added typed desktop client functions and permission-aware Edit/Deactivate controls with confirmation and explanatory disabled state in `SubscriberPanel.tsx`. Guarded `source/apps/api/test/gate3-subscriber-postgres.test.ts` passed Viewer 403, invalid 400, duplicate/stale 409, referenced-address 409, old/new search, primary fallback, preserved service foreign key, inactive history, audit privacy and API-restart persistence; `gate3-service-postgres.test.ts` also passed after the service edit recheck (focused two-file run 2/2). Focused Electron dev smoke `corepack pnpm --dir source --filter @bcis/api exec tsx test/gate3-auth-electron-smoke.ts --addresses-only` passed synthetic add/replace/deactivate and primary transfer. An initial longer smoke failed at an assertion expecting a `(primary)` suffix absent from the address summary; a later run hit a pre-existing identity-flow timing issue. The isolated address scenario removed that unrelated prelude and passed, including a row-level Primary check. `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` found no whitespace error (LF/CRLF warnings only). Isolated API 4110/Electron 5173/9236 stopped; normal API 4100 `/health/ready` returned 200. No development `bcis` or customer rows were used for destructive tests. A referenced address remains intentionally uneditable here; correcting that historical/installed address requires a separate approved workflow. Gate 3 remains Partial. Exact next task is above.

**Gate 3 contact replacement/deactivation module (2026-10-01):** Added `subscriber.update`-authorized `PUT /api/v1/subscribers/:id/contacts/:contactId` and `PATCH .../active` in `source/apps/api/src/modules/subscribers/subscriber-routes.ts`/`subscriber-service.ts`. Under a subscriber-row lock and optimistic version, replacement inserts a new active row, inactivates the old row rather than overwriting its value, preserves primary status on a primary replacement, rejects active duplicates and audits only IDs/type/primary (no contact values). Deactivation retains history, promotes the oldest remaining contact when the primary is removed, and blocks removing the last active contact. Added typed desktop client functions and role-aware Edit/Deactivate controls with a confirmation dialog in `SubscriberPanel.tsx`. Extended guarded `source/apps/api/test/gate3-subscriber-postgres.test.ts`: Viewer 403, invalid 400, duplicate/stale 409, old contact removed from active search, new contact searchable, primary fallback, last-contact 409, historical rows/audit privacy and API-restart persistence all passed (1/1). The focused Electron dev smoke `corepack pnpm --dir source --filter @bcis/api exec tsx test/gate3-auth-electron-smoke.ts --contacts-only` passed with synthetic add/replace/deactivate/fallback (`contactAddReplaceDeactivatePrimaryFallback=true`). `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` found no whitespace error (LF/CRLF warnings only). Isolated API 4110/Electron 5173/9236 stopped; normal API 4100 `/health/ready` returned 200. No development `bcis` or customer rows were used for destructive tests. Gate 3 remains Partial; installed-client and broader operational acceptance remain later gates. Exact next task is above.

**Gate 3 plan lifecycle and future-price module (2026-10-01):** Changed `source/apps/api/src/modules/subscribers/subscriber-service.ts` so a version-checked plan price edit transactionally updates non-terminated service accounts' current rates and versions for future billing, emits service NOTE events and records old/new centavos plus affected-service count in the plan audit. Finalized invoice rows remain immutable. Plan activation/deactivation now checks an optional version (old request bodies remain accepted), is idempotent when status is unchanged, and audits actual changes; route/client/UI pass the version. Added React Hook Form/Zod edit controls, confirmed status actions and a horizontally scrollable plan table in `source/apps/desktop/src/renderer/src/features/services/PlansPanel.tsx`; added the typed client update in `lib/api-client.ts`. Extended guarded `source/apps/api/test/gate3-service-postgres.test.ts`: historical January invoice 150000, repriced February invoice 170000, plan-switched March invoice 200000 centavos, persisted service rate/version, Viewer 403, stale status 409, inactive plan refusing new assignment but existing service billing, audit and API restart all passed (1/1). Extended `test/gate3-auth-electron-smoke.ts` with a focused `--plans-only` scenario: synthetic plan create/edit/deactivate/reactivate through Electron passed (exit 0). An initial combined smoke reached the later subscriber profile but hit the unchanged API rate limit (429) because of extra navigation; the focused scenario avoids treating that harness limit as an application permission change. `corepack pnpm --dir source typecheck` passed; final `tests/Run-StaticAcceptance.ps1` passed API 51/6 guarded skipped, desktop 8, shared 4, builds/schema/source-integrity. `git diff --check` found no whitespace error (LF/CRLF warnings only). Isolated API 4110/Electron 5173/9236 stopped; normal API 4100 `/health/ready` returned 200. No `bcis` or customer rows were used for destructive tests. This verifies local plan behavior, not installed-client acceptance or all Gate 3 operations. Gate 3 remains Partial. Exact next task is above.

**Gate 3 service-account detail/edit module (2026-10-01):** Inspected the existing `service.manage`-protected generic PATCH and service-control gates. Fixed `subscriber-service.ts` so an address-only edit preserves the service's current centavo rate after a plan price change; a genuine plan change takes the chosen plan's current rate for future billing. Unchanged plan/address edits now create a NOTE rather than a false ADDRESS_CHANGED event. An inactive current plan may be retained during an address correction, but switching to an inactive plan remains rejected. Added a typed service profile/client PATCH and a role-aware service detail/editor to `SubscriberPanel.tsx`; it exposes plan/address/reason only for PENDING/ACTIVE accounts and does not expose suspension/reconnection/disconnection. New-service selection still lists only active plans and addresses. Added guarded `test/gate3-service-postgres.test.ts`: Viewer PATCH 403, direct suspension 409, invalid address 400, stale version 409, address correction retaining 150000 centavos after the original plan was repriced, plan change setting 200000, historical invoice 150000 and next invoice 200000, service events/audit and API-restart persistence all passed (1/1). Extended `test/gate3-auth-electron-smoke.ts` to create a service and edit its address and plan through Electron, then close the synthetic service through the existing API before exercising deactivation; the smoke exited 0. The expanded smoke initially selected an older synthetic row with the same name/address, so it now captures the created account number and waits for that exact row. A later direct API assertion encountered the existing 100/minute rate limit (429); the harness now honors `Retry-After` for direct checks, without changing the API limit. `corepack pnpm --dir source typecheck` and final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/6 opt-in skipped, desktop 8 passed, shared 4 passed, all builds/schema/source-integrity. Targeted `git diff --check` had only LF/CRLF warnings; isolated test processes stopped and normal API 4100 `/health/ready` returned 200. This is local service edit and future-price evidence, not full plan lifecycle or packaged-client acceptance. Gate 3 remains Partial. Exact next task is above.

**Gate 3 address-addition module (2026-10-01):** Added an authorized, version-checked `POST /api/v1/subscribers/:id/addresses` in `subscriber-routes.ts`/`subscriber-service.ts`. It locks the subscriber row, caps active addresses at ten, rejects same-type active duplicates, optionally moves the primary designation, inserts a fresh address, increments the parent version and audits the addition without rewriting an installed service's address row. Added desktop API client and React Hook Form/Zod Add address controls to `SubscriberPanel.tsx`; service creation now offers only active addresses. Extended guarded `gate3-subscriber-postgres.test.ts` with Viewer 403, invalid 400, duplicate/stale 409, address search with one distinct subscriber result, primary switch, API-restart persistence, one audit event and an assertion that the existing service account's `installation_address_id` stays unchanged. Focused guarded PostgreSQL test passed 1/1; workspace typechecks passed. Extended `gate3-auth-electron-smoke.ts`; isolated API 4110 plus Electron dev renderer 5173 passed create/edit/add contact/add address/search/deactivate and prior auth/role checks. `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/5 opt-in skipped, desktop 8 passed, shared 4 passed, builds/schema/source-integrity passed. Targeted `git diff --check` had only LF/CRLF warnings. Test processes stopped; normal API 4100 `/health/ready` returned 200. This is address addition, not in-place address replacement/removal or full service-account editing; Gate 3 remains Partial. Exact next task is above.

**Gate 3 contact-addition module (2026-10-01):** Added an authorized, version-checked `POST /api/v1/subscribers/:id/contacts` in `subscriber-routes.ts`/`subscriber-service.ts`. It locks the subscriber row, caps active contacts at ten, rejects same-type active duplicates, optionally moves the primary designation, preserves existing contact rows, increments the parent version, and audits the addition without logging the contact value. Added desktop API client and React Hook Form/Zod Add contact controls to `SubscriberPanel.tsx`; only active contacts appear in the operational profile summary. Extended guarded `gate3-subscriber-postgres.test.ts` with Viewer 403, invalid 400, duplicate/stale 409, normalized-number search with one distinct subscriber result, primary switch, two active contacts, audit and API-restart persistence. Focused guarded PostgreSQL test passed 1/1. Extended `gate3-auth-electron-smoke.ts`; isolated API 4110 plus Electron dev renderer 5173 passed create/edit/add contact/search/deactivate and prior auth/role checks. `corepack pnpm --dir source typecheck` and `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/5 opt-in skipped, desktop 8 passed, shared 4 passed, builds/schema/source-integrity passed. Temporary test processes stopped. This is addition, not contact replacement/removal or address editing; Gate 3 remains Partial. Exact next task is above.

**Gate 3 deactivation module (2026-10-01):** The activity requires inactive/terminated/archived history but does not define how to close an active service when deactivating its subscriber. Kept that case fail-closed: generic subscriber PATCH now locks the parent row and rejects a change away from ACTIVE while any non-TERMINATED service remains (`OPEN_SERVICES_EXIST`); service creation rechecks active subscriber status under the same parent lock to prevent a race. Existing historical invoices/payments/ledger are untouched. Omitted collector/area IDs on generic PATCH no longer clear stored assignments. Added a role-aware Deactivate action, disabled explanatory state for open services and a confirmation dialog to `features/subscribers/SubscriberPanel.tsx`, with `updateSubscriberStatus` in `lib/api-client.ts`. Extended guarded `test/gate3-subscriber-postgres.test.ts` to verify Viewer 403, active-service 409, unchanged status/version after rejection, termination then deactivation 204, stale version 409, inactive subscriber refusing new services, restart persistence and one status audit event. The guarded test passed 1/1. Extended `test/gate3-auth-electron-smoke.ts`; isolated API 4110 plus Electron dev renderer 5173 passed create/edit/search/deactivate plus previous session/role checks. `corepack pnpm --dir source typecheck` passed. `tests/Run-StaticAcceptance.ps1` passed after all changes: API 51 passed/5 opt-in skipped, desktop 8 passed, shared 4 passed, typechecks/builds/schema/source-integrity. Targeted `git diff --check` had only LF/CRLF warnings, no whitespace error. Test processes were stopped; normal API 4100 `/health/ready` returned 200. This proves the conservative deactivation path locally, not an approved active-service cancellation policy or packaged-client acceptance. Gate 3 remains Partial. Exact next task is above.

**Gate 3 auth/session module (2026-10-01):** Inspected renderer/API authentication against the activity. Existing login, forced password change, lock/unlock, sign-out, role checks, server tokens and query-cache clearing were retained. Found that the Lock handler awaited the API before hiding the private workspace; if `/auth/lock` failed offline, the screen could stay visible. Changed `source/apps/desktop/src/renderer/src/App.tsx`; added `lib/session-boundary.ts` and `lib/session-boundary.test.ts` so local lock and private-query clearing happen before the server request and remain in effect on failure. Added guarded `source/apps/api/test/gate3-auth-electron-smoke.ts` (requires exactly local `127.0.0.1:5433/bcis_test` with 13 migrations, isolated API 4110 and Electron dev renderer 5173/CDP 9236). It creates random in-memory OWNER/VIEWER actors in the test DB, then deactivates them and revokes sessions. Commands/results: API and desktop typechecks passed; focused desktop Vitest `session-boundary.test.ts query-client.test.ts` 3/3; the guarded live Electron smoke exited 0 with offline-lock private-view hiding, server lock/unlock, sign-out, Owner/Viewer navigation isolation, Viewer `/users` API 403, and reload clearing the in-memory session. `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/4 opt-in skipped, desktop 8 passed, shared 4 passed, all typechecks/builds/schema/source-integrity checks. Temporary API/Electron test processes stopped; normal API 4100 ready returned 200. No credentials or tokens were logged or saved. This proves the bounded auth/session regression locally, not packaged-app E2E, expiry timing or any unapproved idle-lock threshold. Gate 3 remains Partial. Exact next step is the subscribers/services task above.

**Gate 3 subscriber identity module (2026-10-01):** Existing subscriber create/list/profile and service creation were inspected. Identity editing was missing. Added a version-checked, `subscriber.update`-authorized `PATCH /api/v1/subscribers/:id/identity` in `source/apps/api/src/modules/subscribers/subscriber-routes.ts`/`subscriber-service.ts`; it edits only first/middle/last/suffix, recomputes normalized search, increments version and writes an audit event in one transaction. Added `updateSubscriberIdentity` to desktop `lib/api-client.ts`, role-aware React Hook Form/Zod profile editing and query invalidation in `features/subscribers/SubscriberPanel.tsx`, and passed the existing permission in `App.tsx`. The first Electron attempt exposed that Fastify CORS preflight advertised only GET/HEAD/POST; changed `src/app/build-app.ts` to explicitly allow the already-used PUT/PATCH methods and added preflight assertions in `test/health.test.ts`. Added guarded `test/gate3-subscriber-postgres.test.ts` and extended `test/gate3-auth-electron-smoke.ts` with subscriber create/edit/search. Focused PostgreSQL Vitest: 1/1 passed, verifying Viewer 403, invalid input 400, stale version 409, normalized search, restart persistence, untouched billing days/contact/address counts and one audit event. Focused CORS test: 5/5 passed. Isolated API 4110 plus Electron dev renderer 5173 smoke exited 0 with subscriber create/edit/search and the auth/session checks. Final `tests/Run-StaticAcceptance.ps1` passed: API 51 passed/5 opt-in skipped, desktop 8 passed, shared 4 passed, all typechecks/builds/schema/source-integrity checks. `git diff --check` had only existing LF/CRLF warnings, no whitespace error. Temporary test processes were stopped; normal API 4100 `/health/ready` returned 200. No development `bcis` data was used for the destructive test. This verifies identity editing locally, not all subscribers/services or packaged Electron. Gate 3 remains Partial. Exact next task is above.

**This handoff update (D-010, 2026-09-30):** Changed `source/apps/api/src/app/build-app.ts` (document explicit file-origin opt-in), `source/apps/api/.env.example` and ignored `source/apps/api/.env` (`null` added to the specific CORS allowlist), and `source/apps/api/test/health.test.ts` (allowed `null` preflight/GET and denied foreign/null-without-opt-in regressions). `corepack pnpm --dir source --filter @bcis/api exec vitest run test/health.test.ts --maxWorkers=1 --isolate=false`: 5 passed. Started API with `corepack pnpm --dir source --filter @bcis/api dev`; live ready with `Origin: null` returned 200 and `Access-Control-Allow-Origin: null`. Launched the existing `release/win-unpacked` executable after removing inherited `ELECTRON_RUN_AS_NODE` in its launch shell. The packaged renderer loaded its sign-in page from `file://`; renderer fetches to both `/api/v1/health/live` and `/api/v1/health/ready` returned 200. This proves packaged health access, not packaged login or a rebuilt installer. The locally configured bootstrap password returned 401 and was not printed. DevTools also logged `Unable to load preload script`; its cause is not yet verified. Keep D-010 partial and Gate 1 open. Exact remaining check: launch the unpacked client with the API running, have the owner enter their current password, verify sign-in and forced-password-change behavior, and inspect preload diagnostics; then rebuild/retest the installer before final Gate 1 claim.

**D-011 update (2026-09-30):** Changed `source/apps/desktop/src/renderer/src/features/payments/PaymentPanel.tsx`, `features/collections/CollectionBatchesPanel.tsx`, and added `lib/pending-command.ts`/`pending-command.test.ts`. Cash and batch collection now retain a command key across an uncertain retry, lock the pending input details, and clear it only after a confirmed post. `corepack pnpm --dir source --filter @bcis/desktop typecheck`: passed; `corepack pnpm --dir source --filter @bcis/desktop exec vitest run src/renderer/src/lib/pending-command.test.ts`: 2 passed. Existing API transaction/idempotency and unique indexes were inspected but not changed. This is client/key-lifetime evidence only: no dropped-response retry through PostgreSQL or one-payment/receipt/allocation/ledger assertion was run against `bcis_test`. Do that before D-011 or Gate 1 is verified; next immediate implementation task is D-012.

**D-012 update (2026-09-30):** Changed `source/apps/desktop/src/renderer/src/App.tsx`, `lib/api-client.ts`, `lib/query-client.ts`; added `lib/query-client.test.ts`. Private query/mutation cache is destroyed at authentication boundaries; expired/locked session errors clear it, and 403/window focus refreshes `/auth/me` to detect changed roles/permissions. A changed identity remounts the dashboard so local module state cannot survive. `corepack pnpm --dir source --filter @bcis/desktop typecheck`: passed; focused desktop Vitest for query and pending command helpers: 3 passed. This does not yet prove a live Owner-to-lower-role sign-in or an in-flight API response race through packaged Electron. Keep D-012 partial; next immediate task is D-013.

**D-013 update (2026-09-30):** Changed `source/apps/api/src/modules/subscribers/subscriber-service.ts` and `source/apps/api/test/subscriber-rules.test.ts`. The generic service editor rejects transitions into/out of SUSPENDED or DISCONNECTED with `SERVICE_CONTROL_WORKFLOW_REQUIRED`; the existing receivables request/approve/complete path remains the only suspension/reconnection writer. Same-status edits, PENDING-to-ACTIVE activation and ACTIVE-to-TERMINATED remain allowed. `corepack pnpm --dir source --filter @bcis/api typecheck`: passed; `corepack pnpm --dir source --filter @bcis/api exec vitest run test/subscriber-rules.test.ts --maxWorkers=1 --isolate=false`: 5 passed. These are rule-level checks, not authenticated direct API or multi-actor PostgreSQL evidence. The subsequent static gate result is recorded below.

**Final local checks (2026-09-30):** `powershell -NoProfile -ExecutionPolicy Bypass -File tests/Run-StaticAcceptance.ps1` passed after all source changes: API 51/51, desktop 6/6, shared 4/4, all workspace typechecks, source-integrity check, production build, and Drizzle schema check. `corepack pnpm --dir source --filter @bcis/desktop dist:win` passed and rebuilt the unpacked app plus NSIS installer (SHA-256 `1F49F4EDC944AE9D843CA8D5186B1CADADE857D80DA8AACA4471B26CCA97FCC0`). During packaged verification the old ESM preload was absent under the sandbox. Changed `source/apps/desktop/electron.vite.config.ts` and `src/main/index.ts` to emit/load CommonJS preload while retaining sandbox, context isolation, nodeIntegration=false and CSP. Rebuilt package; the new packaged `file://` renderer showed sign-in, `window.bcis` exposed only `getAppVersion`, `platform`, `saveReport`, and live/ready returned 200/200. The installer was built, not installed on a clean account. Owner login was not performed because the current password is unavailable; the bootstrap value returned 401. The direct `electron-builder --win dir` attempt failed because its environment omitted the workspace tools PATH; the standard `dist:win` command succeeded. `git diff --check` emitted only existing LF/CRLF warnings, no whitespace errors. Gate 1 remains partial. Exact next step is the packaged owner interaction in **Next task**.

**D-010 follow-up acceptance (2026-09-30):** With API 4100 and the rebuilt `release/win-unpacked` client, a temporary synthetic user assigned the existing OWNER role was created in the demo `bcis` database with a random in-memory password and `must_change_password=true`. Renderer automation observed packaged sign-in, required password-change screen, workspace, lock, unlock and sign-out, all passing. No password/token was printed or saved. The temporary user was deactivated and its sessions revoked; audit/session history was retained. This verifies the packaged owner-role flow but not clean installer installation or the real owner's current credentials. No source files changed in this follow-up. Next task is D-011 test-database setup as stated above.

**D-012 packaged follow-up acceptance (2026-09-30):** Created temporary synthetic OWNER and VIEWER users in demo `bcis` with random in-memory passwords. Through the rebuilt packaged renderer, the Owner could open User accounts; changing that test user's role to VIEWER in PostgreSQL and dispatching a focus refresh removed admin navigation and remounted the workspace. After sign-out, the separate Viewer signed in without Owner-only navigation or prior Owner profile data. A Viewer request to `/api/v1/users` returned 403. Both synthetic users were deactivated and their sessions revoked; audit/session history was retained. No source files changed. Together with the focused private-query cancellation test, D-012's cross-user/permission isolation is verified locally. An artificially delayed network response was not exercised through the packaged UI; keep it as a later E2E regression.

**Gate 1 stop point (2026-09-30):** The test database does not yet exist. Read-only check with the ignored app connection returned `bcis_app|bcis|CREATE-on-current-db=true|bcis_test-exists=false`; `bcis_app` has neither `CREATEDB` nor superuser authority. A no-password PostgreSQL administrator connection failed with `fe_sendauth: no password supplied`. No `bcis_test` migrations, seed, transaction retry or service-control fixture was run, and no existing subscriber/service or financial row was used as a fixture. The user can create the empty database locally in pgAdmin while connected as PostgreSQL administrator: `CREATE DATABASE bcis_test OWNER bcis_app;` (connect Query Tool to `postgres`, not `bcis`). Do not put a password in chat. Then recheck that the target is exactly `bcis_test` before applying migrations/seeds or running tests. API readiness remained 200; the hidden packaged test client was closed. No source changed after the previously passing static gate.

**D-011 PostgreSQL acceptance (2026-09-30):** The user created `bcis_test` in PostgreSQL 18/5433. Guarded connection verified `current_database=bcis_test`, `current_user=bcis_app`, owner `bcis_app`, and zero initial public tables. With `DATABASE_URL` set only in that shell to the guarded `/bcis_test` URL, `corepack pnpm --dir database migrate`, `seed:security` (random in-memory bootstrap password), and `seed:master-data` passed: 13 migrations, one test Owner, 50 synthetic subscribers, 60 services. Added `source/apps/api/test/gate1-postgres.test.ts`, which runs only when `BCIS_TEST_DATABASE_URL` is explicitly set and checks host, port, database name and 13 migrations before mutations. It creates a fresh synthetic subscriber/service, finalizes billing, posts direct Cash and a batch collection, discards each first successful response, retries with the same key, rejects a changed amount with 409, and asserts one payment/receipt/allocation/ledger credit/audit set per key plus invoice receivable equal to ledger net. `corepack pnpm --dir source --filter @bcis/api typecheck`: passed. First test run exposed an assertion SQL cast error (`audit_logs.entity_id` text versus UUID); corrected the test query without changing financial code. Rerun `corepack pnpm --dir source --filter @bcis/api exec vitest run test/gate1-postgres.test.ts --maxWorkers=1 --isolate=false --testTimeout=120000` with guarded `BCIS_TEST_DATABASE_URL`: 1/1 passed. The first run left only synthetic data in `bcis_test`; no development/production financial rows were touched. D-011 is verified for API/database idempotency and the previously tested client key lifetime; a physical network disconnect in Electron remains a later E2E check. Next task is D-013 above.

**D-013 PostgreSQL acceptance (2026-09-30):** Extended `source/apps/api/test/gate1-postgres.test.ts` with a second guarded integration scenario. It creates a synthetic subscriber/service and four test actors in `bcis_test`, calls the authenticated generic PATCH for suspension, disconnection and reconnection (409), verifies a VIEWER is denied (403), and checks that premature completion, self-approval and same-approver completion are rejected. Distinct requester/approver/completer users then complete suspension and reconnection; status persists through separate PostgreSQL assertions, each audit action occurs once, actor IDs match, and ordinary ACTIVE editing succeeds. `corepack pnpm --dir source --filter @bcis/api typecheck`: passed. Focused guarded Vitest `test/gate1-postgres.test.ts --maxWorkers=1 --isolate=false --testTimeout=120000`: 2/2 passed. No development subscriber/service or financial rows were used. Next exact command is the static gate in **Next task**.

**Gate 1 final local checks (2026-09-30):** With `BCIS_TEST_DATABASE_URL` unset, `powershell -NoProfile -ExecutionPolicy Bypass -File tests/Run-StaticAcceptance.ps1` passed after the D-013 integration test was added: API 51 passed/2 guarded integration skipped, desktop 6 passed, shared 4 passed, plus workspace typechecks, build, source-integrity and Drizzle checks. The guarded `bcis_test` integration suite separately passed 2/2. A development Electron renderer connected to API 4100 and passed synthetic Owner login/logout. Through the rebuilt unpacked packaged renderer against a temporary API connected only to `bcis_test`, a synthetic Owner submitted a Cash payment, the first successful response was deliberately lost in the renderer, and Confirm retried the same key: one payment, receipt, allocation and ledger credit remained. The test API and packaged app were stopped; the original development API was restored to the ignored `/bcis` connection and `/health/ready` returned 200. No test credentials were printed or saved; the temporary packaged-UI actor was deactivated and sessions revoked. `git diff --check` found no whitespace errors (existing LF/CRLF warnings only).

**Installed-client checkpoint (2026-09-30):** Before installing, no BCIS uninstall registration existed. The current NSIS artifact SHA-256 was `1F49F4EDC944AE9D843CA8D5186B1CADADE857D80DA8AACA4471B26CCA97FCC0`. Its silent current-user install exited 0, registered BCIS version 0.1.0, and placed the executable in the current user's AppData\\Local\\Programs folder. No installed BCIS process was running afterward. Two automated `Start-Process` attempts to launch it with CDP were rejected by the execution tool before execution; this is not an application failure, and installed-client API access/login is unverified. The installed application was intentionally left in place for the manual check above. Gate 1 stays Partial because its exit explicitly requires installed-client access. No source changed after the passing static gate; only this handoff was updated.

**Gate 2 task 1, guarded Cash integration (2026-09-30):** Added `source/apps/api/test/gate2-cash-postgres.test.ts`; it opts in only through `BCIS_TEST_DATABASE_URL`, validates exact host/port/database and 13 migrations, and uses only fresh synthetic actors/subscriber/service in `bcis_test`. Two billing periods, duplicate finalize command, Viewer denials, oldest-first partial Cash allocation, repeated payment key, changed-payload 409, overpayment fail-closed/no financial row change, one receipt, compensating reversal, immutable payment/voided receipt, ledger-receivable equality, audit, AR report comparison and persistence after Fastify app recreation passed. The first typecheck failed because two `buildApp` calls missed `await`; fixed them. Guarded focused Vitest: 1/1 passed; `corepack pnpm --dir source --filter @bcis/api typecheck`: passed. This is an app recreation, not a separate API process restart or Electron E2E. No production/development data was used. Next exact task is concurrency plus forced multi-row rollback in the same guarded suite, then live Electron workflow. Gate 2 remains Partial.

**Gate 2 task 2, forced rollback and concurrency (2026-09-30):** Extended `source/apps/api/test/gate2-cash-postgres.test.ts` with a second guarded case. It concurrently finalizes one new period with two keys and verifies one invoice for the synthetic subscriber. On `bcis_test` only, a uniquely named temporary receipt CHECK constraint forces a database error after the Cash transaction has begun. The constraint is dropped in `finally`; the failed command leaves no payment, receipt, allocation, ledger or numbering change. Two concurrent requests with one payment key return the same payment, and two distinct concurrent keys create separate, uniquely numbered payment/receipt pairs; invoice outstanding still equals ledger debits minus credits. Focused guarded Vitest: 2/2 passed; API typecheck passed. No development/production rows were used. Next task is the real-process and Electron workflow in **Next task**; Gate 2 remains Partial.

**Gate 2 task 3, development Electron vertical workflow (2026-09-30):** Added `source/apps/api/test/gate2-electron-smoke.ts`, an opt-in script guarded to PostgreSQL 18/5433/`bcis_test`, dedicated test API 4110 and Electron dev renderer 5173/CDP 9235. It creates a random in-memory Owner credential, drives the actual Electron login, subscriber and service forms, billing preview/finalization, Cash search/preview/post/receipt and report/audit navigation, then compares subscriber-specific PostgreSQL invoice outstanding with ledger net. It reloads the Electron renderer, signs in again and rechecks unchanged totals; finally deactivates the actor and revokes sessions. Initial run stopped at login because the test desktop's CSP origin was still 4100; restarted it with `BCIS_API_ORIGIN=http://127.0.0.1:4110` (no source change). Second run reached billing but exposed a test selector quoting error; fixed the selector. Final guarded `corepack pnpm --dir source --filter @bcis/api exec tsx test/gate2-electron-smoke.ts` passed: one service, invoice, Cash payment, receipt and allocation, with matching ledger/receivable and unchanged state after renderer reload. The normal API on 4100/`bcis` was not stopped or pointed at test data. This is Electron dev-client evidence, not installed/package E2E or full API/Electron process restart. Next task is the process-restart proof in **Next task**.

**Gate 2 task 4, process restart and final coverage (2026-09-30):** Before restart, the synthetic Electron-created subscriber `SUB-0000059` had one POSTED Cash payment, invoice outstanding 79,800 centavos and ledger net 79,800. Stopped only the dedicated test API 4110 and Electron dev client 5173/9235; restarted both with `DATABASE_URL` guarded to `/bcis_test`, `VITE_BCIS_API_BASE_URL` and `BCIS_API_ORIGIN` on 4110. Added a restart-check mode to `source/apps/api/test/gate2-electron-smoke.ts`; a new in-memory synthetic Owner signed into the restarted Electron client, found the prior subscriber through UI search, opened the profile and saw its Ledger/SOA balance. The guarded script reported `persistedAfterProcessRestart=true`, one payment, outstanding 79,800 and equal ledger net. The actor was deactivated and its sessions revoked. Then stopped the isolated test API/Electron; the normal API on 4100 remained Ready (HTTP 200). This proves a development Electron/API process restart, not installed-package E2E or three-PC LAN.

**Gate 2 final test gate (2026-09-30):** Extended `source/apps/api/test/gate2-cash-postgres.test.ts` to cover Owner versus Viewer subscriber/service edits and a full exact Cash settlement after the partial-payment reversal. Guarded focused Vitest for Gate 1 plus Gate 2 PostgreSQL suites passed 4/4; Gate 2 includes exact/partial/oldest-first, one-payment/receipt/ledger assertions, authorization, report/audit, failed receipt insert rollback, numbering, and concurrent billing/payment. With test URL unset, `powershell -NoProfile -ExecutionPolicy Bypass -File tests/Run-StaticAcceptance.ps1` passed after the last source change: API 51 passed/4 guarded integration skipped, desktop 6 passed, shared 4 passed, all workspace typechecks, production builds, source-integrity and Drizzle schema check. `git diff --check` found no whitespace errors; only existing line-ending warnings. Gate 2's documented local exit is satisfied; it is **Verified locally**, not final laboratory acceptance. Installed-client, clean setup, printing, restore and LAN evidence remain separate gates.

**Local Owner credential recovery (2026-09-30):** The user explicitly requested a reset after forgetting the BCIS username/password. Read-only PostgreSQL query confirmed one active OWNER username `owner`; its existing password had been changed (`must_change_password=false`). Added `database/scripts/reset-local-owner-password.ts`, which requires a confirmation flag and guards the target to local PostgreSQL 18/5433 `/bcis` as `bcis_app` with 13 migrations. It generated a random temporary password only in process memory, replaced only the active `owner` password hash in one transaction, set `must_change_password=true`, cleared failed-login lockout, revoked prior sessions and inserted a credential-reset audit event without any secret. It placed the temporary password on the current Windows clipboard; no password was written to Git, documentation, command output or evidence. `corepack pnpm --dir database typecheck` passed; the recovery command exited 0. API login with the clipboard value returned 200 and `mustChangePassword=true`; the verification session was logged out with HTTP 204. An initial PowerShell logout probe without JSON content type returned 500 due to PowerShell's default unsupported media type; repeating with explicit JSON returned 204. This is not an installed-client result. API live/ready was 200 before recovery. Next step is the user's UI check in **Next task**.

**Post-recovery static gate (2026-09-30):** `powershell -NoProfile -ExecutionPolicy Bypass -File tests/Run-StaticAcceptance.ps1` passed after adding the guarded recovery utility: API 51 passed/4 opt-in PostgreSQL tests skipped, desktop 6 passed, shared 4 passed, all workspace typechecks and production builds, source-integrity and Drizzle checks. The installed-client interaction is still unobserved, so Gate 1 remains Partial.

**Installed Owner interaction (2026-10-01):** The user reported that they changed the recovered Owner password and successfully signed in through the installed client. A read-only query of local `/bcis` confirmed `owner|must_change_password=false|is_active=true`; the normal API `/health/ready` returned 200. No password or token was requested or recorded. This is user-observed installed login plus database confirmation of completed password change, not yet proof of the installed dashboard's Online/Ready indicators, lock/unlock or sign-out. Gate 1 remains Partial; next check is in **Next task**.

**Gate 1 installed-client exit (2026-10-01):** In response to the explicit three-step installed-client checklist, the user confirmed that Dashboard Fastify API/PostgreSQL indicators, bottom-left Lock and password Unlock, and Sign out all worked. Read-only local `bcis` audit counts for the Owner over the last two days showed `auth.login=4`, `auth.lock=2`, `auth.unlock=2`, `auth.logout=2`, and `user.password.change=1`; normal `/health/live` and `/health/ready` returned 200/200. Combined with earlier unpacked-client role isolation, guarded Cash/batch lost-response retry, direct API service-control denials and multi-actor flow, all Gate 1 exit conditions now have local evidence. Mark Gate 1 **Verified locally**. This is not clean-account install/uninstall, physical network interruption or three-PC acceptance; those remain later gates. No source or test files changed for this check, only this handoff.

**Repository safety:** Branch `main`, baseline commit `1fed84a` when this handoff was written. `git status --porcelain` showed 68 modified/deleted/untracked entries, including previously uncommitted source and documentation/archive work. Treat every existing change as user work. Review current status before each task; do not reset, checkout, delete, reformat or commit unrelated files. Archived documentation paths show as deletes and new files until staged; the source-integrity check currently passes.

**Latest verified application evidence (2026-09-28, not retested on 2026-09-30):** API 48/48, Electron configuration 3/3, shared 4/4; all four workspace typechecks, Drizzle schema check and source-integrity check passed. PostgreSQL 18/5433 and API live/ready returned 200, with 13 migrations (`0000`–`0012`). Local Cash partial/final/reversal and API restart were recorded. Current invoice outstanding and ledger net each equalled 7,913,900 centavos; invoice paid and active allocations each equalled 50,000. One backup is marked VERIFIED and an NSIS executable exists. Those results do not prove packaged login, isolated restore, printing, Electron E2E or LAN. Run relevant checks again after code changes and date the new result.

**Known defects and verification gaps:** D-010-D-013 and Gate 1's installed-client interaction are verified locally. D-014 backup manifest/dump snapshot mismatch under concurrent writes and D-015 mobile drawer focus containment remain open. The plan has exact findings and expected checks.

**Gate board (current evidence only):**

| Gate | Current status | Next proof needed |
|---|---|---|
| 0 Baseline/contracts | Verified locally | Refresh UI/API/permission/table map when contracts change; preserve dirty tree. |
| 1 Connectivity/session/retry/authority | Verified locally | Installed Owner login/change/Online/Ready/lock/unlock/logout plus guarded retry, role isolation and service authority pass; clean-account installation remains Gate 6. |
| 2 Cash/PostgreSQL integration | Verified locally | Exact/partial/reversal, rollback, concurrency, reports/audit and restarted API/Electron workflow pass on guarded bcis_test; later clean-setup and packaged E2E remain Gate 5/6. |
| 3 Approved operations/UI | Partial | Missing CRUD/search/lifecycle, forms/tables/role UI and live cross-module proof. |
| 4 Required financial policies/features | Blocked by policy | Written rules and working GCash, advance, void/adjustment and shortage settlement; additional required payment methods. |
| 5 Restore/automated acceptance | Partial | Consistent backup snapshot, isolated restore and Playwright Electron/integration suites. |
| 6 Installer/reports/three-PC LAN | Partial | Rebuilt clean installer, printing/exports, complete reports and simultaneous clients. |
| 7 Documentation/submission | Partial | Complete D1–D8, AT-01–AT-12 outcomes, screenshots, checksums and defense rehearsal. |

**Requirement coverage at this handoff:** Seven roles/29 permissions, subscriber/plan/service schema, Cash billing/ledger/reversal, balanced collection logic, invoice-level and grouped-overdue AR with aging/filters, durable new-batch route-sheet snapshots, four report families, audit and backup foundations exist. Locally verified Gate 3 slices now include subscriber identity/contact/address editing, plan future-pricing, invoice detail/SOA, payment history/receipt/reversal and paginated ledger. Activity gaps include Bank Transfer/Cheque/Other, GCash verified proof processing, advance credit, controlled invoice void/credit, cross-module global search, complete reports/dashboard AR KPIs, physical route-sheet printing and legacy-sheet acceptance, full collection state semantics, five demo users, three billing months, ten overdue cases and two service-control examples. Current demo database has two users, 51 subscribers, 61 services, seven plans, two collectors, three areas, one billing month, two Cash payments and one reversal; zero overdue, batch, remittance, GCash proof or service-control rows. No AT-01–AT-12 scenario is fully accepted yet. Required features cannot be silently replaced by an exclusion or a simulated screen.

**External decisions needed for Gate 4:** GCash duplicate scope/override, proof format/storage/retention and verifier separation; advance-credit ownership/application/refund; adjustment/void authority and ledger treatment; shortage/overage settlement; suspension/grace/reconnection qualification/fees; numbering, timezone and enabled charges. Record the decision source/date and exact rule here before enabling any currently blocked financial behavior. If the instructor formally excludes a required feature, record the signed scope change and affected tests here. AT-08's visible shortage and blocked balanced close can be tested before settlement policy.

**Environment and test boundaries:** Local PostgreSQL 18 uses port 5433, API port 4100, and ignored API `.env`; never print or commit passwords. Use synthetic data. A separate disposable `bcis_test` database is required before destructive integration tests. Preserve integer `bigint` centavos, string HTTP amounts, transactions, compensating history, server permissions and Electron isolation. Keep the existing `tests/Run-StaticAcceptance.ps1` static gate; it builds files and does not substitute for PostgreSQL, packaged Electron or LAN acceptance. Three office PCs remain the activity target; no cloud or mass-use architecture is planned.

**Resume protocol:** Read the first open task above, inspect `git status`, compare the real code with the plan, implement one bounded task, run focused tests and the appropriate gate, then edit this handoff before stopping. If interrupted, replace “Next task” with an **In progress** entry naming affected files, the last passing command, exact failure and next command. Use the dated update template below for completed tasks. Never advance the gate board without the exit proof in the plan.

### Next work queue

| Order | Task | State | Done when |
|---|---|---|---|
| 1 | D-010 packaged CORS and login | Verified for unpacked synthetic Owner | Restricted origins, unpacked live/ready, preload and Owner-role sign-in/change/lock/logout pass; clean installation remains Gate 6. |
| 2 | D-011 payment/batch retry identity | Verified locally | Same-key client tests and guarded Cash/batch PostgreSQL dropped-response reconciliation pass. |
| 3 | D-012 session/cache isolation | Verified locally | Cache-clearing test, packaged role downgrade and Owner-to-Viewer sign-in pass; delayed-response E2E remains later work. |
| 4 | D-013 service-control authority | Verified locally | Generic PATCH 409, Viewer 403, three-actor suspension/reconnection and audit checks pass on bcis_test. |
| 5 | Gate 2 guarded PostgreSQL integration harness | Verified locally | Guarded financial suites, real-process Electron Cash journey, restart persistence and final static gate pass. |
| 6 | Gate 1 installed-client interaction | Verified locally | User confirmed Online/Ready, Owner login/change, lock/unlock and sign-out; audit counts corroborate session actions. |
| 7 | Gate 3 auth/session | Verified locally | Offline lock, role-aware Electron workflow, permission denial and static gate passed; packaged E2E remains Gate 5/6. |
| 8 | Gate 3 subscriber identity | Verified locally | Permission, validation, conflict, audit, search, restart and Electron create/edit/search passed on guarded `bcis_test`. |
| 9 | Gate 3 subscriber status/deactivation | Verified locally for no-open-service case | Active-service block, permission, conflict, audit, persistence and Electron confirmation passed; active-service cancellation remains undefined. |
| 10 | Gate 3 contact addition | Verified locally | Permission, validation, conflict, primary switch, search, audit, restart and Electron flow passed on guarded `bcis_test`. |
| 11 | Gate 3 address addition | Verified locally | Permission, validation, conflict, primary switch, search, audit, restart, unchanged service address and Electron flow passed on guarded `bcis_test`. |
| 12 | Gate 3 service detail/editing | Verified locally for plan/address edits | Permission, validation, conflict, rate/history, audit, restart and Electron flow passed on guarded `bcis_test`; fieldwork states remain gated. |
| 13 | Gate 3 plan lifecycle | Verified locally | Plan edit/archive and future-only pricing passed guarded PostgreSQL, Electron UI, typecheck and static gate; packaged check remains later. |
| 14 | Gate 3 contact edit/deactivation | Verified locally | Authorized version checks, primary fallback, search/history, restart, audit privacy and Electron evidence passed on `bcis_test`. |
| 15 | Gate 3 address edit/deactivation | Verified locally for unreferenced addresses | In-use service reference safety, primary fallback, search/history, restart, audit privacy and Electron evidence passed on `bcis_test`. |
| 16 | Gate 3 invoice listing/detail | Verified locally | Search, paging, account context, line items, authorization, reconciliation, restart and Viewer Electron navigation passed on `bcis_test`. |
| 17 | Gate 3 ranged/printable SOA | Open | Opening/activity/closing reconciliation, date boundaries, permissions, export/print and Electron evidence. |

Update this queue after each result; keep at least one exact next task. Gate 4 policy work can be prepared in parallel, but its dependent posting behavior remains blocked until written rules exist.

## Current document ownership

The handoff above owns current implementation status. This file retains dated execution history below; the [development checklist](BCIS_Development_Status_Checklist.md) and [acceptance matrix](tests/acceptance/AT-01-AT-12.md) remain detailed supporting views. The [completion plan](BCIS_COMPLETION_PLAN.md) owns scope and work order.

## Audit refresh — 2026-09-28

Status: Partial; not submission-ready. The official activity and CP1–CP6 definitions are now available in [the supplied baseline](BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md).

The read-only audit independently checked:
- API live/ready: HTTP 200; PostgreSQL 18 running on 5433; migration journal count 13.
- API tests: 48/48; Electron configuration tests: 3/3; shared tests: 4/4. Vitest used --no-cache; API retained one worker and isolate=false.
- corepack pnpm --dir source typecheck: all four applicable workspaces passed.
- corepack pnpm --dir source --filter @bcis/api db:check: passed with placeholder connection configuration; schema check does not establish clean deployment.
- tests/Test-SubmissionReadiness.ps1 and git diff --check: passed.
- Final-artifact mode failed at missing tests/screenshots/*.png; generated manuals and completed acceptance report also remain absent.
- Full Run-StaticAcceptance.ps1 was not rerun because it writes build outputs. Earlier full-gate results remain dated history.

Read-only repeatable-read database snapshot:
- users 2; roles 7; permissions 29; subscribers 51; service accounts 61; plans 7; collectors 2; areas 3.
- billing cycles 1 (2026-09); invoices 61; payments 2; allocations 2; reversals 1; ledger entries 64.
- POSTED Cash 50,000 centavos; REVERSED Cash 49,900 centavos.
- invoice outstanding = ledger net = 7,913,900 centavos; invoice paid = active allocations = 50,000 centavos.
- collection batches/remittances, suspensions/reconnections, GCash proofs, advance credits and overdue accounts: zero.
- one backup marked VERIFIED; no isolated restoration was performed.

The existing NSIS executable SHA-256 matched 06AC0BC5158851944F2BD92EC5C7E143783D71CC8EE7C49329863DD19BE21342. This does not prove clean installation or inclusion of later source edits.

A request with Origin: null to the live health endpoint returned 500, while the ordinary request returned 200. Additional source findings cover unstable retry keys, cross-user cache, service-control bypass, backup snapshot consistency and drawer focus. See [D-010–D-015](docs/defect-log.md). No fixes were implemented by the audit.

## Documentation consolidation — 2026-09-28

The user approved 19 Keep, 2 Merge and 12 Archive classifications, with no deletion candidates. The two merged originals were also preserved in the archive, so 14 original documents moved and all 33 original Markdown documents remain represented.

- Consolidated unresolved original-plan decisions and frontend task groups into the active completion plan.
- Merged architecture/context decisions into the technical overview.
- Archived original prompts/plans and ten phase verification records with explicit historical notices.
- Reconciled current checklist, acceptance matrix, release notes, defect log, contract map and guide references.
- Preserved the official activity, unrelated dirty source/configuration files and historical results.
- No code, migration, deployment, policy or database changes were authorized or performed by this documentation pass.

Documentation verification: all 33 original Markdown documents remain represented; all 14 archived bodies match the original text apart from their added historical notice (line endings normalized). All 109 local Markdown links resolve. The official activity remains unchanged. SHA-256 comparisons confirm every pre-existing non-Markdown file is unchanged and no non-Markdown file was added. Submission source-integrity and diff whitespace checks passed. These checks validate documentation consolidation, not application acceptance. Next implementation work remains in the completion plan.

## Historical record — entries below retain their original checkpoint context

The following earlier summaries, blockers and commands are historical. Statements that PostgreSQL, the official activity, installer or query/table integrations were absent have been superseded by the audit refresh above. Original test counts and results are preserved rather than rewritten as current claims.

## 1. Project status at the earlier planning checkpoint

BCIS is a substantial code-level release candidate using Electron, React, Fastify, Drizzle, and PostgreSQL. Authentication/RBAC, subscriber/service management, cash billing/payment/reversal, balanced collection batches, receivables, manual service control, reports, audit viewing, and backup orchestration are present.

The repository is not submission-ready. It has a tracked baseline and preserved uncommitted work, PostgreSQL 18 is live on port 5433, and the integration-first Cash slice plus a real backup verification have passed locally. Policy-dependent workflows remain disabled, while isolated restore, installed-client, printer, and three-PC evidence remain open.

## 2. Requirement checklist

Status meanings:

- Passed: verified in the required environment with retained evidence.
- Code-level: implemented and statically checked, but live acceptance remains.
- Partial: some evidence exists; required work remains.
- Blocked: needs policy, infrastructure, hardware, or an official document.
- Missing: not implemented or not packaged.

| Requirement | Status | Evidence or next action |
|---|---|---|
| Required desktop/API/database architecture | Passed locally | Current source structure, production builds, PostgreSQL 18 readiness, and live API workflow |
| Electron security boundary | Code-level | Two window/CSP tests; installed validation pending |
| Authentication, lock/logout, RBAC | Partial | Owner live API login/forced-change flag and authorization pass; packaged-client role matrix pending |
| Subscriber/plan/service management | Partial | Live PostgreSQL create/persistence passed for a subscriber and service account; edit/deactivate/multi-client proof pending |
| Global cross-module search | Missing | Plan Phase 2 |
| Billing and ledger | Partial | Live bill finalization, invoice debit, partial-payment credit, statement, and restart persistence passed; concurrency suite pending |
| Exact/partial cash payment | Partial | Live partial Cash allocation, receipt, idempotent retry, remaining balance, reversal, and report effects passed; broader integration suite pending |
| Advance payment | Blocked | Instructor policy required |
| GCash upload/verify/deduplicate | Blocked | Instructor policy and attachment handling required |
| Payment reversal | Partial | Live compensating reversal restored PARTIALLY_PAID balance and voided the receipt; broader role/E2E proof pending |
| Balanced collection batch | Partial | Code-level flow; live reconciliation pending |
| Shortage/overage resolution | Blocked | Instructor policy required |
| AR aging | Partial | Rules pass; historical PostgreSQL reconciliation pending |
| Suspension/reconnection | Partial | Manual controlled path exists; automation/fees need policy |
| Dashboard and reports | Partial | Four sample PDF/XLSX families exist; live totals/print pending |
| Audit viewer | Partial | Live payment audit entry confirmed; action-by-action coverage pending |
| Backup and restore | Partial | Real custom-format backup passed SHA-256 and pg_restore catalog verification; isolated restore remains open |
| NSIS installer | Partial | Installer artifact builds with a recorded SHA-256; clean-account install/uninstall remains open |
| Three-PC LAN acceptance | Blocked | Hardware/environment required |
| UI screenshots | Missing | Capture after verified E2E run |
| Final PDF/DOCX documentation | Missing | Generate after source docs and requirements are final |
| Acceptance report and defense material | Missing | Plan Phase 7 |
| Official activity/rubric mapping | Blocked | Official PDF and CP1-CP6 definitions absent |
| Meaningful Git history | Partial | Existing tracked baseline is present; current implementation remains intentionally uncommitted for review |

## 3. Planned phases

| Phase | Name | State |
|---|---|---|
| 0 | Requirement baseline and safe repository capture | Awaiting approval |
| 1 | Verification harness and local reliability | Awaiting approval |
| 2 | Required local feature completion | Awaiting approval |
| 3 | Policy-dependent functional completion | Blocked pending decisions |
| 4 | PostgreSQL integration and financial proof | Blocked pending PostgreSQL |
| 5 | Desktop E2E, printing, and presentation quality | Pending prior phases/environment |
| 6 | Backup, installer, LAN, and recovery | Blocked pending tools/hardware |
| 7 | Final documentation, defense, and release | Pending all applicable gates |

The detailed work, commands, acceptance criteria, risks, and rollback approach are in `BCIS_COMPLETION_PLAN.md`.

## 4. Completed work

### Existing implementation before this planning checkpoint

- Phases 1-8 from the earlier implementation plan are present at code level.
- Phase 9 backup/deployment controls and Phase 10 documentation/static QA are code-prepared.
- Twelve Drizzle migrations, deterministic master/security seeds, four sanitized PDF/XLSX report families, manuals, architecture notes, an acceptance matrix, and a demo checklist exist.

### Pre-planning corrections already present in the working tree

These existed when this planning pass began and were verified, but the repository has no commit history from which to attribute them:

- `tests/Run-StaticAcceptance.ps1` checks native exit codes and fails instead of continuing after a failed command.
- `deployment/windows/Test-BcisPrerequisites.ps1` uses Windows PowerShell-compatible text and parses successfully.
- `source/apps/api/package.json` gives authentication/hash tests a 15-second test and hook timeout.

### Planning-only work on 2026-09-26

- Inspected the repository structure, requirement brief, implementation plan, architecture, schemas, routes, services, desktop panels, tests, deployment scripts, documentation, seeds, samples, and release/evidence folders.
- Compared current implementation with the available activity brief.
- Ran the current static acceptance and Windows prerequisite checks.
- Created `BCIS_COMPLETION_PLAN.md` and this living record.
- No application feature, schema, UI workflow, or policy behavior was implemented during this planning step.

## 5. Files changed

### Planning checkpoint 2026-09-26

| File | Change | Classification |
|---|---|---|
| `BCIS_COMPLETION_PLAN.md` | Added requirement gap analysis and phased completion plan | Planning/documentation |
| `BCIS_PROGRESS_AND_DOCUMENTATION.md` | Added living progress and evidence record | Planning/documentation |

Before any implementation commit, review the three pre-planning working-tree corrections listed in Section 4. Because all repository files are currently untracked, Git cannot provide a normal baseline diff.

## 6. Test and verification results

### Static acceptance - 2026-09-26

Command:

```powershell
& .\tests\Run-StaticAcceptance.ps1
```

Result: Passed.

- Typecheck: shared, database tools, API, and desktop passed.
- API tests: 42 passed across 9 files.
- Electron tests: 2 passed.
- Shared tests: 4 passed.
- API production build: passed.
- Electron main/preload/renderer production build: passed.
- Drizzle schema consistency: passed.
- Non-blocking Rollup warnings: third-party Zod annotation comments were removed during bundling.

### Windows prerequisite check - 2026-09-26

Command:

```powershell
& .\deployment\windows\Test-BcisPrerequisites.ps1
```

Result: Correctly failed with exit code 1.

- Node.js v24.15.0: available.
- API port 4100: available.
- PostgreSQL 16 `pg_dump.exe`: missing.
- PostgreSQL 16 `pg_restore.exe`: missing.

### Repository integrity check - 2026-09-26

- Git repository exists on branch `main`.
- Commit count: zero.
- Tracked file count: zero.
- `.gitignore` rule `backups/` ignores required source under both API and desktop backup modules.
- `release/` contains only `.gitkeep`.
- No `tests/screenshots/` evidence set is present.

## 7. Known limitations and blockers

### Immediate repository blockers

- Backup source code would be omitted by the current `.gitignore`.
- There is no reviewable Git baseline/history.
- The official laboratory PDF and CP1-CP6 definitions are unavailable.

### Policy blockers

- Advance credit/refund/application.
- GCash duplicate, verification, override, separation-of-duties, file, and retention rules.
- Invoice void/adjustment rules.
- Collection shortage/overage settlement.
- Automatic suspension/reconnection and fee rules.
- Final numbering, timezone/calendar, penalty/discount/tax/proration, retention, and security thresholds.

### Infrastructure and hardware blockers

- PostgreSQL 16 and its backup tools are not available on this machine.
- No isolated restore target, physical printer, or three-client lab environment is connected.
- NSIS installer completion has not been proven.

### Evidence blockers

- No live database transaction/reconciliation evidence.
- No installed Electron E2E evidence.
- No printing, restore, LAN, firewall/TLS, concurrency, or clean-install evidence.
- No required screenshot set, signed AT-01-AT-12 report, final documents, or defense package.

## 8. Remaining tasks

1. Obtain user approval for `BCIS_COMPLETION_PLAN.md`.
2. Execute Phase 0 and repair repository tracking safely.
3. Execute Phase 1 and strengthen automated/submission verification.
4. Execute Phase 2 local required features and UI reliability work.
5. Obtain instructor decisions and the official specification before Phase 3.
6. Prepare PostgreSQL and execute Phase 4.
7. Run desktop/printing evidence in Phase 5.
8. Run installer/LAN/backup/restore acceptance in Phase 6.
9. Produce and audit final documents, evidence, checksums, and defense materials in Phase 7.
10. Mark complete only after every applicable item below is passed and evidenced.

## 9. Final submission checklist

- [ ] Official laboratory specification and CP1-CP6 definitions are mapped.
- [ ] Instructor policy decisions are recorded and reflected in tests.
- [ ] All intended source files are tracked; runtime secrets/data/artifacts are excluded.
- [ ] Meaningful Git checkpoint history exists.
- [ ] Clean setup works from the README without code edits.
- [ ] Static acceptance passes from a cold terminal.
- [ ] Clean and upgrade migrations pass on PostgreSQL 16+.
- [ ] Synthetic seeds are repeatable and required counts/scenarios are asserted.
- [ ] Global search and all required screens/workflows are complete.
- [ ] AT-01 through AT-12 have retained evidence or an approved explicit exclusion.
- [ ] Financial rows and reports independently reconcile with no lost centavo.
- [ ] Failure injection proves all-or-nothing financial transactions.
- [ ] Concurrent duplicate billing/payment tests pass.
- [ ] GCash, advance credit, adjustments, and exception workflows match approved policies.
- [ ] Electron security and permissions pass in the installed application.
- [ ] Required PDF/XLSX outputs and physical printing are verified.
- [ ] Backup, verification, isolated restore, and post-restore checksums pass.
- [ ] NSIS installer installs/uninstalls on a clean target.
- [ ] Three clients pass LAN, concurrency, reconnect, and role checks.
- [ ] Firewall/TLS or approved isolated-HTTP evidence is retained.
- [ ] Technical documentation, user manual, ERD, acceptance report, and deployment guide are final.
- [ ] Sanitized screenshots, sample reports, defect log, release notes, and defense material are complete.
- [ ] Release artifacts have SHA-256 checksums and a submission manifest.
- [ ] No credentials, customer data, dumps, backups, proofs, or logs are included.
- [ ] Final demo is rehearsed and the student can explain the critical code and limitations.
- [ ] Final acceptance/sign-off is recorded before creating the submission tag.

## 10. Progress update template

Append one entry after each implementation phase:

```text
### Phase N - Name - YYYY-MM-DD
Status: Passed | Partial | Blocked
Scope completed:
Files changed:
Commands run:
Results/evidence:
Defects found/fixed:
Remaining blockers:
Rollback point/commit:
Next approved phase:
```

### Phase 0 - Requirement baseline and safe repository capture - 2026-09-26

Status: Partial - locally achievable repository work completed; official inputs remain blocked.

Scope completed:

- Replaced the broad `backups/` ignore rule with repository-rooted runtime exclusions.
- Confirmed the API and desktop backup source folders are no longer ignored.
- Added `tests/screenshots/.gitkeep` so the required evidence location is represented.
- Retained the official laboratory PDF, CP1-CP6 definitions, report branding, and instructor policy decisions as explicit external blockers.

Files changed:

- `.gitignore`
- `tests/screenshots/.gitkeep`
- `BCIS_PROGRESS_AND_DOCUMENTATION.md`

Commands run:

- `git check-ignore -v` against both backup source modules.
- `git status --short --untracked-files=all`.
- Focused credential/private-key scan before staging.

Results/evidence:

- Required backup source code is trackable.
- Runtime backup/attachment data remains excluded at explicit paths.
- No official activity document was found; final rubric mapping remains unavailable.

Remaining blockers:

- Official laboratory PDF and CP1-CP6 definitions.
- Instructor decisions listed in Section 7.

Rollback point/commit: baseline repository commit created after the tracking and staged-file review.

Next approved phase: Phase 1 - verification harness and local reliability.

### Phase 1 - Verification harness and local reliability - 2026-09-26

Status: Passed for the locally achievable Phase 1 scope.

Scope completed:

- Added `tests/Test-SubmissionReadiness.ps1` to fail when critical source is untracked/ignored or runtime/secret-shaped artifacts are tracked.
- Added an optional final-artifact mode covering the installer, screenshots, generated manuals, and acceptance report.
- Integrated source-integrity verification into `tests/Run-StaticAcceptance.ps1`.
- Added API tests proving that GCash posting/upload and invoice voiding remain fail-closed and that authorization is enforced before policy details are exposed.
- Serialized recursive workspace typecheck/build/test commands to reduce peak memory use on the target workstation.
- Reused a single Vitest worker across API test files to avoid repeated transform/isolate overhead while retaining test cleanup.

Files changed:

- `tests/Test-SubmissionReadiness.ps1`
- `tests/Run-StaticAcceptance.ps1`
- `source/apps/api/test/policy-gates.test.ts`
- `source/apps/api/package.json`
- `source/package.json`
- `BCIS_PROGRESS_AND_DOCUMENTATION.md`

Commands/results:

- Submission source-integrity gate: passed.
- API tests: 46 passed across 10 files, including 4 new policy-gate tests.
- Serialized workspace typecheck: all four applicable projects passed.
- An initial parallel typecheck hit a native Node memory-allocation failure; the serialized configuration was added and passed. This was a process-resource failure, not a TypeScript diagnostic.

Remaining blockers: PostgreSQL-backed integration tests are Phase 4 and cannot run on the current machine.

Rollback point/commit: Phase 1 reliability commit.

Next approved phase: Phase 2 - required local feature completion.

### Integration-First Phase 0 - Contract map and baseline preservation - 2026-09-28

Status: Passed.

- Preserved the existing dirty working tree and baseline commit without reset or destructive Git operations.
- Added `docs/architecture/integration-contract-map.md` with the UI, API, permission, table, policy, and evidence chain for every existing module.
- Kept the complete post-change static gate and live environment gates separate.

### Integration-First Phase 1 - PostgreSQL readiness and owner authentication - 2026-09-28

Status: Passed for API/database readiness; Electron UI automation remains for Phase 6.

- Confirmed PostgreSQL 18.4 is running on port 5433.
- Recovered local administrator access through a temporary localhost-only rule, created the least-privilege `bcis_app` role and `bcis` database, then restored the original SCRAM rules.
- Added repeatable Drizzle migration tooling and explicit environment-file loading for database scripts.
- Updated prerequisite discovery to select the newest installed PostgreSQL version 16 or later.
- Applied 12 baseline migrations and deterministic security/master seeds twice to verify repeatability.
- Verified 7 roles, 29 permissions, 1 bootstrap owner, 3 service types, 7 plans, 50 seeded subscribers, 60 seeded service accounts, 2 collectors, and 3 areas.
- Verified `/health/live` and `/health/ready`, owner login, `/auth/me`, 29 permissions, and the forced-password-change flag.
- No password was printed, committed, or copied into documentation.

### Integration-First Phase 2 - Live Cash vertical slice - 2026-09-28

Status: Passed for the local Fastify/PostgreSQL workflow; installed Electron and cross-PC evidence remain open.

- Created synthetic subscriber `SUB-0000051` and Internet service `SVC-0000061` through the API.
- Previewed and finalized the September 2026 billing cycle for 61 active synthetic services.
- Verified invoice and ledger debit for `INV-202609-00000001`.
- Posted a partial Cash payment of 50,000 centavos, issued a receipt, and verified a 49,900-centavo balance.
- Replayed the same command key and confirmed the original payment was returned without duplication.
- Verified monthly collection-report inclusion and the `payment.post` audit record.
- Restarted the API and confirmed database readiness and persisted state.
- Posted the final 49,900 centavos, confirmed `PAID`, reversed that payment, and confirmed the receipt was voided, history remained, and the invoice returned to `PARTIALLY_PAID` with the correct balance.

Defect found and fixed:

- Partial payments previously left invoices labeled `OPEN`. Migration `0012` adds and backfills `PARTIALLY_PAID`; payment and collection queries now treat both open and partial invoices as collectible. A settlement-status unit test covers open, partial, paid, and invalid values.

### Integration-First Phase 3 - Incremental frontend foundation - 2026-09-28

Status: In progress.

- Added the shared TanStack Query client and centralized query keys.
- Migrated dashboard loading/refetch and subscriber list fetching to TanStack Query.
- Added shared loading, error/retry, and empty-state components.
- Added TanStack Table to the subscriber list with server-page navigation.
- Migrated new-subscriber validation/submission to React Hook Form and Zod with inline errors.
- Added a reusable accessible confirmation dialog and applied it to billing finalization.

Remaining Phase 3 work:

- Migrate the remaining modules incrementally without changing authoritative domain rules.
- Add reusable confirmations to payment reversal, service control, batch reconciliation, permission changes, and restore.
- Complete Electron/browser interaction evidence for the migrated screens.

### Integration-First Phase 7 - Backup verification checkpoint - 2026-09-28

Status: Partial; backup creation and integrity verification passed, isolated restore remains open.

- Confirmed PostgreSQL 18.4 `pg_dump` and `pg_restore` through the authenticated preflight endpoint.
- Created a real custom-format backup of the synthetic integration database.
- Fixed backup verification to compare JSON snapshots structurally instead of depending on JSON object key order after PostgreSQL `jsonb` storage.
- Verified the backup SHA-256, manifest financial snapshot, file size, and `pg_restore --list` catalog. Backup `c1561e72-dabe-4f65-88d0-abbaf626905d` is `VERIFIED` and 153,333 bytes.
- Did not run the destructive in-place restore. Phase 7 remains open until the archive is restored into an isolated test target and financial counts/totals are compared.
- Repaired Windows packaging so electron-builder can invoke the Corepack-managed pnpm executable without a machine-global pnpm shim.
- Built `BCIS Subscription Billing and Collection System Setup 0.1.0.exe` (124,178,560 bytes; SHA-256 `06AC0BC5158851944F2BD92EC5C7E143783D71CC8EE7C49329863DD19BE21342`). Clean-account install/uninstall is still required before installer acceptance.
- Launched the unpacked production executable with the API intentionally stopped; the Electron root and three child processes remained alive during the smoke interval. UI assertions and installed-app login still require Playwright/manual evidence.

Final verification for this checkpoint:

- `tests/Run-StaticAcceptance.ps1` passed: all workspace typechecks, 47 API tests at the full-gate checkpoint, 2 Electron tests, 4 shared tests, production builds, source-integrity checks, and Drizzle schema consistency.
- A focused post-fix API run passed 48 tests after adding regression coverage for order-independent backup financial snapshots.
- `deployment/windows/Test-BcisPrerequisites.ps1` passed and selected PostgreSQL 18.4 tools automatically; port 4100 was free after the API was stopped.
- `git diff --check` passed. Pre-existing and newly created uncommitted files were left in place for review; no reset, checkout, or commit was performed.

### Desktop shell - Standard left navigation - 2026-09-28

Status: Implemented and statically verified.

- Replaced the dashboard's right-side navigation card with a persistent left application sidebar.
- Kept the permission-derived visibility checks and all existing module components/API contracts unchanged.
- Anchored the signed-in account, role, lock, and sign-out actions at the lower-left of the sidebar.
- Added active-page state, scrollable navigation, responsive content spacing, and an accessible compact-window drawer with labelled controls, initial focus, Escape dismissal, backdrop dismissal, and background-scroll locking.
- Reduced the supported window minimum to 640 x 600 and removed the renderer's fixed 1024-pixel minimum so the drawer layout is reachable.
- Allowed Vite's inline React-refresh bootstrap only in development, resolving the blank dev window while retaining the strict production `script-src 'self'` policy.
- Desktop typecheck, 3 Electron tests, and the production build passed.

### Desktop shell - shadcn reference refinement - 2026-09-28

Status: Implemented and locally verified at code/build/runtime level.

- Refined the shell from the supplied reference without copying its student-system content or green branding.
- Added desktop expanded and icon-only sidebar modes with consistent Lucide icons, Radix tooltips, active states, and locally persisted collapse preference.
- Added a persistent top bar with contextual `Home / Current module` breadcrumbs, active-role badge, and a Radix light/dark/system theme menu.
- Added a complete dark token set while retaining the existing BCIS blue identity and shadcn/Tailwind token model.
- Applied and persisted the theme at the application root so login, lock, forced-password-change, and authenticated screens remain consistent.
- Kept the mobile navigation as a labelled modal drawer with focus placement, Escape/backdrop dismissal, and background-scroll locking.
- Preserved every permission expression and existing module/API invocation; no domain, route, authorization, or financial behavior changed.
- Desktop typecheck, 3 Electron tests, production build, and `git diff --check` passed. A fresh development API/Electron launch produced one live renderer without CSP/runtime errors; a direct window capture confirmed the dark themed login screen rendered correctly.
