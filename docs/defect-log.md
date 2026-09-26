# Defect Log

| ID | Severity | Finding | Resolution/status |
|---|---|---|---|
| D-001 | High | Past-date AR originally used current invoice paid totals. | Fixed in Phase 7 by reconstructing allocations/reversals at the as-of cutoff; live PostgreSQL proof pending. |
| D-002 | Medium | PDF/XLSX tests caused parallel authentication-test timeouts. | API tests use one worker; all 42 API tests pass reliably. |
| D-003 | High | Report downloads lacked a controlled Electron save operation. | Fixed with narrow validated IPC and native save dialog. |
| D-004 | High | Static CSP allowed only localhost, blocking an approved LAN server. | Replaced with runtime CSP restricted to `BCIS_API_ORIGIN`; validated by Electron tests. |
| D-005 | High | Restore could have used a file changed after verification. | Restore now re-runs checksum, manifest, financial snapshot, and `pg_restore --list` validation. |
| D-006 | Medium | Audit records existed without an authorized read-only screen. | Added paginated/filterable `audit.view` API and desktop history screen in Phase 10. |
| D-007 | External | NSIS packaging needs an unavailable external cache/download. | Build configuration/output corrected; installer remains unaccepted. |
| D-008 | External | PostgreSQL and target LAN/hardware are absent. | Static evidence retained; live financial/recovery/concurrency gates remain open. |
| D-009 | Medium | Dependency audit reports transitive `esbuild@0.18.20` through the Drizzle migration tool and `uuid@8.3.2` through ExcelJS. | No high/critical advisories. The esbuild issue concerns its development server, which BCIS does not use in production; ExcelJS calls UUID v4 while the advisory affects v3/v5/v6 buffer writes. Keep production services isolated from dev tooling and retest after upstream-compatible upgrades; do not force untested major overrides before submission. |

New defects should include reproduction, expected/actual result, severity, root cause, changed files, regression test, and live retest status.
