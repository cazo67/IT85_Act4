# BCIS Technical Overview

Updated: 2026-09-28. The application remains partially accepted; see the [current checklist](../BCIS_Development_Status_Checklist.md).

## Responsibility boundaries

BCIS targets three Electron clients and one central Fastify API/PostgreSQL server. The renderer calls HTTP through its typed API client; it uses the narrow preload/main bridge for approved OS operations such as saving reports. PostgreSQL, backups and future proof storage belong to the server.

```text
Electron React renderer → typed HTTP client → Fastify routes
                                              ↓
                                      authorized domain services
                                              ↓
                                        Drizzle / PostgreSQL
Electron React renderer → narrow preload IPC → Electron main / native save
```

- Renderer: forms, operational tables, previews, themes and permission-aware navigation.
- Main/preload: validated save requests, CSP, navigation/permission restrictions and OS boundary.
- Routes: session/permission enforcement, Zod input checks and response mapping.
- Services: billing, allocation, reversal, reconciliation, aging, service control, reports, audit and recovery.
- PostgreSQL: transactions, indexes, foreign keys, uniqueness and durable financial history.

## Financial and security design

Authoritative amounts use PostgreSQL/TypeScript bigint centavos and base-10 integer strings over HTTP. Financial transactions link invoices, allocations, receipts, ledger and audit; corrections preserve history through compensation. Session tokens remain opaque and in memory. The renderer receives no database credentials.

Electron uses context isolation, sandboxing and disabled Node integration. API permissions are authoritative. Current code findings involving CORS, cross-user query caching, retry keys and service-control approval are documented in the [defect log](defect-log.md); design intent is not proof that all boundaries are accepted.

Restore revalidates a server-controlled archive and uses pg_restore --single-transaction. Session revocation/audit recording follows in a separate application transaction. An isolated restoration has not passed, and concurrent backup snapshot consistency needs verification. Proof storage/attachment backup is not enabled.

## Preserved foundation and UI decisions

The workspace is under source/. Electron uses electron-vite. The original shadcn preset b2D0xPXaU resolved to radix-luma; because the CLI did not recognize the nested electron-vite renderer, its configuration/token structure was adapted from an isolated Vite reference. BCIS navy/blue/semantic tokens replace sample branding, and Lucide supplies icons.

The renderer now contains a collapsible left sidebar, bottom user/role/lock/logout controls, breadcrumbs, role badge and locally persisted light/dark/system theme and sidebar settings. A shared QueryClient is installed; dashboard/subscriber queries and subscriber TanStack Table are implemented. Login/new-subscriber forms use React Hook Form/Zod. Other modules still need incremental migration and UI verification. The custom mobile drawer needs complete focus trapping/restoration.

## Local environment and evidence

On 2026-09-28 PostgreSQL 18 on port 5433 and API port 4100 were ready. Thirteen migrations (0000–0012) are applied locally. The source supports PostgreSQL 16+ prerequisite discovery. Clean external installation, three-client operation and scale testing remain separate gates.

The read-only audit passed 48 API, 3 Electron configuration and 4 shared tests plus typechecking and schema consistency. It did not launch an installed end-to-end workflow or rebuild production outputs. See the [progress record](../BCIS_PROGRESS_AND_DOCUMENTATION.md) for dates and boundaries.

## Repository and contract map

- source/apps/api: Fastify, services, schema, reports and automated tests.
- source/apps/desktop: Electron main/preload, React renderer, shell and workflow panels.
- source/packages/shared: public money and permission contracts.
- database/migrations: append-only reviewed SQL through 0012.
- database/seeds and database/scripts: synthetic seeds and controlled migration tooling.
- docs, tests, reports-samples and release: guides, evidence, fictional samples and build artifacts.

See the [integration contract map](architecture/integration-contract-map.md), [ERD](erd.md), [financial invariants](architecture/financial-invariants.md) and [deployment guide](deployment/windows-lan.md). The original architecture context is preserved in [the archive](archive/architecture/context.md).
