import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  billingCycles,
  billingIdempotency,
  invoiceItems,
  invoices,
  ledgerEntries,
  numberSequences,
  serviceAccounts,
  servicePlans,
  subscribers
} from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { calculateDueDate, invoiceLineTotal, parseBillingPeriod } from "./billing-rules.js";

export interface BillingSummary {
  cycleId: string;
  periodKey: string;
  invoiceCount: number;
  totalCentavos: string;
  alreadyFinalized: boolean;
}

export class BillingService {
  constructor(private readonly db: BcisDatabase) {}

  async preview(periodKey: string) {
    const period = parseBillingPeriod(periodKey);
    const eligible = await this.eligibleServices(period.end);
    const [cycle] = await this.db.select().from(billingCycles).where(eq(billingCycles.periodKey, periodKey)).limit(1);
    const existing = cycle ? await this.db.select({ serviceAccountId: invoices.serviceAccountId }).from(invoices).where(eq(invoices.billingCycleId, cycle.id)) : [];
    const billed = new Set(existing.map((row) => row.serviceAccountId));
    const items = eligible.map((row) => ({
      serviceAccountId: row.service.id,
      serviceAccountNumber: row.service.serviceAccountNumber,
      subscriberId: row.service.subscriberId,
      subscriberName: `${row.subscriber.firstName} ${row.subscriber.lastName}`,
      planCode: row.plan.code,
      planName: row.plan.name,
      amountCentavos: row.service.currentRateCentavos.toString(),
      dueDate: calculateDueDate(periodKey, row.service.dueDay),
      alreadyBilled: billed.has(row.service.id)
    }));
    const pending = items.filter((item) => !item.alreadyBilled);
    const total = pending.reduce((sum, item) => sum + BigInt(item.amountCentavos), 0n);
    return { period, cycleStatus: cycle?.status ?? null, eligibleCount: items.length, pendingCount: pending.length, totalCentavos: total.toString(), items };
  }

  async finalize(periodKey: string, commandKey: string, actor: SecurityActor): Promise<BillingSummary> {
    const period = parseBillingPeriod(periodKey);
    return this.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-billing:${periodKey}`}))`);
      const [priorCommand] = await transaction.select().from(billingIdempotency).where(eq(billingIdempotency.commandKey, commandKey)).limit(1);
      if (priorCommand) {
        const prior = priorCommand.responsePayload as BillingSummary;
        if (prior.periodKey !== periodKey) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This command key was already used for another billing period.");
        return prior;
      }

      await transaction.insert(billingCycles).values({ periodKey, periodStart: period.start, periodEnd: period.end, createdBy: actor.userId }).onConflictDoNothing({ target: billingCycles.periodKey });
      const [cycle] = await transaction.select().from(billingCycles).where(eq(billingCycles.periodKey, periodKey)).limit(1);
      if (!cycle) throw new Error("The billing cycle could not be created.");

      if (cycle.status === "FINALIZED") {
        const existing = await transaction.select({ total: invoices.totalCentavos }).from(invoices).where(eq(invoices.billingCycleId, cycle.id));
        const summary: BillingSummary = { cycleId: cycle.id, periodKey, invoiceCount: existing.length, totalCentavos: existing.reduce((sum, row) => sum + row.total, 0n).toString(), alreadyFinalized: true };
        await transaction.insert(billingIdempotency).values({ commandKey, billingCycleId: cycle.id, responsePayload: summary, createdBy: actor.userId });
        return summary;
      }

      const eligible = await transaction
        .select({ service: serviceAccounts, plan: servicePlans, subscriber: subscribers })
        .from(serviceAccounts)
        .innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
        .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
        .where(and(eq(serviceAccounts.status, "ACTIVE"), eq(subscribers.status, "ACTIVE"), lte(serviceAccounts.billingStartDate, period.end)))
        .orderBy(asc(serviceAccounts.serviceAccountNumber));
      if (eligible.length > 10_000) throw new AppError(409, "BILLING_BATCH_TOO_LARGE", "The billing run exceeds the safe batch limit.");

      let invoiceCount = 0;
      let total = 0n;
      for (const row of eligible) {
        const amount = invoiceLineTotal(row.service.currentRateCentavos, 1);
        const invoiceSequence = await nextSequence(transaction, "INVOICE");
        const invoiceNumber = `INV-${periodKey.replace("-", "")}-${invoiceSequence.toString().padStart(8, "0")}`;
        const [invoice] = await transaction.insert(invoices).values({
          invoiceNumber,
          billingCycleId: cycle.id,
          subscriberId: row.service.subscriberId,
          serviceAccountId: row.service.id,
          invoiceDate: period.invoiceDate,
          dueDate: calculateDueDate(periodKey, row.service.dueDay),
          subtotalCentavos: amount,
          totalCentavos: amount,
          planCodeSnapshot: row.plan.code,
          planNameSnapshot: row.plan.name
        }).onConflictDoNothing({ target: [invoices.serviceAccountId, invoices.billingCycleId] }).returning();
        if (!invoice) continue;

        await transaction.insert(invoiceItems).values({ invoiceId: invoice.id, type: "PLAN_SERVICE", description: `${row.plan.name} monthly service`, quantity: 1, unitAmountCentavos: amount, totalCentavos: amount });
        const ledgerSequence = await nextSequence(transaction, "LEDGER");
        await transaction.insert(ledgerEntries).values({ sequenceNumber: ledgerSequence, subscriberId: row.service.subscriberId, serviceAccountId: row.service.id, invoiceId: invoice.id, type: "INVOICE_DEBIT", description: `Invoice ${invoiceNumber}`, debitCentavos: amount, actorUserId: actor.userId });
        invoiceCount += 1;
        total += amount;
      }

