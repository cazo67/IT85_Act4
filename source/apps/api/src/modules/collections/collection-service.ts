import { and, asc, desc, eq, gt, lte, ne, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  batchCollectionEntries,
  batchReconciliations,
  collectionBatchAccounts,
  collectionBatches,
  collectionRoutes,
  collectorAssignments,
  collectorRemittances,
  collectors,
  invoices,
  numberSequences,
  payments,
  serviceAccounts,
  subscriberAddresses,
  subscribers
} from "../../db/schema/index.js";
import { PaymentService } from "../payments/payment-service.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { remittanceDifference, validateBatchTransition } from "./collection-rules.js";

export class CollectionService {
  private readonly payments: PaymentService;

  constructor(private readonly db: BcisDatabase) {
    this.payments = new PaymentService(db);
  }

  async createBatch(input: { collectorId: string; routeId: string; collectionDate: string }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [[collector], [route]] = await Promise.all([
        transaction.select().from(collectors).where(and(eq(collectors.id, input.collectorId), eq(collectors.isActive, true))).limit(1),
        transaction.select().from(collectionRoutes).where(and(eq(collectionRoutes.id, input.routeId), eq(collectionRoutes.isActive, true))).limit(1)
      ]);
      if (!collector || !route) throw new AppError(400, "INVALID_COLLECTION_SETUP", "Select an active collector and route.");
      const assigned = await transaction
        .select({ service: serviceAccounts, subscriber: subscribers, address: subscriberAddresses })
        .from(collectorAssignments)
        .innerJoin(serviceAccounts, eq(collectorAssignments.serviceAccountId, serviceAccounts.id))
        .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
        .innerJoin(subscriberAddresses, eq(serviceAccounts.installationAddressId, subscriberAddresses.id))
        .where(and(eq(collectorAssignments.collectorId, input.collectorId), eq(collectorAssignments.routeId, input.routeId), lte(collectorAssignments.effectiveFrom, input.collectionDate), sql`(${collectorAssignments.effectiveTo} is null or ${collectorAssignments.effectiveTo} > ${input.collectionDate})`, eq(serviceAccounts.status, "ACTIVE")))
        .orderBy(asc(serviceAccounts.serviceAccountNumber));

      const snapshots: Array<{ service: typeof serviceAccounts.$inferSelect; subscriber: typeof subscribers.$inferSelect; address: typeof subscriberAddresses.$inferSelect; currentBill: bigint; arrears: bigint; expected: bigint }> = [];
      const collectionMonth = input.collectionDate.slice(0, 7);
      const paidAsOf = sql<bigint>`coalesce((select sum(pa.amount_centavos) from payment_allocations pa inner join payments p on p.id = pa.payment_id where pa.invoice_id = ${invoices.id} and p.paid_at < (${input.collectionDate}::date + interval '1 day') and (pa.reversed_at is null or pa.reversed_at >= (${input.collectionDate}::date + interval '1 day'))), 0)`;
      const remaining = sql<bigint>`${invoices.totalCentavos} - ${paidAsOf}`;
      for (const row of assigned) {
        const open = await transaction.select({ dueDate: invoices.dueDate, remaining }).from(invoices).where(and(eq(invoices.serviceAccountId, row.service.id), ne(invoices.status, "VOID"), lte(invoices.invoiceDate, input.collectionDate), sql`${invoices.dueDate} < (${`${collectionMonth}-01`}::date + interval '1 month')`, gt(remaining, 0n)));
        const currentBill = open.reduce((sum, invoice) => sum + (invoice.dueDate.slice(0, 7) === collectionMonth ? BigInt(invoice.remaining) : 0n), 0n);
        const arrears = open.reduce((sum, invoice) => sum + (invoice.dueDate.slice(0, 7) < collectionMonth ? BigInt(invoice.remaining) : 0n), 0n);
        snapshots.push({ ...row, currentBill, arrears, expected: currentBill + arrears });
      }
      const expected = snapshots.reduce((sum, row) => sum + row.expected, 0n);
      const batchNumber = `BAT-${input.collectionDate.replaceAll("-", "")}-${(await nextSequence(transaction, "COLLECTION_BATCH")).toString().padStart(6, "0")}`;
      const [batch] = await transaction.insert(collectionBatches).values({ batchNumber, collectorId: input.collectorId, routeId: input.routeId, collectionDate: input.collectionDate, expectedCashCentavos: expected, createdBy: actor.userId }).returning();
      if (!batch) throw new Error("The collection batch could not be created.");
      if (snapshots.length > 0) {
        await transaction.insert(collectionBatchAccounts).values(snapshots.map((row) => ({ batchId: batch.id, serviceAccountId: row.service.id, subscriberId: row.subscriber.id, accountNumberSnapshot: row.subscriber.accountNumber, subscriberNameSnapshot: `${row.subscriber.firstName} ${row.subscriber.lastName}`, serviceNumberSnapshot: row.service.serviceAccountNumber, addressSnapshot: [row.address.line1, row.address.line2, row.address.barangay, row.address.cityMunicipality, row.address.province, row.address.postalCode].filter(Boolean).join(", "), currentBillCentavosSnapshot: row.currentBill, arrearsCentavosSnapshot: row.arrears, expectedCentavos: row.expected })));
      }
      await audit(transaction, actor, "collection_batch.create", batch.id, { batchNumber, collectorId: input.collectorId, routeId: input.routeId, accountCount: snapshots.length, expectedCashCentavos: expected.toString() });
      return serializeBatch(batch);
    }, { isolationLevel: "repeatable read" });
  }

  async listBatches() {
    const rows = await this.db.select({ batch: collectionBatches, collectorName: collectors.displayName, routeName: collectionRoutes.name }).from(collectionBatches).innerJoin(collectors, eq(collectionBatches.collectorId, collectors.id)).innerJoin(collectionRoutes, eq(collectionBatches.routeId, collectionRoutes.id)).orderBy(desc(collectionBatches.collectionDate), desc(collectionBatches.batchNumber));
    return rows.map((row) => ({ ...row, batch: serializeBatch(row.batch) }));
  }

  async getBatch(batchId: string) {
    return this.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1);
      if (!batch) throw new AppError(404, "COLLECTION_BATCH_NOT_FOUND", "The collection batch was not found.");
      const accounts = await transaction.select().from(collectionBatchAccounts).where(eq(collectionBatchAccounts.batchId, batchId)).orderBy(asc(collectionBatchAccounts.accountNumberSnapshot), asc(collectionBatchAccounts.serviceNumberSnapshot));
      const entries = await transaction.select().from(batchCollectionEntries).where(eq(batchCollectionEntries.batchId, batchId)).orderBy(asc(batchCollectionEntries.recordedAt));
      const remittance = await transaction.select().from(collectorRemittances).where(eq(collectorRemittances.batchId, batchId)).limit(1);
      const reconciliation = await transaction.select().from(batchReconciliations).where(eq(batchReconciliations.batchId, batchId)).limit(1);
      const expectedFromAccounts = accounts.reduce((sum, account) => sum + account.expectedCentavos, 0n);
      const collectedFromAccounts = accounts.reduce((sum, account) => sum + account.collectedCentavos, 0n);
      const summary = {
        accountCount: accounts.length,
        pendingCount: accounts.filter((account) => account.status === "PENDING").length,
        partialCount: accounts.filter((account) => account.status === "PARTIAL").length,
        collectedCount: accounts.filter((account) => account.status === "COLLECTED").length,
        uncollectedCentavos: (expectedFromAccounts - collectedFromAccounts).toString(),
        totalsMatch: expectedFromAccounts === batch.expectedCashCentavos && collectedFromAccounts === batch.collectedCashCentavos
      };
      return { batch: serializeBatch(batch), summary, accounts: accounts.map(serializeAccount), entries: entries.map((entry) => ({ ...entry, amountCentavos: entry.amountCentavos.toString() })), remittance: remittance[0] ? serializeRemittance(remittance[0]) : null, reconciliation: reconciliation[0] ? serializeReconciliation(reconciliation[0]) : null };
    }, { isolationLevel: "repeatable read" });
  }

  async transition(batchId: string, to: "ACTIVE" | "SUBMITTED" | "CLOSED", version: number, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).for("update").limit(1);
      if (!current) throw new AppError(404, "COLLECTION_BATCH_NOT_FOUND", "The collection batch was not found.");
      validateBatchTransition(current.status, to);
      const dates = to === "ACTIVE" ? { startedAt: new Date() } : to === "SUBMITTED" ? { submittedAt: new Date() } : { closedAt: new Date() };
      const [updated] = await transaction.update(collectionBatches).set({ status: to, ...dates, version: sql`${collectionBatches.version} + 1`, updatedAt: new Date() }).where(and(eq(collectionBatches.id, batchId), eq(collectionBatches.version, version))).returning({ id: collectionBatches.id });
      if (!updated) throw new AppError(409, "CONCURRENCY_CONFLICT", "The batch changed. Reload it before continuing.");
      await audit(transaction, actor, `collection_batch.${to.toLowerCase()}`, batchId, { from: current.status, to });
    });
  }

  async recordCollection(batchId: string, input: { batchAccountId: string; amountCentavos: string; commandKey: string }, actor: SecurityActor) {
    const amount = BigInt(input.amountCentavos);
    return this.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).for("update").limit(1);
      if (!batch) throw new AppError(404, "COLLECTION_BATCH_NOT_FOUND", "The collection batch was not found.");
      if (batch.status !== "ACTIVE") throw new AppError(409, "BATCH_NOT_ACTIVE", "Collections can be recorded only while the batch is active.");
      const [account] = await transaction.select().from(collectionBatchAccounts).where(and(eq(collectionBatchAccounts.id, input.batchAccountId), eq(collectionBatchAccounts.batchId, batchId))).for("update").limit(1);
      if (!account) throw new AppError(404, "BATCH_ACCOUNT_NOT_FOUND", "The route account was not found.");
      const [priorPayment] = await transaction.select({ id: payments.id }).from(payments).where(eq(payments.commandKey, input.commandKey)).limit(1);
      if (priorPayment) {
        const [priorLink] = await transaction.select({ id: batchCollectionEntries.id }).from(batchCollectionEntries).where(and(eq(batchCollectionEntries.paymentId, priorPayment.id), eq(batchCollectionEntries.batchId, batchId), eq(batchCollectionEntries.batchAccountId, account.id))).limit(1);
        if (!priorLink) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This command key was already used outside this route-account collection.");
        return this.payments.post({ subscriberId: account.subscriberId, serviceAccountId: account.serviceAccountId, amountCentavos: input.amountCentavos, method: "CASH", commandKey: input.commandKey }, actor, transaction);
      }
      if (account.collectedCentavos + amount > account.expectedCentavos) throw new AppError(409, "BATCH_OVER_COLLECTION", "The amount exceeds this route snapshot balance.");

      const result = await this.payments.post({ subscriberId: account.subscriberId, serviceAccountId: account.serviceAccountId, amountCentavos: input.amountCentavos, method: "CASH", commandKey: input.commandKey }, actor, transaction);
      const paymentId = result.payment.id;
      const [existing] = await transaction.select({ id: batchCollectionEntries.id }).from(batchCollectionEntries).where(eq(batchCollectionEntries.paymentId, paymentId)).limit(1);
      if (existing) return result;
      await transaction.insert(batchCollectionEntries).values({ batchId, batchAccountId: account.id, paymentId, amountCentavos: amount, recordedBy: actor.userId });
      const nextCollected = account.collectedCentavos + amount;
      await transaction.update(collectionBatchAccounts).set({ collectedCentavos: nextCollected, status: nextCollected === account.expectedCentavos ? "COLLECTED" : "PARTIAL" }).where(eq(collectionBatchAccounts.id, account.id));
      await transaction.update(collectionBatches).set({ collectedCashCentavos: sql`${collectionBatches.collectedCashCentavos} + ${amount}`, differenceCentavos: sql`${collectionBatches.remittedCashCentavos} - (${collectionBatches.collectedCashCentavos} + ${amount})`, version: sql`${collectionBatches.version} + 1`, updatedAt: new Date() }).where(eq(collectionBatches.id, batchId));
      await audit(transaction, actor, "collection_batch.record", batchId, { batchAccountId: account.id, paymentId, amountCentavos: amount.toString() });
      return result;
    });
  }

  async remit(batchId: string, input: { remittedCashCentavos: string; notes: string; version: number }, actor: SecurityActor) {
    const remitted = BigInt(input.remittedCashCentavos);
    return this.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).for("update").limit(1);
      if (!batch) throw new AppError(404, "COLLECTION_BATCH_NOT_FOUND", "The collection batch was not found.");
      if (batch.status !== "SUBMITTED") throw new AppError(409, "BATCH_NOT_SUBMITTED", "Submit the batch before recording remittance.");
      if (batch.version !== input.version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The batch changed. Reload it before remitting.");
      const difference = remittanceDifference(remitted, batch.collectedCashCentavos);
      const remittanceNumber = `REM-${(await nextSequence(transaction, "REMITTANCE")).toString().padStart(8, "0")}`;
      const [created] = await transaction.insert(collectorRemittances).values({ remittanceNumber, batchId, remittedCashCentavos: remitted, differenceCentavos: difference, notes: input.notes.trim(), remittedBy: actor.userId }).returning();
      if (!created) throw new Error("The remittance could not be created.");
      await transaction.update(collectionBatches).set({ status: "REMITTED", remittedCashCentavos: remitted, differenceCentavos: difference, version: sql`${collectionBatches.version} + 1`, updatedAt: new Date() }).where(eq(collectionBatches.id, batchId));
      await audit(transaction, actor, "collection_batch.remit", batchId, { remittanceNumber, remittedCashCentavos: remitted.toString(), differenceCentavos: difference.toString() });
      return serializeRemittance(created);
    });
  }

  async reconcile(batchId: string, notes: string, version: number, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).for("update").limit(1);
      if (!batch) throw new AppError(404, "COLLECTION_BATCH_NOT_FOUND", "The collection batch was not found.");
      validateBatchTransition(batch.status, "RECONCILED");
      if (batch.version !== version) throw new AppError(409, "CONCURRENCY_CONFLICT", "The batch changed. Reload it before reconciling.");
      if (batch.differenceCentavos !== 0n) throw new AppError(409, "DIFFERENCE_APPROVAL_REQUIRED", "The shortage or overage remains visible but cannot be approved until the exception policy is defined.");
      const [remittance] = await transaction.select().from(collectorRemittances).where(eq(collectorRemittances.batchId, batchId)).limit(1);
      if (!remittance) throw new AppError(409, "REMITTANCE_REQUIRED", "Record the collector remittance before reconciliation.");
      await transaction.insert(batchReconciliations).values({ batchId, expectedCentavos: batch.expectedCashCentavos, collectedCashCentavos: batch.collectedCashCentavos, remittedCashCentavos: batch.remittedCashCentavos, nonCashCentavos: batch.nonCashCentavos, differenceCentavos: batch.differenceCentavos, notes: notes.trim(), reconciledBy: actor.userId });
      await transaction.update(collectionBatches).set({ status: "RECONCILED", version: sql`${collectionBatches.version} + 1`, updatedAt: new Date() }).where(eq(collectionBatches.id, batchId));
      await audit(transaction, actor, "collection_batch.reconcile", batchId, { collectedCashCentavos: batch.collectedCashCentavos.toString(), remittedCashCentavos: batch.remittedCashCentavos.toString(), differenceCentavos: "0" });
    });
  }
}

