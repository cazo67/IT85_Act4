# Database Artifacts

Drizzle schema code belongs in `source/apps/api/src/db/schema`. Reviewed SQL migrations are in `database/migrations`; deterministic synthetic seeds are in `database/seeds`. Preserve applied migration history and append new changes.

Migrations `0000` through `0014` cover security, master data, billing/ledger, payments, receipts/reversals, collector batches, reporting/recovery support, explicit partially-paid invoice status, durable route-sheet snapshots, and the REMITTED batch state. Migration `0013` leaves older batch-sheet fields null; they must be shown as legacy/incomplete, not backfilled from mutable data. Migration `0014` adds an enum value without rewriting historical batch rows. The master-data seed creates service types, plans, collection setup, 50 synthetic subscribers, 60 synthetic service accounts, and effective route assignments.

Run the repeatable local database preparation commands from the repository root:

```powershell
corepack pnpm --dir source db:migrate
corepack pnpm --dir source db:seed-security
corepack pnpm --dir source db:seed-master-data
```

The scripts load the ignored `source/apps/api/.env` by default. Set `BCIS_ENV_FILE` to an explicit reviewed environment-file path when preparing another environment. Never commit that file or print its secrets in evidence.

The local PostgreSQL 18 database was migrated and seeded successfully on 2026-09-28. This is single-workstation integration evidence only; clean external setup, concurrency, recovery, and three-PC acceptance remain separate gates.
