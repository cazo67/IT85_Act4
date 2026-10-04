import { and, asc, desc, eq, ilike, lte, sql, sum } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  billingCycles,
  billingIdempotency,
  invoiceItems,
  invoiceVoids,
  invoices,
  ledgerEntries,
  numberSequences,
  paymentAllocations,
  serviceAccounts,
  servicePlans,
  subscriberCredits,
  subscribers
} from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { invoiceSettlementStatus } from "../payments/payment-rules.js";
import { validateReportRange } from "../reports/report-rules.js";
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

      for (const subscriberId of [...new Set(eligible.map((row) => row.service.subscriberId))].sort()) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-payment:${subscriberId}`}))`);
      }

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
        const availableCredits = await transaction.select().from(subscriberCredits).where(and(eq(subscriberCredits.subscriberId, row.service.subscriberId), eq(subscriberCredits.status, "AVAILABLE"))).orderBy(asc(subscriberCredits.createdAt), asc(subscriberCredits.id)).for("update");
        let paid = 0n;
        for (const credit of availableCredits) {
          if (paid === amount) break;
          const applied = credit.remainingCentavos < amount - paid ? credit.remainingCentavos : amount - paid;
          if (applied <= 0n) continue;
          await transaction.insert(paymentAllocations).values({ paymentId: credit.sourcePaymentId, invoiceId: invoice.id, amountCentavos: applied, fromCredit: true });
          const remaining = credit.remainingCentavos - applied;
          await transaction.update(subscriberCredits).set({ remainingCentavos: remaining, status: remaining === 0n ? "CONSUMED" : "AVAILABLE", updatedAt: new Date() }).where(eq(subscriberCredits.id, credit.id));
          await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "credit.apply", entityType: "invoice", entityId: invoice.id, requestId: actor.requestId ?? null, afterValues: { sourcePaymentId: credit.sourcePaymentId, amountCentavos: applied.toString() } });
          paid += applied;
        }
        if (paid > 0n) await transaction.update(invoices).set({ paidCentavos: paid, status: invoiceSettlementStatus(paid, amount) }).where(eq(invoices.id, invoice.id));
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

  async listInvoices(input: { periodKey?: string | undefined; subscriberId?: string | undefined; invoiceNumber?: string | undefined; page: number; pageSize: number }) {
    const conditions = [];
    if (input.subscriberId) conditions.push(eq(invoices.subscriberId, input.subscriberId));
    if (input.invoiceNumber) conditions.push(ilike(invoices.invoiceNumber, `%${input.invoiceNumber}%`));
    if (input.periodKey) {
      const [cycle] = await this.db.select({ id: billingCycles.id }).from(billingCycles).where(eq(billingCycles.periodKey, parseBillingPeriod(input.periodKey).key)).limit(1);
      if (!cycle) return { items: [], page: input.page, pageSize: input.pageSize, hasMore: false };
      conditions.push(eq(invoices.billingCycleId, cycle.id));
    }
    const rows = await this.db.select({ invoice: invoices, subscriber: subscribers, serviceAccountNumber: serviceAccounts.serviceAccountNumber }).from(invoices).innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id)).innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(invoices.invoiceDate), desc(invoices.invoiceNumber)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
    return { items: rows.slice(0, input.pageSize).map((row) => ({ ...serializeInvoice(row.invoice), subscriberAccountNumber: row.subscriber.accountNumber, subscriberName: `${row.subscriber.firstName} ${row.subscriber.lastName}`, serviceAccountNumber: row.serviceAccountNumber })), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }

  async getInvoice(invoiceId: string) {
    const [row] = await this.db.select({ invoice: invoices, subscriber: subscribers, serviceAccountNumber: serviceAccounts.serviceAccountNumber }).from(invoices).innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id)).innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id)).where(eq(invoices.id, invoiceId)).limit(1);
    if (!row) throw new AppError(404, "INVOICE_NOT_FOUND", "The invoice was not found.");
    const items = await this.db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).orderBy(asc(invoiceItems.createdAt));
    const [voidRecord] = await this.db.select().from(invoiceVoids).where(eq(invoiceVoids.invoiceId, invoiceId)).limit(1);
    return { invoice: { ...serializeInvoice(row.invoice), subscriberAccountNumber: row.subscriber.accountNumber, subscriberName: `${row.subscriber.firstName} ${row.subscriber.lastName}`, serviceAccountNumber: row.serviceAccountNumber }, items: items.map((item) => ({ ...item, unitAmountCentavos: item.unitAmountCentavos.toString(), totalCentavos: item.totalCentavos.toString() })), voidRecord: voidRecord ?? null };
  }

  async voidInvoice(invoiceId: string, reason: string, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [owner] = await transaction.select({ subscriberId: invoices.subscriberId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!owner) throw new AppError(404, "INVOICE_NOT_FOUND", "The invoice was not found.");
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bcis-payment:${owner.subscriberId}`}))`);
      const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update").limit(1);
      if (!invoice || invoice.status !== "OPEN" || invoice.paidCentavos !== 0n) throw new AppError(409, "INVOICE_VOID_NOT_ELIGIBLE", "Only an open invoice with no applied payment or credit can be voided.");
      const [allocation] = await transaction.select({ id: paymentAllocations.id }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, invoiceId)).limit(1);
      if (allocation) throw new AppError(409, "INVOICE_VOID_NOT_ELIGIBLE", "This invoice has allocation history and cannot be voided.");
      const [existing] = await transaction.select({ id: invoiceVoids.id }).from(invoiceVoids).where(eq(invoiceVoids.invoiceId, invoiceId)).limit(1);
      if (existing) throw new AppError(409, "INVOICE_ALREADY_VOID", "This invoice is already voided.");
      await transaction.update(invoices).set({ status: "VOID" }).where(eq(invoices.id, invoiceId));
      await transaction.insert(invoiceVoids).values({ invoiceId, reason: reason.trim(), voidedBy: actor.userId });
      const ledgerSequence = await nextSequence(transaction, "LEDGER");
      await transaction.insert(ledgerEntries).values({ sequenceNumber: ledgerSequence, subscriberId: invoice.subscriberId, serviceAccountId: invoice.serviceAccountId, invoiceId, type: "VOID_CREDIT", description: `Void invoice ${invoice.invoiceNumber}`, creditCentavos: invoice.totalCentavos, actorUserId: actor.userId });
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "billing.invoice.void", entityType: "invoice", entityId: invoiceId, requestId: actor.requestId ?? null, beforeValues: { status: invoice.status, outstandingCentavos: invoice.totalCentavos.toString() }, afterValues: { status: "VOID", reason: reason.trim(), outstandingCentavos: "0" } });
      return { invoiceId, invoiceNumber: invoice.invoiceNumber, status: "VOID" as const };
    });
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

  async listLedger(subscriberId: string, input: { dateFrom?: string | undefined; dateTo?: string | undefined; page: number; pageSize: number }) {
    if (Boolean(input.dateFrom) !== Boolean(input.dateTo)) throw new AppError(400, "LEDGER_RANGE_REQUIRED", "Provide both ledger start and end dates.");
    if (input.dateFrom && input.dateTo) validateReportRange(input.dateFrom, input.dateTo, Number.MAX_SAFE_INTEGER);
    return this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      const beforeRange = input.dateFrom ? sql`${ledgerEntries.occurredAt}::date < ${input.dateFrom}::date` : sql`false`;
      const inRange = input.dateFrom && input.dateTo ? sql`${ledgerEntries.occurredAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date` : undefined;
      const [openingResult] = await transaction.select({ debit: sum(ledgerEntries.debitCentavos), credit: sum(ledgerEntries.creditCentavos) }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, subscriberId), beforeRange));
      const [rangeResult] = await transaction.select({ debit: sum(ledgerEntries.debitCentavos), credit: sum(ledgerEntries.creditCentavos) }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, subscriberId), inRange));
      const pageRows = await transaction.select({ entry: ledgerEntries, runningNet: sql<string>`sum(${ledgerEntries.debitCentavos} - ${ledgerEntries.creditCentavos}) over (order by ${ledgerEntries.occurredAt}, ${ledgerEntries.id} rows between unbounded preceding and current row)` }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, subscriberId), inRange)).orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
      const opening = BigInt(openingResult?.debit ?? 0) - BigInt(openingResult?.credit ?? 0);
      const closing = opening + BigInt(rangeResult?.debit ?? 0) - BigInt(rangeResult?.credit ?? 0);
      const visible = pageRows.slice(0, input.pageSize);
      const entries = visible.map(({ entry, runningNet }) => ({ id: entry.id, sequenceNumber: entry.sequenceNumber.toString(), type: entry.type, description: entry.description, occurredAt: entry.occurredAt, invoiceId: entry.invoiceId, paymentId: entry.paymentId, debitCentavos: entry.debitCentavos.toString(), creditCentavos: entry.creditCentavos.toString(), balanceCentavos: (opening + BigInt(runningNet)).toString() }));
      const first = visible[0];
      const pageOpening = first ? opening + BigInt(first.runningNet) - first.entry.debitCentavos + first.entry.creditCentavos : closing;
      return { subscriber, entries, dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null, openingBalanceCentavos: opening.toString(), pageOpeningBalanceCentavos: pageOpening.toString(), closingBalanceCentavos: closing.toString(), page: input.page, pageSize: input.pageSize, hasMore: pageRows.length > input.pageSize };
    }, { isolationLevel: "repeatable read" });
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
  return { ...invoice, subtotalCentavos: invoice.subtotalCentavos.toString(), totalCentavos: invoice.totalCentavos.toString(), paidCentavos: invoice.paidCentavos.toString(), outstandingCentavos: (invoice.status === "VOID" ? 0n : invoice.totalCentavos - invoice.paidCentavos).toString() };
}
