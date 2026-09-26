# Financial Invariants

These rules govern the implemented financial modules. Automated tests cover their code-level behavior; live PostgreSQL reconciliation remains an acceptance gate.

- Store authoritative money as PostgreSQL `bigint` centavos and TypeScript `bigint`.
- Serialize centavos at API boundaries as base-10 integer strings.
- Never use JavaScript floating-point arithmetic for authoritative totals.
- Finalized invoices, posted payments, allocations, receipts, ledger entries, remittances, and reversals are historical records, not destructive CRUD rows.
- Multi-row financial operations commit in one PostgreSQL transaction or leave no partial state.
- Database constraints and idempotency protect duplicate billing and numbering; UI disabling is never the final control.
- Payment value must be allocated to invoices or retained as explicit credit. No centavo may disappear.
- Reversals use linked compensating entries and preserve the original actor, reason, and receipt history.
- Subscriber balance and Statements of Account must reproduce from immutable ledger entries in deterministic order.
