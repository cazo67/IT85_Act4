import { and, asc, desc, eq, gt, ilike, lte, ne, or, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  billingCycles,
  collectionAreas,
  collectors,
  invoices,
  payments,
  reconnectionRecords,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscribers,
  suspensionRecords
} from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { requireIndependentActor, validateServiceControlTransition } from "./receivable-rules.js";

export class ReceivableService {
  constructor(private readonly db: BcisDatabase) {}

  async overdueAccounts(input: { asOf: string; page: number; pageSize: number; search?: string | undefined; bucket?: "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS" | undefined; areaId?: string | undefined; collectorId?: string | undefined; planId?: string | undefined; serviceTypeId?: string | undefined }) {
    const remaining = remainingAsOf(input.asOf);
    const conditions = [ne(invoices.status, "VOID"), gt(remaining, 0n), lte(invoices.invoiceDate, input.asOf), sql`${invoices.dueDate} < ${input.asOf}::date`];
    if (input.search) {
      const pattern = `%${input.search.trim().replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(subscribers.accountNumber, pattern), ilike(subscribers.firstName, pattern), ilike(subscribers.lastName, pattern), ilike(sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`, pattern), ilike(invoices.invoiceNumber, pattern), ilike(serviceAccounts.serviceAccountNumber, pattern))!);
    }
    if (input.areaId) conditions.push(eq(subscribers.collectionAreaId, input.areaId));
    if (input.collectorId) conditions.push(sql`coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId}) = ${input.collectorId}::uuid`);
    if (input.planId) conditions.push(eq(servicePlans.id, input.planId));
    if (input.serviceTypeId) conditions.push(eq(servicePlans.serviceTypeId, input.serviceTypeId));
    const ageDays = sql`(${input.asOf}::date - ${invoices.dueDate})`;
    if (input.bucket === "CURRENT") conditions.push(sql`${ageDays} <= 0`);
    if (input.bucket === "DAYS_1_30") conditions.push(sql`${ageDays} between 1 and 30`);
    if (input.bucket === "DAYS_31_60") conditions.push(sql`${ageDays} between 31 and 60`);
    if (input.bucket === "DAYS_61_90") conditions.push(sql`${ageDays} between 61 and 90`);
    if (input.bucket === "DAYS_91_PLUS") conditions.push(sql`${ageDays} >= 91`);
    const rows = await this.db.select({
      subscriberId: subscribers.id,
      accountNumber: subscribers.accountNumber,
      subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`,
      serviceAccountId: serviceAccounts.id,
      serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      serviceStatus: serviceAccounts.status,
      areaName: collectionAreas.name,
      collectorName: collectors.displayName,
      monthsUnpaid: sql<number>`count(distinct ${billingCycles.periodKey})::integer`,
      overdueInvoiceCount: sql<number>`count(${invoices.id})::integer`,
      oldestUnpaidInvoice: sql<string>`(array_agg(${invoices.invoiceNumber} order by ${invoices.dueDate}, ${invoices.invoiceNumber}))[1]`,
      oldestDueDate: sql<string>`min(${invoices.dueDate})`,
      maximumDaysPastDue: sql<number>`max(${ageDays})::integer`,
      totalArrearsCentavos: sql<bigint>`sum(${remaining})`,
      lastPaymentAt: sql<string | null>`(select max(p.paid_at)::text from payments p where p.subscriber_id = ${subscribers.id} and p.paid_at < (${input.asOf}::date + interval '1 day') and (p.reversed_at is null or p.reversed_at >= (${input.asOf}::date + interval '1 day')))`
    }).from(invoices)
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(servicePlans, eq(invoices.planCodeSnapshot, servicePlans.code))
      .leftJoin(collectionAreas, eq(subscribers.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, sql`${collectors.id} = coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId})`)
      .where(and(...conditions))
      .groupBy(subscribers.id, serviceAccounts.id, collectionAreas.id, collectors.id)
      .orderBy(asc(sql`min(${invoices.dueDate})`), asc(serviceAccounts.serviceAccountNumber))
      .limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
    return { items: rows.slice(0, input.pageSize).map((row) => ({ ...row, totalArrearsCentavos: money(row.totalArrearsCentavos) })), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }

  async list(input: { asOf: string; overdueOnly: boolean; page: number; pageSize: number; search?: string | undefined; bucket?: "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_91_PLUS" | undefined; areaId?: string | undefined; collectorId?: string | undefined; planId?: string | undefined; serviceTypeId?: string | undefined }) {
    const paid = paidAsOf(input.asOf);
    const remaining = remainingAsOf(input.asOf);
    const conditions = [ne(invoices.status, "VOID"), gt(remaining, 0n), lte(invoices.invoiceDate, input.asOf)];
    if (input.overdueOnly) conditions.push(sql`${invoices.dueDate} < ${input.asOf}::date`);
    if (input.search) {
      const pattern = `%${input.search.trim().replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(subscribers.accountNumber, pattern), ilike(subscribers.firstName, pattern), ilike(subscribers.lastName, pattern), ilike(sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`, pattern), ilike(invoices.invoiceNumber, pattern), ilike(serviceAccounts.serviceAccountNumber, pattern))!);
    }
    if (input.areaId) conditions.push(eq(subscribers.collectionAreaId, input.areaId));
    if (input.collectorId) conditions.push(sql`coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId}) = ${input.collectorId}::uuid`);
    if (input.planId) conditions.push(eq(servicePlans.id, input.planId));
    if (input.serviceTypeId) conditions.push(eq(servicePlans.serviceTypeId, input.serviceTypeId));
    const ageDays = sql`(${input.asOf}::date - ${invoices.dueDate})`;
    if (input.bucket === "CURRENT") conditions.push(sql`${ageDays} <= 0`);
    if (input.bucket === "DAYS_1_30") conditions.push(sql`${ageDays} between 1 and 30`);
    if (input.bucket === "DAYS_31_60") conditions.push(sql`${ageDays} between 31 and 60`);
    if (input.bucket === "DAYS_61_90") conditions.push(sql`${ageDays} between 61 and 90`);
    if (input.bucket === "DAYS_91_PLUS") conditions.push(sql`${ageDays} >= 91`);
    const rows = await this.db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        totalCentavos: invoices.totalCentavos,
        paidCentavos: paid,
        remainingCentavos: remaining,
        subscriberId: subscribers.id,
        accountNumber: subscribers.accountNumber,
        subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        serviceStatus: serviceAccounts.status,
        planCode: invoices.planCodeSnapshot,
        planName: invoices.planNameSnapshot,
        serviceTypeCode: serviceTypes.code,
        serviceTypeName: serviceTypes.name,
        areaName: collectionAreas.name,
        collectorName: collectors.displayName,
        daysPastDue: sql<number>`greatest((${input.asOf}::date - ${invoices.dueDate}), 0)`,
        lastPaymentAt: sql<string | null>`(select max(p.paid_at)::text from payments p where p.subscriber_id = ${subscribers.id} and p.paid_at < (${input.asOf}::date + interval '1 day') and (p.reversed_at is null or p.reversed_at >= (${input.asOf}::date + interval '1 day')))`
      })
      .from(invoices)
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(servicePlans, eq(invoices.planCodeSnapshot, servicePlans.code))
      .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
      .leftJoin(collectionAreas, eq(subscribers.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, sql`${collectors.id} = coalesce(${serviceAccounts.assignedCollectorId}, ${subscribers.assignedCollectorId})`)
      .where(and(...conditions))
      .orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber))
      .limit(input.pageSize + 1)
      .offset((input.page - 1) * input.pageSize);
    return {
      items: rows.slice(0, input.pageSize).map((row) => ({ ...row, ageBucket: row.daysPastDue === 0 ? "CURRENT" : row.daysPastDue <= 30 ? "DAYS_1_30" : row.daysPastDue <= 60 ? "DAYS_31_60" : row.daysPastDue <= 90 ? "DAYS_61_90" : "DAYS_91_PLUS", totalCentavos: money(row.totalCentavos), paidCentavos: money(row.paidCentavos), remainingCentavos: money(row.remainingCentavos) })),
      page: input.page,
      pageSize: input.pageSize,
      hasMore: rows.length > input.pageSize
    };
  }

  async filterOptions() {
    const [areas, collectorRows, plans, types] = await Promise.all([
      this.db.select({ id: collectionAreas.id, name: collectionAreas.name }).from(collectionAreas).orderBy(asc(collectionAreas.name)),
      this.db.select({ id: collectors.id, name: collectors.displayName }).from(collectors).orderBy(asc(collectors.displayName)),
      this.db.select({ id: servicePlans.id, name: servicePlans.name, code: servicePlans.code }).from(servicePlans).orderBy(asc(servicePlans.code)),
      this.db.select({ id: serviceTypes.id, name: serviceTypes.name, code: serviceTypes.code }).from(serviceTypes).orderBy(asc(serviceTypes.code))
    ]);
    return { areas, collectors: collectorRows, plans, serviceTypes: types };
  }

  async aging(asOf: string) {
    const remaining = remainingAsOf(asOf);
    const [summary] = await this.db
      .select({
        currentCentavos: sql<bigint>`coalesce(sum(case when ${invoices.dueDate} >= ${asOf}::date then ${remaining} else 0 end), 0)`,
        days1To30Centavos: sql<bigint>`coalesce(sum(case when (${asOf}::date - ${invoices.dueDate}) between 1 and 30 then ${remaining} else 0 end), 0)`,
        days31To60Centavos: sql<bigint>`coalesce(sum(case when (${asOf}::date - ${invoices.dueDate}) between 31 and 60 then ${remaining} else 0 end), 0)`,
        days61To90Centavos: sql<bigint>`coalesce(sum(case when (${asOf}::date - ${invoices.dueDate}) between 61 and 90 then ${remaining} else 0 end), 0)`,
        days91PlusCentavos: sql<bigint>`coalesce(sum(case when (${asOf}::date - ${invoices.dueDate}) >= 91 then ${remaining} else 0 end), 0)`,
        totalCentavos: sql<bigint>`coalesce(sum(${remaining}), 0)`,
        invoiceCount: sql<number>`count(*)::integer`
      })
      .from(invoices)
      .where(and(ne(invoices.status, "VOID"), gt(remaining, 0n), lte(invoices.invoiceDate, asOf)));
    const zero = { currentCentavos: 0n, days1To30Centavos: 0n, days31To60Centavos: 0n, days61To90Centavos: 0n, days91PlusCentavos: 0n, totalCentavos: 0n, invoiceCount: 0 };
    const result = summary ?? zero;
    return {
      asOf,
      currentCentavos: money(result.currentCentavos),
      days1To30Centavos: money(result.days1To30Centavos),
      days31To60Centavos: money(result.days31To60Centavos),
      days61To90Centavos: money(result.days61To90Centavos),
      days91PlusCentavos: money(result.days91PlusCentavos),
      totalCentavos: money(result.totalCentavos),
      invoiceCount: Number(result.invoiceCount)
    };
  }

  async candidates(input: { asOf: string; minimumDaysOverdue: number; minimumBalanceCentavos: string }) {
    const minimumBalance = BigInt(input.minimumBalanceCentavos);
    const remaining = remainingAsOf(input.asOf);
    const rows = await this.db
      .select({
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        subscriberId: subscribers.id,
        accountNumber: subscribers.accountNumber,
        subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`,
        oldestDueDate: sql<string>`min(${invoices.dueDate})`,
        maximumDaysPastDue: sql<number>`max(${input.asOf}::date - ${invoices.dueDate})::integer`,
        overdueCentavos: sql<bigint>`sum(${remaining})`
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .where(and(eq(serviceAccounts.status, "ACTIVE"), ne(invoices.status, "VOID"), gt(remaining, 0n), lte(invoices.invoiceDate, input.asOf), sql`${invoices.dueDate} < ${input.asOf}::date`))
      .groupBy(serviceAccounts.id, subscribers.id)
      .having(and(sql`max(${input.asOf}::date - ${invoices.dueDate}) >= ${input.minimumDaysOverdue}`, sql`sum(${remaining}) >= ${minimumBalance}`))
      .orderBy(desc(sql`max(${input.asOf}::date - ${invoices.dueDate})`), asc(serviceAccounts.serviceAccountNumber))
      .limit(500);
    return rows.map((row) => ({ ...row, overdueCentavos: money(row.overdueCentavos) }));
  }

  async listServiceControl() {
    const [suspensions, reconnections] = await Promise.all([
      this.db.select({ record: suspensionRecords, serviceAccountNumber: serviceAccounts.serviceAccountNumber, accountNumber: subscribers.accountNumber, subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}` }).from(suspensionRecords).innerJoin(serviceAccounts, eq(suspensionRecords.serviceAccountId, serviceAccounts.id)).innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id)).orderBy(desc(suspensionRecords.requestedAt)).limit(200),
      this.db.select({ record: reconnectionRecords, serviceAccountNumber: serviceAccounts.serviceAccountNumber, accountNumber: subscribers.accountNumber, subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}` }).from(reconnectionRecords).innerJoin(serviceAccounts, eq(reconnectionRecords.serviceAccountId, serviceAccounts.id)).innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id)).orderBy(desc(reconnectionRecords.requestedAt)).limit(200)
    ]);
    return {
      suspensions: suspensions.map((row) => ({ ...row, record: { ...row.record, outstandingCentavosSnapshot: money(row.record.outstandingCentavosSnapshot) } })),
      reconnections
    };
  }

  async requestSuspension(input: { serviceAccountId: string; asOf: string; reason: string }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [account] = await transaction.select().from(serviceAccounts).where(eq(serviceAccounts.id, input.serviceAccountId)).for("update").limit(1);
      if (!account) throw new AppError(404, "SERVICE_ACCOUNT_NOT_FOUND", "The service account was not found.");
      if (account.status !== "ACTIVE") throw new AppError(409, "SERVICE_NOT_ACTIVE", "Only an active service can be submitted for suspension.");
      const historicalRemaining = remainingAsOf(input.asOf);
      const [balance] = await transaction.select({ amount: sql<bigint>`coalesce(sum(${historicalRemaining}), 0)` }).from(invoices).where(and(eq(invoices.serviceAccountId, account.id), ne(invoices.status, "VOID"), gt(historicalRemaining, 0n), lte(invoices.invoiceDate, input.asOf)));
      const [record] = await transaction.insert(suspensionRecords).values({ serviceAccountId: account.id, asOfDate: input.asOf, outstandingCentavosSnapshot: BigInt(balance?.amount ?? 0), reason: input.reason.trim(), requestedBy: actor.userId }).returning();
      if (!record) throw new Error("The suspension request could not be created.");
      await audit(transaction, actor, "suspension.request", record.id, { serviceAccountId: account.id, asOfDate: input.asOf, outstandingCentavosSnapshot: record.outstandingCentavosSnapshot.toString() });
      return { ...record, outstandingCentavosSnapshot: record.outstandingCentavosSnapshot.toString() };
    });
  }

  async approveSuspension(id: string, input: { version: number; notes: string }, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(suspensionRecords).where(eq(suspensionRecords.id, id)).for("update").limit(1);
      if (!record) throw new AppError(404, "SUSPENSION_NOT_FOUND", "The suspension request was not found.");
      validateServiceControlTransition(record.status, "APPROVED");
      requireIndependentActor(record.requestedBy, actor.userId, "approve");
      const [updated] = await transaction.update(suspensionRecords).set({ status: "APPROVED", approvedBy: actor.userId, approvedAt: new Date(), decisionNotes: input.notes.trim(), version: sql`${suspensionRecords.version} + 1`, updatedAt: new Date() }).where(and(eq(suspensionRecords.id, id), eq(suspensionRecords.version, input.version))).returning({ id: suspensionRecords.id });
      if (!updated) throw conflict();
      await audit(transaction, actor, "suspension.approve", id, { status: "APPROVED" });
    });
  }

  async completeSuspension(id: string, version: number, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(suspensionRecords).where(eq(suspensionRecords.id, id)).for("update").limit(1);
      if (!record) throw new AppError(404, "SUSPENSION_NOT_FOUND", "The suspension request was not found.");
      validateServiceControlTransition(record.status, "COMPLETED");
      if (!record.approvedBy) throw new AppError(409, "APPROVAL_REQUIRED", "Approve the suspension before completion.");
      requireIndependentActor(record.approvedBy, actor.userId, "complete");
      const [account] = await transaction.select().from(serviceAccounts).where(eq(serviceAccounts.id, record.serviceAccountId)).for("update").limit(1);
      if (!account || account.status !== "ACTIVE") throw new AppError(409, "SERVICE_NOT_ACTIVE", "The service is no longer active.");
      const [updated] = await transaction.update(suspensionRecords).set({ status: "COMPLETED", completedBy: actor.userId, completedAt: new Date(), version: sql`${suspensionRecords.version} + 1`, updatedAt: new Date() }).where(and(eq(suspensionRecords.id, id), eq(suspensionRecords.version, version))).returning({ id: suspensionRecords.id });
      if (!updated) throw conflict();
      await transaction.update(serviceAccounts).set({ status: "SUSPENDED", version: sql`${serviceAccounts.version} + 1`, updatedAt: new Date() }).where(eq(serviceAccounts.id, account.id));
      await transaction.insert(serviceEvents).values({ serviceAccountId: account.id, type: "SUSPENDED", description: `Suspension work completed from approved request ${id}.`, oldStatus: "ACTIVE", newStatus: "SUSPENDED", actorUserId: actor.userId });
      await audit(transaction, actor, "suspension.complete", id, { serviceAccountId: account.id, oldStatus: "ACTIVE", newStatus: "SUSPENDED" });
    });
  }

  async requestReconnection(input: { serviceAccountId: string; reason: string; qualifyingPaymentId?: string | undefined }, actor: SecurityActor) {
    return this.db.transaction(async (transaction) => {
      const [account] = await transaction.select().from(serviceAccounts).where(eq(serviceAccounts.id, input.serviceAccountId)).for("update").limit(1);
      if (!account) throw new AppError(404, "SERVICE_ACCOUNT_NOT_FOUND", "The service account was not found.");
      if (account.status !== "SUSPENDED") throw new AppError(409, "SERVICE_NOT_SUSPENDED", "Only a suspended service can be submitted for reconnection.");
      const [suspension] = await transaction.select().from(suspensionRecords).where(and(eq(suspensionRecords.serviceAccountId, account.id), eq(suspensionRecords.status, "COMPLETED"))).orderBy(desc(suspensionRecords.completedAt)).limit(1);
      if (!suspension) throw new AppError(409, "COMPLETED_SUSPENSION_REQUIRED", "No completed suspension record was found.");
      if (input.qualifyingPaymentId) {
        const [payment] = await transaction.select({ id: payments.id }).from(payments).where(and(eq(payments.id, input.qualifyingPaymentId), eq(payments.subscriberId, account.subscriberId), eq(payments.status, "POSTED"))).limit(1);
        if (!payment) throw new AppError(400, "INVALID_QUALIFYING_PAYMENT", "The qualifying payment is not a posted payment for this subscriber.");
      }
      const [record] = await transaction.insert(reconnectionRecords).values({ serviceAccountId: account.id, suspensionId: suspension.id, qualifyingPaymentId: input.qualifyingPaymentId, reason: input.reason.trim(), requestedBy: actor.userId }).returning();
      if (!record) throw new Error("The reconnection request could not be created.");
      await audit(transaction, actor, "reconnection.request", record.id, { serviceAccountId: account.id, suspensionId: suspension.id, qualifyingPaymentId: input.qualifyingPaymentId ?? null });
      return record;
    });
  }

  async approveReconnection(id: string, input: { version: number; notes: string }, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(reconnectionRecords).where(eq(reconnectionRecords.id, id)).for("update").limit(1);
      if (!record) throw new AppError(404, "RECONNECTION_NOT_FOUND", "The reconnection request was not found.");
      validateServiceControlTransition(record.status, "APPROVED");
      requireIndependentActor(record.requestedBy, actor.userId, "approve");
      const [updated] = await transaction.update(reconnectionRecords).set({ status: "APPROVED", approvedBy: actor.userId, approvedAt: new Date(), decisionNotes: input.notes.trim(), version: sql`${reconnectionRecords.version} + 1`, updatedAt: new Date() }).where(and(eq(reconnectionRecords.id, id), eq(reconnectionRecords.version, input.version))).returning({ id: reconnectionRecords.id });
      if (!updated) throw conflict();
      await audit(transaction, actor, "reconnection.approve", id, { status: "APPROVED", qualifyingPaymentId: record.qualifyingPaymentId });
    });
  }

  async completeReconnection(id: string, version: number, actor: SecurityActor): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(reconnectionRecords).where(eq(reconnectionRecords.id, id)).for("update").limit(1);
      if (!record) throw new AppError(404, "RECONNECTION_NOT_FOUND", "The reconnection request was not found.");
      validateServiceControlTransition(record.status, "COMPLETED");
      if (!record.approvedBy) throw new AppError(409, "APPROVAL_REQUIRED", "Approve the reconnection before completion.");
      requireIndependentActor(record.approvedBy, actor.userId, "complete");
      const [account] = await transaction.select().from(serviceAccounts).where(eq(serviceAccounts.id, record.serviceAccountId)).for("update").limit(1);
      if (!account || account.status !== "SUSPENDED") throw new AppError(409, "SERVICE_NOT_SUSPENDED", "The service is no longer suspended.");
      const [updated] = await transaction.update(reconnectionRecords).set({ status: "COMPLETED", completedBy: actor.userId, completedAt: new Date(), version: sql`${reconnectionRecords.version} + 1`, updatedAt: new Date() }).where(and(eq(reconnectionRecords.id, id), eq(reconnectionRecords.version, version))).returning({ id: reconnectionRecords.id });
      if (!updated) throw conflict();
      await transaction.update(serviceAccounts).set({ status: "ACTIVE", version: sql`${serviceAccounts.version} + 1`, updatedAt: new Date() }).where(eq(serviceAccounts.id, account.id));
      await transaction.insert(serviceEvents).values({ serviceAccountId: account.id, type: "RECONNECTED", description: `Reconnection work completed from approved request ${id}. No fee was posted because fee policy is not approved.`, oldStatus: "SUSPENDED", newStatus: "ACTIVE", actorUserId: actor.userId });
      await audit(transaction, actor, "reconnection.complete", id, { serviceAccountId: account.id, oldStatus: "SUSPENDED", newStatus: "ACTIVE", feePostedCentavos: "0" });
    });
  }
}

type ReceivableTransaction = Parameters<Parameters<BcisDatabase["transaction"]>[0]>[0];
async function audit(transaction: ReceivableTransaction, actor: SecurityActor, action: string, entityId: string, afterValues: Record<string, unknown>) {
  await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action, entityType: action.startsWith("suspension") ? "suspension_record" : "reconnection_record", entityId, requestId: actor.requestId ?? null, afterValues });
}
function money(value: unknown): string { return BigInt(value as string | number | bigint).toString(); }
function conflict() { return new AppError(409, "CONCURRENCY_CONFLICT", "The request changed. Reload it before continuing."); }
function paidAsOf(asOf: string) {
  return sql<bigint>`coalesce((select sum(pa.amount_centavos) from payment_allocations pa inner join payments p on p.id = pa.payment_id where pa.invoice_id = ${invoices.id} and p.paid_at < (${asOf}::date + interval '1 day') and (pa.reversed_at is null or pa.reversed_at >= (${asOf}::date + interval '1 day'))), 0)`;
}
function remainingAsOf(asOf: string) { return sql<bigint>`${invoices.totalCentavos} - ${paidAsOf(asOf)}`; }
