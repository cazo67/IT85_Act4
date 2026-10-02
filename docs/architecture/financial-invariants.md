# Financial Invariants

These rules govern the implemented financial modules. Automated tests cover selected code-level behavior, and the current local Cash snapshot reconciles. Full rollback/concurrency/historical/recovery and desktop acceptance remains open; these statements describe required invariants, not blanket verification.

- Store authoritative money as PostgreSQL `bigint` centavos and TypeScript `bigint`.
- Serialize centavos at API boundaries as base-10 integer strings.
- Never use JavaScript floating-point arithmetic for authoritative totals.
- Finalized invoices, posted payments, allocations, receipts, ledger entries, remittances, and reversals are historical records, not destructive CRUD rows.
- Multi-row financial operations commit in one PostgreSQL transaction or leave no partial state.
- Database constraints and idempotency protect duplicate billing and numbering; UI disabling is never the final control.
- Payment value must be allocated to invoices or retained as explicit credit. No centavo may disappear.
- Reversals use linked compensating entries and preserve the original actor, reason, and receipt history.
- Subscriber balance and Statements of Account must reproduce from immutable ledger entries in deterministic order.

## Collection report cutoffs

- The new daily detail accepts exactly one calendar date. The weekly report accepts an inclusive date range of at most 366 days and groups each payment under its ISO Monday week start; a partial first or last week includes only payments inside the requested range.
- The annual report accepts one complete January 1–December 31 calendar year and groups its currently posted payments by month and method. The desktop requests the year as one field; this does not establish a custom fiscal-year policy.
- Both reports show payments whose **current** status is `POSTED`, matching the existing monthly collection report. A later reversal removes that payment from a previously run date range; these are current-state management reports, not immutable historical-as-of statements. Reversal audit and voided receipt history remain available separately. Neither report changes postings, allocation, or ledger balances.
- Date membership uses PostgreSQL's session-local `paid_at::date` conversion, as the existing monthly report does. A formal Asia/Manila cutoff/timezone rule and historical-versus-current reversal reporting policy are still unresolved; do not describe these reports as final historical accounting statements until those rules are approved and tested.
- Billing-versus-collection uses one PostgreSQL statement snapshot. For each month touched by an inclusive date range (at most 366 days), **billed** is the sum of invoices whose `invoice_date` is in range and whose current status is not `VOID`; **collected** is the sum of payments whose session-local `paid_at::date` is in range and whose current status is `POSTED`. `Period difference = billed − collected` may be negative. Payments can settle older invoices, so this is a period activity comparison, **not** receivables, an invoice-cohort recovery rate, or the ledger balance. Later voids/reversals change a rerun of this current-state report; written historical-reporting and timezone policies remain open.

## Subscriber master-list report

- This is a **current-state** identity/operations export, not a historical subscriber snapshot or a billing calculation. It has exactly one row per subscriber, including `INACTIVE`, `TERMINATED`, and `ARCHIVED` records unless filtered. Linked services are summarized as counts (all and currently `ACTIVE`) and distinct service-type names; multiple services must not duplicate a subscriber row.
- The displayed contact and address are the active primary record when available, otherwise the most recently updated active record. The area and assigned collector are the subscriber-level assignments; per-service collector overrides are not represented as a single subscriber assignment. Search is limited to account number or name. Preview requires both `report.view` and `subscriber.view`; export additionally requires `report.export`.

## Subscriber ledger-detail report

- The ledger-detail report is a bounded, inclusive posting-date view (at most 366 days) of immutable ledger rows for one subscriber. It shows UTC posting timestamp, global ledger sequence, entry type/reference, debit, credit and running balance. Rows are ordered by posting timestamp then entry ID, matching the paged ledger view; the sequence is shown as an audit identifier, not used to reorder backdated entries.
- Opening balance is all debits minus credits before the selected start date; closing balance is opening plus in-range debits minus credits. A `PAYMENT_REVERSAL_DEBIT` remains visible alongside the original payment credit. Opening and entries are read in one repeatable-read snapshot so a concurrent payment cannot split the report calculation. The date cutoff currently follows PostgreSQL's session-local `occurred_at::date`; a formal historical/as-of or Asia/Manila cutoff policy is not claimed.
- Preview requires `report.view`, `subscriber.view` and `receivable.view`; export also requires `report.export`. The existing Statement of Account stays a separate, simpler date-only presentation.

