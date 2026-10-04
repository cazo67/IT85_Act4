# Gate 5 Electron smoke and Cash workflow — 2026-10-04

Environment: local unpackaged Electron development client at `localhost:5173` with CDP on 9236; isolated Fastify API on `127.0.0.1:4110`; guarded, migrated PostgreSQL 18 `bcis_test` on `127.0.0.1:5433`. The client used the API only. Normal `bcis` was not used for test writes.

Command: `corepack pnpm --dir source --filter @bcis/api exec tsx test/gate5-playwright-smoke.ts`, with `BCIS_TEST_DATABASE_URL` derived from the ignored local app configuration as documented in `tests/README.md`.

Result: exit code 0. Playwright reported `playwrightElectronSmoke`, `ownerLogin`, `dashboard`, `navigation`, `apiUnavailableAndRecovery`, `cashUiWorkflow`, `invoicePaymentLedgerReconciled`, `reportReconciled`, `rendererRestartPersistence` and `signOut` as true, with one payment audit row. The script created synthetic records, revoked its actor sessions and deactivated its actor. Screenshots and traces are generated only on failure, so none were retained for this successful run. The isolated API and Electron processes were stopped; ports 4110, 5173 and 9236 had no listeners afterward.

Boundary: this proves the Electron development renderer and guarded local API/database workflow, not an installed NSIS build, physical printing, or three-PC LAN operation.
