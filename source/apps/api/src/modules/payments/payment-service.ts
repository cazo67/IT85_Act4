import { and, asc, desc, eq, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  batchCollectionEntries,
  collectionBatches,
  invoices,
  ledgerEntries,
  numberSequences,
  paymentAllocations,
  paymentReversals,
  payments,
  receipts,
  subscribers
} from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { allocateOldestFirst } from "./payment-rules.js";

export class PaymentService {
  constructor(private readonly db: BcisDatabase) {}

  async preview(subscriberId: string, amountCentavos: string) {
    const amount = BigInt(amountCentavos);
    const [subscriber] = await this.db.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
    const open = await this.openInvoices(this.db, subscriberId);
    const proposal = allocateOldestFirst(amount, open.map((invoice) => ({ invoiceId: invoice.id, remainingCentavos: invoice.totalCentavos - invoice.paidCentavos })));
    const byId = new Map(open.map((invoice) => [invoice.id, invoice]));
    return {
      subscriber,
      amountCentavos,
      outstandingCentavos: open.reduce((sum, invoice) => sum + invoice.totalCentavos - invoice.paidCentavos, 0n).toString(),
      unallocatedCentavos: proposal.unallocatedCentavos.toString(),
      overpaymentBlocked: proposal.unallocatedCentavos > 0n,
      allocations: proposal.allocations.map((allocation) => ({ invoiceId: allocation.invoiceId, invoiceNumber: byId.get(allocation.invoiceId)?.invoiceNumber ?? "", amountCentavos: allocation.amountCentavos.toString() }))
    };
  }