type CollectionTransaction = Parameters<Parameters<BcisDatabase["transaction"]>[0]>[0];
async function nextSequence(transaction: CollectionTransaction, code: string): Promise<bigint> { const [row] = await transaction.insert(numberSequences).values({ code, lastValue: 1n }).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`${numberSequences.lastValue} + 1`, updatedAt: new Date() } }).returning({ value: numberSequences.lastValue }); if (!row) throw new Error(`${code} number generation failed.`); return row.value; }
async function audit(transaction: CollectionTransaction, actor: SecurityActor, action: string, entityId: string, afterValues: Record<string, unknown>) { await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action, entityType: "collection_batch", entityId, requestId: actor.requestId ?? null, afterValues }); }
function serializeBatch(row: typeof collectionBatches.$inferSelect) { return { ...row, expectedCashCentavos: row.expectedCashCentavos.toString(), collectedCashCentavos: row.collectedCashCentavos.toString(), nonCashCentavos: row.nonCashCentavos.toString(), remittedCashCentavos: row.remittedCashCentavos.toString(), differenceCentavos: row.differenceCentavos.toString() }; }
function serializeAccount(row: typeof collectionBatchAccounts.$inferSelect) { return { ...row, currentBillCentavosSnapshot: row.currentBillCentavosSnapshot?.toString() ?? null, arrearsCentavosSnapshot: row.arrearsCentavosSnapshot?.toString() ?? null, expectedCentavos: row.expectedCentavos.toString(), collectedCentavos: row.collectedCentavos.toString() }; }
function serializeRemittance(row: typeof collectorRemittances.$inferSelect) { return { ...row, remittedCashCentavos: row.remittedCashCentavos.toString(), differenceCentavos: row.differenceCentavos.toString() }; }
function serializeReconciliation(row: typeof batchReconciliations.$inferSelect) { return { ...row, expectedCentavos: row.expectedCentavos.toString(), collectedCashCentavos: row.collectedCashCentavos.toString(), remittedCashCentavos: row.remittedCashCentavos.toString(), nonCashCentavos: row.nonCashCentavos.toString(), differenceCentavos: row.differenceCentavos.toString() }; }
