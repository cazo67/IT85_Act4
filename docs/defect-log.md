# Defect Log

| ID | Severity | Finding | Resolution/status |
|---|---|---|---|
| D-001 | High | Past-date AR originally used current invoice paid totals. | Fixed in Phase 7 by reconstructing allocations/reversals at the as-of cutoff; live PostgreSQL proof pending. |
| D-002 | Medium | PDF/XLSX tests caused parallel authentication-test timeouts. | API tests use one worker; 48 API tests passed in the 2026-09-28 audit; earlier 42-test result was historical. |
| D-003 | High | Report downloads lacked a controlled Electron save operation. | Fixed with narrow validated IPC and native save dialog. |
| D-004 | High | Static CSP allowed only localhost, blocking an approved LAN server. | Replaced with runtime CSP restricted to `BCIS_API_ORIGIN`; validated by Electron tests. |
| D-005 | High | Restore could have used a file changed after verification. | Restore now re-runs checksum, manifest, financial snapshot, and `pg_restore --list` validation. |
| D-006 | Medium | Audit records existed without an authorized read-only screen. | Added paginated/filterable `audit.view` API and desktop history screen in Phase 10. |
| D-007 | External | NSIS packaging needs an unavailable external cache/download. | Packaging blocker resolved locally: NSIS artifact and checksum exist. Clean installation remains unaccepted. |
| D-008 | External | Original infrastructure blocker. | PostgreSQL 18/5433 is now ready with 14 migrations and local Cash evidence; isolated recovery and three-PC hardware evidence remain open. |
| D-009 | Medium | Dependency audit reports transitive `esbuild@0.18.20` through the Drizzle migration tool and `uuid@8.3.2` through ExcelJS. | Historical dependency-audit result; not refreshed by this audit: no high/critical advisories. The esbuild issue concerns its development server, which BCIS does not use in production; ExcelJS calls UUID v4 while the advisory affects v3/v5/v6 buffer writes. Keep production services isolated from dev tooling and retest after upstream-compatible upgrades; do not force untested major overrides before submission. |

| D-010 | High | Packaged file-origin API connectivity fails. | Open; ordinary health GET returned 200, Origin: null returned 500 on 2026-09-28. build-app.ts allowlist rejects the origin; main/index.ts loads packaged HTML from file. Retest configured packaged login/health and disallowed origins after a scoped fix. |
| D-011 | High | Payment/batch retry generates a new commandKey on each submission. | Open, source finding in PaymentPanel.tsx:33 and CollectionBatchesPanel.tsx:40. Preserve keys across lost responses; prove retry returns the original result without duplicate financial rows. |
| D-012 | High | Shared query cache survives sign-out and keys omit user/session scope. | Open, source finding in App.tsx signOut and lib/query-client.ts/query-keys.ts. Reproduce account switching, clear/cancel or safely partition cache, and test permission/session changes. |
| D-013 | High | Generic service.manage update permits suspension/reactivation without the independent service-control approval path. | Open, source finding in subscriber-routes.ts/service.ts updateServiceAccount. Route financial/operational state changes through the required authority and test direct API bypass attempts. |
| D-014 | High | Backup manifest financial totals were collected before pg_dump without a shared snapshot. | Fixed and verified locally: one exported repeatable-read snapshot feeds manifest aggregates and pg_dump; a guarded synthetic Cash write increased the live payment count while the manifest and inspected archive excluded that later payment. AT-12 isolated restore also passed with matching financial totals and report output; see `tests/evidence/2026-10-04/gate5-at12-isolated-restore.md`. |
| D-015 | Medium | Custom mobile drawer sets focus/Escape but lacks complete focus trapping/restoration. | Open, source finding in App.tsx MobileNavigation. Verify keyboard containment, return focus, expanded/collapsed themes and no horizontal overflow. |

## Evidence boundaries

D-010 has a live read-only HTTP reproduction. D-011–D-015 are source findings requiring targeted runtime regression tests. This documentation consolidation fixes none of these application defects.

Paths are rooted at source/apps/api/src/modules/ or source/apps/desktop/src/renderer/src/ as applicable; see the [completion plan](../BCIS_COMPLETION_PLAN.md) for execution order. Source/API CORS is at source/apps/api/src/app/build-app.ts, and packaged loading at source/apps/desktop/src/main/index.ts.

New defects should include reproduction, expected/actual result, severity, root cause, changed files, regression test, and live retest status.
