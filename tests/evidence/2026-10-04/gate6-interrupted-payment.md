# Gate 6 lost-response payment retry — 2026-10-04

Environment: local unpackaged Electron development renderer on 5173/CDP 9236, isolated Fastify API on 4110, guarded PostgreSQL 18 `bcis_test` on 5433. No normal `bcis` data was used. This is an automated local preflight, not an installed or three-PC network test.

The guarded `source/apps/api/test/gate5-playwright-smoke.ts` workflow created a synthetic subscriber/service/invoice through the UI and began a partial Cash payment for 137 centavos. Playwright forwarded the first payment POST to the real API and observed HTTP 200, then deliberately aborted only the response to the renderer. The UI displayed its lost-response retry guidance. The test queried PostgreSQL and found exactly one posted payment and one receipt. Retrying from the same UI reused the first `commandKey`, returned the original receipt, and left one payment, one receipt, one active allocation and one `payment.post` audit row. Invoice paid centavos remained 137; outstanding invoice and ledger net reconciled. The same run passed report reconciliation, renderer-reload persistence and sign-out.

Focused command: `corepack pnpm --dir source --filter @bcis/api exec tsx test/gate5-playwright-smoke.ts` with guarded `BCIS_TEST_DATABASE_URL`, isolated API and Electron dev renderer. Exit code 0; result contained `lostPaymentResponseRetriedOnce: true`. The required `tests/Run-StaticAcceptance.ps1` passed after this test change (typechecks, API/desktop/shared tests, builds, schema and source integrity). Isolated processes were stopped afterward.

Remaining proof: interruption and retry from a real installed client over the approved three-PC LAN, including simultaneous-user numbering/balance checks. No installed-client or LAN acceptance is claimed here.
