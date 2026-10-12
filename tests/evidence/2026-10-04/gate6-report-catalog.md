# Gate 6 guarded report-catalog check — 2026-10-04

Environment: PostgreSQL 18 at `127.0.0.1:5433/bcis_test`, owned by `bcis_app`, with 19 migration records and synthetic data. Normal `bcis` was not used. The check reads report data and renders files in memory; it does not write report files or exercise an installed desktop.

`source/apps/api/test/gate6-report-catalog-postgres.test.ts` enumerates the 15 server report definitions and, for each family, runs a guarded PostgreSQL preview, renders a nonempty PDF, renders an XLSX, reloads that workbook, and checks its code, columns and row count against the preview. It includes collection periods, billing/revenue, subscriber master/SOA/ledger, AR aging, collector assignments/performance/reconciliation, reversals and audit activity. The focused run passed 1/1. Existing `gate1-postgres.test.ts` and Gate 2–4 tests independently compare selected financial report rows/totals with SQL; this new catalog test does **not** independently reconcile every one of the 15 families.

After adding the test, the complete guarded API suite passed 18 files, 72 tests, with one unrelated opt-in restore test skipped. `tests/Run-StaticAcceptance.ps1` passed: API 54 passed/19 guarded skipped, desktop 8, shared 4, typechecks, builds, source integrity and Drizzle consistency.

Still open: save/open representative PDF/XLSX files through the installed client, visually inspect layout, test physical print/receipt output, and reconcile every required report family against independent database totals where applicable. The NSIS candidate and three-PC LAN operation remain unaccepted.