      await transaction.update(billingCycles).set({ status: "FINALIZED", finalizedBy: actor.userId, finalizedAt: new Date(), version: sql`${billingCycles.version} + 1` }).where(eq(billingCycles.id, cycle.id));
      const summary: BillingSummary = { cycleId: cycle.id, periodKey, invoiceCount, totalCentavos: total.toString(), alreadyFinalized: false };
      await transaction.insert(billingIdempotency).values({ commandKey, billingCycleId: cycle.id, responsePayload: summary, createdBy: actor.userId });
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "billing.finalize", entityType: "billing_cycle", entityId: cycle.id, requestId: actor.requestId ?? null, afterValues: summary });
      return summary;
    });
  }

  async listCycles() {
    const rows = await this.db.select().from(billingCycles).orderBy(desc(billingCycles.periodKey));
    return rows;
  }

  async listInvoices(input: { periodKey?: string | undefined; subscriberId?: string | undefined; page: number; pageSize: number }) {
    const conditions = [];
    if (input.subscriberId) conditions.push(eq(invoices.subscriberId, input.subscriberId));
    if (input.periodKey) {
      const [cycle] = await this.db.select({ id: billingCycles.id }).from(billingCycles).where(eq(billingCycles.periodKey, parseBillingPeriod(input.periodKey).key)).limit(1);
      if (!cycle) return { items: [], page: input.page, pageSize: input.pageSize, hasMore: false };
      conditions.push(eq(invoices.billingCycleId, cycle.id));
    }
    const rows = await this.db.select().from(invoices).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(invoices.invoiceDate), desc(invoices.invoiceNumber)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    return { items: rows.map(serializeInvoice), page: input.page, pageSize: input.pageSize, hasMore: rows.length === input.pageSize };
  }

  async getInvoice(invoiceId: string) {
    const [invoice] = await this.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "The invoice was not found.");
    const items = await this.db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).orderBy(asc(invoiceItems.createdAt));
    return { invoice: serializeInvoice(invoice), items: items.map((item) => ({ ...item, unitAmountCentavos: item.unitAmountCentavos.toString(), totalCentavos: item.totalCentavos.toString() })) };
  }

  async getStatement(subscriberId: string) {
    const [subscriber] = await this.db.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
    const rows = await this.db.select().from(ledgerEntries).where(eq(ledgerEntries.subscriberId, subscriberId)).orderBy(asc(ledgerEntries.sequenceNumber));
    let balance = 0n;
    const entries = rows.map((entry) => {
      balance += entry.debitCentavos - entry.creditCentavos;
      return { ...entry, sequenceNumber: entry.sequenceNumber.toString(), debitCentavos: entry.debitCentavos.toString(), creditCentavos: entry.creditCentavos.toString(), balanceCentavos: balance.toString() };
    });
    return { subscriber, entries, closingBalanceCentavos: balance.toString() };
  }

  private eligibleServices(periodEnd: string) {
    return this.db
      .select({ service: serviceAccounts, plan: servicePlans, subscriber: subscribers })
      .from(serviceAccounts)
      .innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .where(and(eq(serviceAccounts.status, "ACTIVE"), eq(subscribers.status, "ACTIVE"), lte(serviceAccounts.billingStartDate, periodEnd)))
      .orderBy(asc(serviceAccounts.serviceAccountNumber));
  }
}

type BillingTransaction = Parameters<Parameters<BcisDatabase["transaction"]>[0]>[0];

async function nextSequence(transaction: BillingTransaction, code: string): Promise<bigint> {
  const [sequence] = await transaction.insert(numberSequences).values({ code, lastValue: 1n }).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`${numberSequences.lastValue} + 1`, updatedAt: new Date() } }).returning({ value: numberSequences.lastValue });
  if (!sequence) throw new Error(`${code} number generation failed.`);
  return sequence.value;
}

function serializeInvoice(invoice: typeof invoices.$inferSelect) {
  return { ...invoice, subtotalCentavos: invoice.subtotalCentavos.toString(), totalCentavos: invoice.totalCentavos.toString(), paidCentavos: invoice.paidCentavos.toString() };
}
