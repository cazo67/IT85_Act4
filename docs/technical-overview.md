# BCIS Technical Overview

BCIS uses one central Fastify API and PostgreSQL database. Three Electron clients call the API over the approved LAN; renderers never receive database credentials or authoritative financial logic.

## Responsibility boundaries

- Electron renderer: forms, tables, previews, and permission-aware navigation.
- Electron preload/main: narrow save/print/OS operations, CSP, navigation and permission security.
- Fastify routes: authentication, permission checks, Zod validation, and response mapping.
- Domain services: billing, allocation, reversal, reconciliation, aging, service control, reports, audit, and backup orchestration.
- PostgreSQL: transactions, constraints, uniqueness, durable history, and concurrency control.

## Important invariants

- Money is `bigint` centavos in PostgreSQL/TypeScript and decimal strings over HTTP.
- Financial commands commit all linked rows or none.
- Finalized financial history is reversed or compensated, never silently deleted.
- Billing is unique per service/cycle; command keys and database constraints protect retries.
- Receivable aging is derived for an explicit as-of date rather than stored as mutable totals.
- Backup restore uses a verified server-controlled archive and one PostgreSQL transaction.

## Repository map

- `source/apps/api`: Fastify server, domain modules, schema, and tests.
- `source/apps/desktop`: Electron main/preload and React renderer.
- `source/packages/shared`: safe shared money and permission contracts.
- `database/migrations`: ordered Drizzle SQL migrations `0000`–`0011`.
- `database/seeds`: security/bootstrap and synthetic master data.
- `docs`: architecture, deployment, manuals, and verification boundaries.
- `reports-samples`: fictional PDF/XLSX examples.
- `tests/acceptance`: acceptance matrix and live evidence procedure.

See `docs/architecture/financial-invariants.md`, `docs/erd.md`, and each phase verification record before explaining or modifying a financial workflow.
