# Release Notes — Laboratory Candidate

Version: 0.1.0 candidate. Evidence refreshed 2026-09-28; not a final accepted release.

Implemented foundations include Electron/Fastify/PostgreSQL, auth/RBAC, subscriber/services, transactional Cash billing/payment/reversal, collections, AR/service control, four PDF/XLSX report families, audit and backup orchestration. Migrations 0000–0014 are applied to the local development and guarded test databases; 0013 adds immutable route-sheet address/current-bill/arrears snapshots for new batches while older batches remain visibly incomplete, and 0014 adds the REMITTED batch state without rewriting historic rows. Sidebar, breadcrumbs and light/dark/system themes exist; full UI acceptance remains open.

Latest read-only audit: 48 API + 3 Electron configuration + 4 shared tests passed, along with workspace typechecks, Drizzle consistency and source-integrity checks. The full build-producing static gate was not rerun; prior build results are historical. No fresh dependency-security audit was performed; D-009 retains its earlier findings.

Existing installer:
- release/BCIS Subscription Billing and Collection System Setup 0.1.0.exe
- Recorded size: 124,178,560 bytes.
- SHA-256 rechecked during audit: 06AC0BC5158851944F2BD92EC5C7E143783D71CC8EE7C49329863DD19BE21342.
- Clean install/uninstall is unaccepted. Do not assume it contains later UI/source changes without a new build and source manifest.

GCash, advance credit, invoice void/adjustment and shortage settlement remain policy-gated. Bank Transfer, Cheque and Other are required but missing. Automatic cutoff, reconnection qualification/fees and detailed policies remain unresolved.

Release blockers include packaged CORS, stable payment retries, session cache isolation, service-control authorization, isolated restore, complete demo/report coverage, Electron E2E, installed printing and three-PC evidence. See [defects](defect-log.md), [checklist](../BCIS_Development_Status_Checklist.md) and [acceptance](../tests/acceptance/AT-01-AT-12.md).

The final-artifact check currently fails at missing screenshots; generated manuals and completed acceptance report are also absent. Do not claim final release acceptance until applicable gates have retained evidence.
