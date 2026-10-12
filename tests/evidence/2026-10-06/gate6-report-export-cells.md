# Gate 6 report export cell check — 2026-10-06

Target: validated local `127.0.0.1:5433/bcis_test` with 19 migrations and synthetic data. The API test received a URL derived from the ignored `.env` only after checking the source host, port, path and application role. No credential or customer data was recorded. Normal `bcis` was not modified.

Changed: `source/apps/api/test/gate6-report-catalog-postgres.test.ts` now checks each XLSX data cell and summary cell in all 15 report families against its server report preview. Money is compared in integer centavos after workbook parsing; text, integer and date cells are also checked. `source/apps/api/src/infrastructure/reports/report-renderers.ts` now writes an empty cell for a genuinely blank date, instead of an invalid Date object.

Results:

- First focused guarded run failed at `collector-assignments row 1 effectiveTo source=`. This exposed the blank-date XLSX defect; it was not hidden or treated as acceptance.
- Focused guarded rerun: 1 test passed.
- Full guarded API suite: 18 files passed; 72 tests passed, 1 opt-in isolated-restore case skipped.
- `tests/Run-StaticAcceptance.ps1`: passed; API 54 passed/19 guarded skipped, desktop 8 passed, shared 4 passed, typechecks, builds, source integrity and Drizzle check passed.

Boundary: This tests in-memory PDF signatures and parsed XLSX values against server previews, not saved/opened files from the packaged desktop, physical print output, independent database reconciliation for every report family, clean installation, or three-PC LAN operation. Gate 6 remains Partial.
