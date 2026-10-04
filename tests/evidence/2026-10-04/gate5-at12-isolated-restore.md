# AT-12 isolated restore evidence — 2026-10-04

Environment: local Windows, PostgreSQL 18 on `127.0.0.1:5433`. Source was guarded `bcis_test`; disposable target was `bcis_restore_test`. The target was created in pgAdmin by the user, and read-only SQL confirmed owner `bcis_app`. No credentials, customer data, or proof images are retained here. Normal `bcis` was not used for destructive testing.

1. `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Invoke-Gate5CleanSetup.ps1` with the exact restore URL and confirmation documented in `tests/README.md`: **passed**. The target started empty; migrations, security seed, synthetic master-data seed and repeat migration passed. Assertions: 19 migration records, at least seven roles and seven plans, 50 subscribers, 60 service accounts, one Owner forced to change the generated initial password. The password was not printed or retained.
2. `corepack pnpm --dir source --filter @bcis/api exec vitest run test/gate5-backup-postgres.test.ts --maxWorkers=1 --isolate=false --testTimeout=120000 --hookTimeout=15000` with guarded `BCIS_TEST_DATABASE_URL`, `BCIS_RESTORE_DATABASE_URL` and `BCIS_RESTORE_CONFIRMATION`: **2 tests passed** in 53.68 seconds. It verified the archive catalog and hash, excluded a Cash payment committed after snapshot export, restored with `--single-transaction` into the dedicated target, and compared financial aggregates and daily-collections report output.
3. Read-only post-restore identity: `bcis_restore_test|bcis_app|bcis_app`; 19 migrations, 176824 invoices, 757 payments, 177779 ledger entries.
4. Full guarded API suite without restore opt-in: 17 files / 71 tests passed, 1 restore test skipped. `tests/Run-StaticAcceptance.ps1`: passed; API 54 passed / 18 guarded skipped, desktop 8, shared 4, typechecks, builds, integrity and Drizzle check.

Verified archive ID: `1dfefe83-3b80-47fe-83cd-b2ee564db6dd`. Custom dump size: 37,664,250 bytes. SHA-256: `018f604d3ee87c81eb1f5d3447e6a51411f03999410f4b38cbeaafb3fdec61c5`. The dump and manifest are in the ignored local `source/apps/api/backups/gate5-test/<archive ID>/` directory; they are not committed.

| Aggregate | Snapshot and restored value |
|---|---:|
| Invoice rows | 176824 |
| Invoice total centavos | 19446178100 |
| Invoice paid centavos | 19353609 |
| Payment rows | 757 |
| Payment total centavos | 36504985 |
| Ledger rows | 177779 |
| Ledger debit centavos | 19463239057 |
| Ledger credit centavos | 38003385 |

Result: AT-12 is **Verified for this isolated local test**. This does not establish production recovery, installer behavior, physical printing, or three-PC LAN acceptance.
