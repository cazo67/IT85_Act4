# BCIS User Manual

## Sign in and session safety

1. Open BCIS and enter the username and temporary password issued by the owner.
2. Change a temporary password when prompted. Use at least 12 characters.
3. Use the lock button before leaving the workstation and sign out when finished.
4. A missing menu means the account lacks that permission; changing the URL/API request does not bypass server authorization.

## Main workflows

- **Subscribers:** Search or create a subscriber, record contact/address information, then add a service account using an active plan.
- **Billing:** Preview a month before finalizing it. Finalization is retry-safe and creates invoices plus ledger debits.
- **Payments:** Select a subscriber, preview allocation, and post cash. Payments allocate to the oldest invoices first. Print the immutable receipt after posting.
- **Reversal:** Open Payment History, choose a posted payment, and provide a meaningful reason. The original remains visible; BCIS posts compensating history.
- **Collection batches:** Create a collector/route/date snapshot, start it, record cash collections, submit it, record remittance, reconcile only a zero difference, then close.
- **Receivables:** Select an as-of date to inspect outstanding, overdue, and aging totals. Candidate thresholds are review filters only.
- **Service control:** Request suspension/reconnection, have a different user approve, then have someone other than the approver complete the work.
- **Reports:** Preview a report first, then print or save PDF/XLSX when permitted.
- **Audit:** Authorized owners/auditors can filter read-only business history by action, entity, and date.
- **Backup:** Create, verify, and copy the whole backup-set directory to approved offline storage. Restore only during an approved drill/outage using the displayed confirmation phrase.

## Deliberately unavailable actions

GCash posting, advance credit, invoice void/adjustment, shortage/overage settlement, automatic cutoff, mandatory reconnection-payment rules, and reconnection fees remain disabled because their detailed business policies are not approved. Bank Transfer, Cheque and Other are required by the laboratory activity but are not implemented. Do not work around these controls outside BCIS.

## Common problems

- **Server unavailable in the packaged client:** Packaged-origin CORS is an open defect; do not treat a healthy database as proof of desktop connectivity.
- **Uncertain payment result after a connection failure:** Current desktop retries generate new command keys. Check payment history and ask the supervisor to reconcile the result before submitting again; retry safety is an open defect.
- **Database unavailable:** Check the server PC, PostgreSQL service, LAN connection, and API environment. Do not repeatedly post a financial command with new command keys.
- **Conflict/reload message:** Another user changed the record. Reload and review before retrying.
- **Backup tools unavailable:** Configure supported PostgreSQL 16+ tools; this local environment uses PostgreSQL 18 `pg_dump` and `pg_restore`.
- **Export blocked:** The account may have view permission without export permission.
- **After restore:** Every session is revoked by design; sign in again.

Never place real passwords, customer exports, backup archives, or payment evidence in the submission repository.