  async post(input: { subscriberId: string; serviceAccountId?: string | undefined; amountCentavos: string; method: "CASH" | "GCASH"; commandKey: string }, actor: SecurityActor, existingTransaction?: PaymentTransaction) {
    if (input.method === "GCASH") throw new AppError(409, "GCASH_POLICY_NOT_APPROVED", "GCash posting is disabled until proof verification and duplicate-reference policies are approved.");
    const amount = BigInt(input.amountCentavos);
    const execute = async (transaction: PaymentTransaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-payment:${input.subscriberId}`}))`);
      const [prior] = await transaction.select().from(payments).where(eq(payments.commandKey, input.commandKey)).limit(1);
      if (prior) {
        if (prior.subscriberId !== input.subscriberId || prior.amountCentavos !== amount) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This command key was already used for another payment.");
        return this.resultForPayment(transaction, prior.id);
      }

      const [subscriber] = await transaction.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName }).from(subscribers).where(eq(subscribers.id, input.subscriberId)).limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      const open = await this.openInvoices(transaction, input.subscriberId, true, input.serviceAccountId);
      const proposal = allocateOldestFirst(amount, open.map((invoice) => ({ invoiceId: invoice.id, remainingCentavos: invoice.totalCentavos - invoice.paidCentavos })));
      if (proposal.allocations.length === 0) throw new AppError(409, "NO_OUTSTANDING_BALANCE", "This subscriber has no open invoice balance.");
      if (proposal.unallocatedCentavos > 0n) throw new AppError(409, "ADVANCE_PAYMENT_POLICY_REQUIRED", "Overpayment is disabled until the advance-credit policy is approved.");

      const paymentNumber = `PAY-${(await nextSequence(transaction, "PAYMENT")).toString().padStart(8, "0")}`;
      const [payment] = await transaction.insert(payments).values({ paymentNumber, commandKey: input.commandKey, subscriberId: input.subscriberId, method: "CASH", amountCentavos: amount, postedBy: actor.userId }).returning();
      if (!payment) throw new Error("The payment could not be created.");

      const invoiceMap = new Map(open.map((invoice) => [invoice.id, invoice]));
      const receiptAllocations: Array<{ invoiceNumber: string; amountCentavos: string }> = [];
      for (const allocation of proposal.allocations) {
        const invoice = invoiceMap.get(allocation.invoiceId);
        if (!invoice) throw new Error("An allocation invoice disappeared.");
        const nextPaid = invoice.paidCentavos + allocation.amountCentavos;
        await transaction.insert(paymentAllocations).values({ paymentId: payment.id, invoiceId: invoice.id, amountCentavos: allocation.amountCentavos });
        await transaction.update(invoices).set({ paidCentavos: nextPaid, status: nextPaid === invoice.totalCentavos ? "PAID" : "OPEN" }).where(eq(invoices.id, invoice.id));
        receiptAllocations.push({ invoiceNumber: invoice.invoiceNumber, amountCentavos: allocation.amountCentavos.toString() });
      }

      await transaction.insert(ledgerEntries).values({ sequenceNumber: await nextSequence(transaction, "LEDGER"), subscriberId: input.subscriberId, paymentId: payment.id, type: "PAYMENT_CREDIT", description: `Payment ${paymentNumber}`, creditCentavos: amount, actorUserId: actor.userId });
      const receiptNumber = `OR-${(await nextSequence(transaction, "RECEIPT")).toString().padStart(8, "0")}`;
      const snapshot = { receiptNumber, paymentNumber, accountNumber: subscriber.accountNumber, subscriberName: `${subscriber.firstName} ${subscriber.lastName}`, method: "CASH", amountCentavos: amount.toString(), allocations: receiptAllocations, issuedAt: new Date().toISOString() };
      const [receipt] = await transaction.insert(receipts).values({ receiptNumber, paymentId: payment.id, snapshot, issuedBy: actor.userId }).returning();
      if (!receipt) throw new Error("The receipt could not be created.");
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "payment.post", entityType: "payment", entityId: payment.id, requestId: actor.requestId ?? null, afterValues: { paymentNumber, receiptNumber, subscriberId: input.subscriberId, amountCentavos: amount.toString(), method: "CASH" } });
      return { payment: serializePayment(payment), receipt: { ...receipt, snapshot }, allocations: receiptAllocations };
    };
    return existingTransaction ? execute(existingTransaction) : this.db.transaction(execute);
  }

  async list(input: { subscriberId?: string | undefined; page: number; pageSize: number }) {
    const rows = await this.db.select({ payment: payments, receiptNumber: receipts.receiptNumber }).from(payments).leftJoin(receipts, eq(receipts.paymentId, payments.id)).where(input.subscriberId ? eq(payments.subscriberId, input.subscriberId) : undefined).orderBy(desc(payments.paidAt), desc(payments.paymentNumber)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    return { items: rows.map((row) => ({ payment: serializePayment(row.payment), receiptNumber: row.receiptNumber })), page: input.page, pageSize: input.pageSize, hasMore: rows.length === input.pageSize };
  }

  async get(paymentId: string) {
    return this.resultForPayment(this.db, paymentId);
  }

  async reverse(paymentId: string, reason: string, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [payment] = await transaction.select().from(payments).where(eq(payments.id, paymentId)).for("update").limit(1);
      if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
      if (payment.status === "REVERSED") throw new AppError(409, "PAYMENT_ALREADY_REVERSED", "The payment is already reversed.");
      const [batchLink] = await transaction.select({ batchNumber: collectionBatches.batchNumber, status: collectionBatches.status }).from(batchCollectionEntries).innerJoin(collectionBatches, eq(batchCollectionEntries.batchId, collectionBatches.id)).where(eq(batchCollectionEntries.paymentId, paymentId)).limit(1);
      if (batchLink) throw new AppError(409, "BATCH_PAYMENT_REVERSAL_REQUIRES_RECONCILIATION", `Payment belongs to collection batch ${batchLink.batchNumber}; use the approved batch correction workflow.`);
      const allocations = await transaction.select().from(paymentAllocations).where(and(eq(paymentAllocations.paymentId, paymentId), eq(paymentAllocations.isReversed, false)));
      for (const allocation of allocations) {
        const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).for("update").limit(1);
        if (!invoice || invoice.paidCentavos < allocation.amountCentavos) throw new AppError(409, "REVERSAL_CONFLICT", "Invoice settlement changed and the payment cannot be reversed safely.");
        const nextPaid = invoice.paidCentavos - allocation.amountCentavos;
        await transaction.update(invoices).set({ paidCentavos: nextPaid, status: "OPEN" }).where(eq(invoices.id, invoice.id));
      }
      const reversedAt = new Date();
      await transaction.update(paymentAllocations).set({ isReversed: true, reversedAt }).where(eq(paymentAllocations.paymentId, paymentId));
      await transaction.update(payments).set({ status: "REVERSED", reversedAt }).where(eq(payments.id, paymentId));
      await transaction.update(receipts).set({ voidedAt: reversedAt }).where(eq(receipts.paymentId, paymentId));
      await transaction.insert(ledgerEntries).values({ sequenceNumber: await nextSequence(transaction, "LEDGER"), subscriberId: payment.subscriberId, paymentId, type: "PAYMENT_REVERSAL_DEBIT", description: `Reversal of ${payment.paymentNumber}`, debitCentavos: payment.amountCentavos, actorUserId: actor.userId });
      const reversalNumber = `REV-${(await nextSequence(transaction, "PAYMENT_REVERSAL")).toString().padStart(8, "0")}`;
      const [reversal] = await transaction.insert(paymentReversals).values({ reversalNumber, paymentId, reason: reason.trim(), reversedBy: actor.userId }).returning();
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "payment.reverse", entityType: "payment", entityId: paymentId, requestId: actor.requestId ?? null, afterValues: { reversalNumber, reason: reason.trim(), amountCentavos: payment.amountCentavos.toString() } });
      return reversal;
    });
  }

  private openInvoices(database: Pick<BcisDatabase, "select">, subscriberId: string, lock = false, serviceAccountId?: string) {
    const query = database.select().from(invoices).where(and(eq(invoices.subscriberId, subscriberId), eq(invoices.status, "OPEN"), serviceAccountId ? eq(invoices.serviceAccountId, serviceAccountId) : undefined)).orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber));
    return lock && "for" in query ? query.for("update") : query;
  }

  private async resultForPayment(database: Pick<BcisDatabase, "select">, paymentId: string) {
    const [row] = await database.select({ payment: payments, receipt: receipts }).from(payments).leftJoin(receipts, eq(receipts.paymentId, payments.id)).where(eq(payments.id, paymentId)).limit(1);
    if (!row) throw new AppError(404, "PAYMENT_NOT_FOUND", "The payment was not found.");
    const allocations = await database.select({ allocation: paymentAllocations, invoiceNumber: invoices.invoiceNumber }).from(paymentAllocations).innerJoin(invoices, eq(paymentAllocations.invoiceId, invoices.id)).where(eq(paymentAllocations.paymentId, paymentId));
    return { payment: serializePayment(row.payment), receipt: row.receipt ? { ...row.receipt, snapshot: row.receipt.snapshot } : null, allocations: allocations.map((row) => ({ invoiceNumber: row.invoiceNumber, amountCentavos: row.allocation.amountCentavos.toString(), isReversed: row.allocation.isReversed })) };
  }
}

type PaymentTransaction = Parameters<Parameters<BcisDatabase["transaction"]>[0]>[0];

async function nextSequence(transaction: PaymentTransaction, code: string): Promise<bigint> {
  const [sequence] = await transaction.insert(numberSequences).values({ code, lastValue: 1n }).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`${numberSequences.lastValue} + 1`, updatedAt: new Date() } }).returning({ value: numberSequences.lastValue });
  if (!sequence) throw new Error(`${code} number generation failed.`);
  return sequence.value;
}

function serializePayment(payment: typeof payments.$inferSelect) {
  return { ...payment, amountCentavos: payment.amountCentavos.toString() };
}
