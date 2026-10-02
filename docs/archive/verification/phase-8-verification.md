# Phase 8 Verification

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

Date: 2026-09-22

## Implemented

- A permission-protected dashboard with server-calculated month-to-date billing, collections, outstanding AR, active/suspended services, open batches, and aging indicators.
- Four concrete report families grounded in the planning source: collections by day/payment method, AR aging, subscriber statement of account, and collector reconciliation.
- One report document model shared by on-screen previews, PDF output, and XLSX output so headings, rows, parameters, and summaries come from the same server query.
- PDF output with report title, parameters, generated timestamp/user, repeating table header, formatted financial values, and page numbering.
- XLSX output with typed dates/numbers, peso number formats, frozen headers, filters, column widths, a parameter/summary sheet, and formula-injection protection for user text.
- Report authorization split between `report.view` and `report.export`, no-store downloads, safe fixed filenames, and an audit record for each completed export.
- Maximum 366-day date ranges for bounded synchronous reports.
- Electron report catalog, parameter forms, previews, printable markup, PDF/XLSX actions, progress state, and permission-aware export controls.
- A narrow Electron IPC save operation with a native save dialog, strict `.pdf`/`.xlsx` filename validation, and a 50 MB payload ceiling.
- Eight sanitized sample files under `reports-samples/`, generated from the production renderers.

## Reconciliation and safety rules

- Dashboard outstanding balance reuses the Phase 7 historical as-of aging result.
- SOA computes `opening + debits - credits = closing` with a running balance for every activity row.
- AR report totals come from the same aging service as the screen and dashboard.
- Collector rows use frozen batch/remittance amounts and retain signed differences.
- Spreadsheet strings beginning with `=`, `+`, `-`, or `@` are escaped before export.
- PDF generation denies URL access and permits only the four built-in Helvetica font identifiers; report data cannot request local files.

## Policy-safe boundaries

- The official laboratory report list, required fields, logo, templates, and branding remain absent. The four implemented families are the prompt-supported minimum, not a claim of final report completeness.
- Reports run synchronously only within bounded parameters. A persistent large-report job/history system is deferred until retention and volume requirements are approved.
- The company timezone remains unresolved. Date-only filters use PostgreSQL's configured session timezone and require live-environment confirmation.
- Receipt printing remains the immutable Phase 5 snapshot path; installed printer and paper-layout checks remain open.

## Database work

No migration was needed. Reports query authoritative transactional tables and do not duplicate financial totals or create mutable reporting tables.

## Automated result

Commands:

```powershell
corepack pnpm --dir source typecheck
corepack pnpm --dir source --filter @bcis/api test
corepack pnpm --dir source --filter @bcis/desktop test
corepack pnpm --dir source --filter @bcis/shared test
corepack pnpm --dir source build
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/bcis'
corepack pnpm --dir source --filter @bcis/api db:check
```

Result:

- Strict type-check passed for API, desktop, shared contracts, and database tooling.
- 44 tests passed: 39 API/domain/export tests, 4 shared contract tests, and 1 Electron security test.
- Export tests open the generated workbook and confirm typed dates, numeric money, frozen headers, metadata, and formula-injection escaping; PDF signature/size smoke checks pass.
- Report tests cover bounded date ranges, safe filenames, centavo summation, and SOA opening/activity/closing reconciliation.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Drizzle migration validation remains clean.

## Unaccepted live gates

- Apply and seed the full schema in PostgreSQL, then compare dashboard, preview, PDF, and XLSX totals against direct source queries.
- Open every generated workbook in the target Microsoft Excel/LibreOffice version and inspect every PDF page at representative and maximum row counts.
- Print receipt, SOA, and report previews from the packaged Electron app on the intended printer/paper sizes.
- Confirm the company timezone and repeat day-boundary tests.
- Obtain the official laboratory PDF and approved report/branding templates; add or amend report families and fields accordingly.
- Decide report retention and expected maximum volume before implementing persistent background jobs/history.

Phase 8 is code-complete for the four prompt-supported bounded reports and neutral BCIS presentation. It is not final/live accepted without PostgreSQL reconciliation, installed printing, and the missing laboratory/templates decisions.