## Collector-assignment as-of report

- The selected `asOf` date applies only to effective-dated collector assignments: `effective_from <= asOf` and `effective_to > asOf` (or no end date). The end date is exclusive. Each selected assignment produces one service-account row; distinct-subscriber and collector counts are separate summaries, so multiple services do not inflate the subscriber count.
- Subscriber/service status and collector/route/area names are **current** database values. This is not a historical snapshot of those mutable fields, nor a batch route sheet or cash-performance report. Inactive subscribers/services remain visible when they have an effective assignment. An absent route is shown blank.
- Preview requires `report.view`, `subscriber.view` and `service.view`; export also requires `report.export`. No assignment writes or financial amounts are changed by the report.

## Collector-performance report

- Include batches whose `collection_date` is in the inclusive selected range (at most 366 days), group by collector ID and show the current collector name. This is a **current-state batch report**: later collections and remittances can change a rerun for the same dates. It is not a historical as-of report, productivity target, or settlement decision.
- Batch/account counts and expected, collected and remitted Cash are recorded values. Collected-account count includes batch accounts currently marked `COLLECTED`. A confirmed difference contributes only when a remittance record exists; its signed value is remitted minus collected. Count unremitted batches, remitted batches with nonzero unresolved differences, and batch-header/account-total mismatches separately. A zero signed sum can hide opposing shortage/overage, so the unresolved count must stay visible.
- A remitted batch with a nonzero difference remains unresolved; this report does not approve, settle, or close it. GCash/non-cash and policy-dependent shortage/overage treatment are not inferred. Preview requires `report.view`; export additionally requires `report.export`.

## Collection route-sheet snapshot rule

- A route sheet records the state at batch creation for the batch's `collectionDate`; it is not a live receivables report. Only finalized, non-void invoices dated on or before that date and due in that month or earlier are included. Payments posted by the end of that date reduce their invoice balance; later reversals do not rewrite the saved sheet.
- The unpaid portion of invoices **due in the collection month** is the **current bill**. The unpaid portion of invoices due in earlier months is **arrears**. Their sum is **total due**, in integer centavos, and equals the batch account's frozen expected amount. Invoices due in future months are excluded. BCIS invoices are issued at billing-month end and normally due the following month, so billing-cycle month alone would misclassify the current bill.
- The service installation address, account identity, and monetary split are copied into the batch-account row in the same transaction as batch creation. Subsequent address edits, payments, or plan changes do not alter that print snapshot. Older batches without these new fields remain explicitly labelled legacy/incomplete; do not synthesize their missing history from mutable current values.
- A collection batch starts in stored `DRAFT` (presented as Open) and moves to stored `ACTIVE` (presented as In progress), then `SUBMITTED`, `REMITTED`, `RECONCILED`, and `CLOSED`. Recording a remittance and changing to `REMITTED` must commit together; the remittance amount and signed difference remain immutable. A legacy `SUBMITTED` batch with an existing remittance may reconcile without rewriting its historical state. Only a zero-difference remittance may reconcile and subsequently close until a written shortage/overage policy exists. Closure requires server authorization and an explicit desktop confirmation.
- Collector assignment dates are half-open: `effectiveFrom` is included and `effectiveTo` is excluded. A new assignment must start after the currently open assignment starts; replacing one closes it at the new start date in the same transaction. A route sheet includes an assignment only when `effectiveFrom <= collectionDate < effectiveTo` (or the end is null). The selected collector and route must be active when assigned; no future or ended assignment may leak into a batch for another date. Existing route-sheet snapshots never change when later assignments are edited.
- The collector reconciliation report reads one PostgreSQL statement snapshot: batch header centavos, frozen batch-account counts/totals, and the recorded remittance. `uncollected = account expected - account collected`; a totals-mismatch flag must be visible if the account sums disagree with the header. `difference = remitted - collected` is provisional before remittance; only remitted batches contribute to the report's confirmed-difference summary. A negative confirmed difference is a shortage, a positive one an overage, and neither can be settled or closed without written policy. Non-cash remains visible as its stored amount (currently zero while GCash posting is gated).
