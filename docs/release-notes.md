# Release Notes — Laboratory Candidate

Version: `0.1.0` code candidate, 2026-09-22

Included: secure Electron/Fastify foundation; authentication/RBAC; subscriber/service master data; billing; policy-safe cash payments and reversals; balanced collection batches; historical AR aging; controlled service actions; dashboard; four report families with PDF/XLSX; audit viewer; backup/restore safety controls; synthetic seeds; migrations `0000`–`0011`; manuals and deployment guidance.

Deliberately disabled pending approved rules: advance credit, GCash, invoice void/adjustment, shortage/overage approval, automatic cutoff, mandatory qualifying-payment logic, and reconnection fees.

Local verification: 48 automated tests, workspace typecheck, API/Electron production builds, and Drizzle schema consistency pass. The dependency audit has no high or critical findings and two reviewed moderate transitive advisories recorded as D-009 in `defect-log.md`.

This is not a production or final laboratory release. No installer, live PostgreSQL reconciliation, restore drill, installed printing, TLS/firewall evidence, or three-PC acceptance is included. Do not tag `v1.0.0-lab-submission` until every required acceptance gate is signed.
