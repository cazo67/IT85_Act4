# Database Artifacts

Drizzle schema code belongs in `source/apps/api/src/db/schema`. Reviewed generated SQL migrations will be written to `database/migrations`, and deterministic synthetic seed scripts will be added to `database/seeds` in their relevant phases.

Migrations `0000` through `0008` cover security, master data, billing/ledger, payments, receipts/reversals, and collector batches through reconciliation. The master-data seed creates service types, plans, collection setup, 50 synthetic subscribers, 60 synthetic service accounts, and effective route assignments. PostgreSQL is not installed or configured on the current development machine, so migration application, seed execution, financial concurrency tests, and live query evidence remain pending.
