# BCIS ERD and Data Dictionary

```mermaid
erDiagram
  USERS ||--o{ AUTH_SESSIONS : owns
  USERS }o--o{ ROLES : assigned
  ROLES }o--o{ PERMISSIONS : grants
  USERS ||--o{ AUDIT_LOGS : acts
  SUBSCRIBERS ||--o{ SUBSCRIBER_ADDRESSES : has
  SUBSCRIBERS ||--o{ SERVICE_ACCOUNTS : owns
  SERVICE_PLANS ||--o{ SERVICE_ACCOUNTS : prices
  SERVICE_ACCOUNTS ||--o{ SERVICE_EVENTS : records
  SERVICE_ACCOUNTS ||--o{ INVOICES : billed
  BILLING_CYCLES ||--o{ INVOICES : contains
  INVOICES ||--o{ INVOICE_ITEMS : details
  SUBSCRIBERS ||--o{ PAYMENTS : pays
  PAYMENTS ||--o{ PAYMENT_ALLOCATIONS : allocates
  INVOICES ||--o{ PAYMENT_ALLOCATIONS : receives
  SUBSCRIBERS ||--o{ LEDGER_ENTRIES : posts
  COLLECTORS ||--o{ COLLECTION_BATCHES : operates
  COLLECTION_BATCHES ||--o{ COLLECTION_BATCH_ACCOUNTS : snapshots
  COLLECTION_BATCHES ||--o| COLLECTOR_REMITTANCES : remits
  COLLECTION_BATCHES ||--o| BATCH_RECONCILIATIONS : reconciles
  SERVICE_ACCOUNTS ||--o{ SUSPENSION_RECORDS : controls
  SUSPENSION_RECORDS ||--o{ RECONNECTION_RECORDS : resolves
  USERS ||--o{ BACKUP_RUNS : operates
```

## Table groups

| Group | Main tables | Purpose |
|---|---|---|
| Security | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `auth_sessions`, `login_attempts`, `audit_logs` | Authentication, RBAC, and immutable actor history. |
| Subscriber/service | `subscribers`, addresses/contacts, `service_types`, `service_plans`, `service_accounts`, `service_events` | Customer identity and subscription lifecycle. |
| Billing | `billing_cycles`, `invoices`, `invoice_items`, `billing_idempotency` | Monthly charge generation and immutable invoice snapshots. |
| Payment/ledger | `payments`, `payment_allocations`, `receipts`, `payment_reversals`, `ledger_entries` | Cash posting, allocation, receipt, compensation, and SOA source. |
| Collections | areas/routes/collectors/assignments, batch/account/entry/remittance/reconciliation tables | Route snapshots and cash accountability. |
| Service control | `suspension_records`, `reconnection_records` | Request, independent approval, completion, and financial linkage. |
| Recovery | `backup_runs` | Backup status, checksum, financial snapshot, and restore actor/time. |

All authoritative money columns use centavos. Foreign keys use `restrict` for historical records; partial unique indexes prevent duplicate active assignments or service-control requests.
