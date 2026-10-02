import { and, asc, count, desc, eq, inArray, lte, ne, sql, sum } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import { auditLogs, collectionAreas, collectionBatchAccounts, collectionBatches, collectionRoutes, collectorAssignments, collectorRemittances, collectors, invoices, ledgerEntries, payments, serviceAccounts, servicePlans, serviceTypes, subscriberAddresses, subscriberContacts, subscribers } from "../../db/schema/index.js";
import { renderReportPdf, renderReportXlsx } from "../../infrastructure/reports/report-renderers.js";
import { reportDefinitions, type ReportCode, type ReportDocument } from "../../infrastructure/reports/report-model.js";
import { ReceivableService } from "../receivables/receivable-service.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { buildStatementBalances, safeReportFilename, sumCentavos, validateReportRange } from "./report-rules.js";

export interface ReportParameters { asOf?: string | undefined; dateFrom?: string | undefined; dateTo?: string | undefined; subscriberId?: string | undefined; status?: "ALL" | "ACTIVE" | "INACTIVE" | "TERMINATED" | "ARCHIVED" | undefined; search?: string | undefined; }

export class ReportService {
  private readonly receivables: ReceivableService;
  constructor(private readonly db: BcisDatabase) { this.receivables = new ReceivableService(db); }

  definitions() { return reportDefinitions; }

  async dashboard(asOf: string) {
    validateReportRange(asOf, asOf);
    const monthStart = `${asOf.slice(0, 7)}-01`;
    const [[billed], [collected], serviceCounts, [openBatches], aging, methods, collectorRows, overdue, recentRows] = await Promise.all([
      this.db.select({ amount: sum(invoices.totalCentavos), value: count() }).from(invoices).where(and(ne(invoices.status, "VOID"), sql`${invoices.invoiceDate} between ${monthStart}::date and ${asOf}::date`)),
      this.db.select({ amount: sum(payments.amountCentavos), value: count() }).from(payments).where(and(sql`${payments.paidAt}::date between ${monthStart}::date and ${asOf}::date`, sql`(${payments.reversedAt} is null or ${payments.reversedAt}::date > ${asOf}::date)`)),
      this.db.select({ status: serviceAccounts.status, value: count() }).from(serviceAccounts).where(inArray(serviceAccounts.status, ["ACTIVE", "SUSPENDED"])).groupBy(serviceAccounts.status),
      this.db.select({ value: count() }).from(collectionBatches).where(ne(collectionBatches.status, "CLOSED")),
      this.receivables.aging(asOf),
      this.db.select({ method: payments.method, amount: sum(payments.amountCentavos), value: count() }).from(payments).where(and(sql`${payments.paidAt}::date between ${monthStart}::date and ${asOf}::date`, sql`(${payments.reversedAt} is null or ${payments.reversedAt}::date > ${asOf}::date)`)).groupBy(payments.method).orderBy(asc(payments.method)),
      this.db.select({ collectorId: collectors.id, collectorName: collectors.displayName, batchCount: count(), expected: sum(collectionBatches.expectedCashCentavos), collected: sum(collectionBatches.collectedCashCentavos), remitted: sum(collectionBatches.remittedCashCentavos) }).from(collectionBatches).innerJoin(collectors, eq(collectionBatches.collectorId, collectors.id)).where(sql`${collectionBatches.collectionDate} between ${monthStart}::date and ${asOf}::date`).groupBy(collectors.id).orderBy(desc(sum(collectionBatches.collectedCashCentavos)), asc(collectors.displayName)).limit(5),
      this.receivables.overdueAccounts({ asOf, page: 1, pageSize: 5 }),
      this.db.select({ paymentNumber: payments.paymentNumber, paidAt: payments.paidAt, method: payments.method, amountCentavos: payments.amountCentavos, accountNumber: subscribers.accountNumber, subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}` }).from(payments).innerJoin(subscribers, eq(payments.subscriberId, subscribers.id)).where(and(sql`${payments.paidAt}::date <= ${asOf}::date`, sql`(${payments.reversedAt} is null or ${payments.reversedAt}::date > ${asOf}::date)`)).orderBy(desc(payments.paidAt), desc(payments.id)).limit(5)
    ]);
    return {
      asOf,
      monthStart,
      billedCentavos: money(billed?.amount), billedInvoiceCount: Number(billed?.value ?? 0),
      collectedCentavos: money(collected?.amount), paymentCount: Number(collected?.value ?? 0),
      outstandingCentavos: aging.totalCentavos, outstandingInvoiceCount: aging.invoiceCount,
      activeServiceCount: Number(serviceCounts.find((row) => row.status === "ACTIVE")?.value ?? 0),
      suspendedServiceCount: Number(serviceCounts.find((row) => row.status === "SUSPENDED")?.value ?? 0),
      openBatchCount: Number(openBatches?.value ?? 0),
      aging,
      paymentMethods: methods.map((row) => ({ method: row.method, amountCentavos: money(row.amount), paymentCount: Number(row.value) })),
      collectorPerformance: collectorRows.map((row) => ({ collectorId: row.collectorId, collectorName: row.collectorName, batchCount: Number(row.batchCount), expectedCentavos: money(row.expected), collectedCentavos: money(row.collected), remittedCentavos: money(row.remitted) })),
      overdueAlerts: overdue.items.map((row) => ({ subscriberId: row.subscriberId, accountNumber: row.accountNumber, subscriberName: row.subscriberName, serviceAccountNumber: row.serviceAccountNumber, oldestDueDate: row.oldestDueDate, maximumDaysPastDue: row.maximumDaysPastDue, totalArrearsCentavos: row.totalArrearsCentavos })),
      hasMoreOverdue: overdue.hasMore,
      recentPayments: recentRows.map((row) => ({ ...row, amountCentavos: row.amountCentavos.toString(), paidAt: row.paidAt.toISOString() }))
    };
  }

  async run(code: ReportCode, parameters: ReportParameters, generatedBy: string): Promise<ReportDocument> {
    if (code === "daily-collections") return this.dailyCollections(requireRange(parameters, 1), generatedBy);
    if (code === "weekly-collections") return this.weeklyCollections(requireRange(parameters), generatedBy);
    if (code === "annual-collections") return this.annualCollections(requireCalendarYear(parameters), generatedBy);
    if (code === "monthly-collections") return this.monthlyCollections(requireRange(parameters), generatedBy);
    if (code === "billing-vs-collection") return this.billingVsCollection(requireRange(parameters), generatedBy);
    if (code === "subscriber-master") return this.subscriberMaster(parameters, generatedBy);
    if (code === "ar-aging") return this.arAging(requireAsOf(parameters), generatedBy);
    if (code === "subscriber-soa") return this.subscriberSoa(requireSoa(parameters), generatedBy);
    if (code === "subscriber-ledger") return this.subscriberLedger(requireSoa(parameters), generatedBy);
    if (code === "collector-assignments") return this.collectorAssignments(requireAsOf(parameters), generatedBy);
    if (code === "collector-performance") return this.collectorPerformance(requireRange(parameters), generatedBy);
    return this.collectorReconciliation(requireRange(parameters), generatedBy);
  }

  async export(code: ReportCode, parameters: ReportParameters, format: "pdf" | "xlsx", generatedBy: string, actor: SecurityActor) {
    const report = await this.run(code, parameters, generatedBy);
    const buffer = format === "pdf" ? await renderReportPdf(report) : await renderReportXlsx(report);
    await this.db.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "report.export", entityType: "report", entityId: code, requestId: actor.requestId ?? null, afterValues: { format, parameters: report.parameters, rowCount: report.rows.length, sizeBytes: buffer.length } });
    const suffix = report.parameters.asOf ?? `${report.parameters.dateFrom ?? ""}-${report.parameters.dateTo ?? ""}`;
    return { buffer, filename: safeReportFilename(code, suffix, format), mediaType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  private async dailyCollections(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const rows = await this.db.select({ date: sql<string>`${payments.paidAt}::date`, paymentNumber: payments.paymentNumber, accountNumber: subscribers.accountNumber, method: payments.method, amountCentavos: payments.amountCentavos }).from(payments).innerJoin(subscribers, eq(payments.subscriberId, subscribers.id)).where(and(eq(payments.status, "POSTED"), sql`${payments.paidAt}::date = ${input.dateFrom}::date`)).orderBy(asc(payments.paidAt), asc(payments.paymentNumber));
    return document("daily-collections", "Daily Collection Detail (Currently Posted)", input, generatedBy,
      [{ key: "date", label: "Date", type: "date" }, { key: "paymentNumber", label: "Payment", type: "text", width: 24 }, { key: "accountNumber", label: "Account", type: "text", width: 20 }, { key: "method", label: "Method", type: "text" }, { key: "amountCentavos", label: "Amount", type: "money" }],
      rows.map((row) => ({ ...row, amountCentavos: row.amountCentavos.toString() })),
      [{ label: "Payments", value: rows.length, type: "integer" }, { label: "Collections", value: sumMoney(rows.map((row) => row.amountCentavos)), type: "money" }]);
  }

  private async weeklyCollections(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const weekStart = sql<string>`date_trunc('week', ${payments.paidAt})::date`;
    const rows = await this.db.select({ weekStart, method: payments.method, paymentCount: sql<number>`count(*)::integer`, amountCentavos: sum(payments.amountCentavos) }).from(payments).where(and(eq(payments.status, "POSTED"), sql`${payments.paidAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).groupBy(weekStart, payments.method).orderBy(asc(weekStart), asc(payments.method));
    return document("weekly-collections", "Weekly Collections by Payment Method (Currently Posted)", input, generatedBy,
      [{ key: "weekStart", label: "Week starting Monday", type: "date", width: 24 }, { key: "method", label: "Method", type: "text" }, { key: "paymentCount", label: "Payments", type: "integer" }, { key: "amountCentavos", label: "Amount", type: "money" }],
      rows.map((row) => ({ ...row, amountCentavos: money(row.amountCentavos) })),
      [{ label: "Payments", value: rows.reduce((total, row) => total + Number(row.paymentCount), 0), type: "integer" }, { label: "Collections", value: sumMoney(rows.map((row) => row.amountCentavos)), type: "money" }]);
  }

  private async monthlyCollections(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const rows = await this.db.select({ date: sql<string>`${payments.paidAt}::date`, method: payments.method, paymentCount: sql<number>`count(*)::integer`, amountCentavos: sum(payments.amountCentavos) }).from(payments).where(and(eq(payments.status, "POSTED"), sql`${payments.paidAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).groupBy(sql`${payments.paidAt}::date`, payments.method).orderBy(asc(sql`${payments.paidAt}::date`), asc(payments.method));
    return document("monthly-collections", "Collections by Day and Payment Method", input, generatedBy,
      [{ key: "date", label: "Date", type: "date" }, { key: "method", label: "Method", type: "text" }, { key: "paymentCount", label: "Payments", type: "integer" }, { key: "amountCentavos", label: "Amount", type: "money" }],
      rows.map((row) => ({ ...row, amountCentavos: money(row.amountCentavos) })),
      [{ label: "Payments", value: rows.reduce((total, row) => total + Number(row.paymentCount), 0), type: "integer" }, { label: "Collections", value: sumMoney(rows.map((row) => row.amountCentavos)), type: "money" }]);
  }

  private async annualCollections(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const monthStart = sql<string>`date_trunc('month', ${payments.paidAt})::date`;
    const rows = await this.db.select({ monthStart, method: payments.method, paymentCount: sql<number>`count(*)::integer`, amountCentavos: sum(payments.amountCentavos) }).from(payments).where(and(eq(payments.status, "POSTED"), sql`${payments.paidAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).groupBy(monthStart, payments.method).orderBy(asc(monthStart), asc(payments.method));
    return document("annual-collections", "Annual Collections by Month and Payment Method (Currently Posted)", input, generatedBy,
      [{ key: "monthStart", label: "Month", type: "date", width: 18 }, { key: "method", label: "Method", type: "text" }, { key: "paymentCount", label: "Payments", type: "integer" }, { key: "amountCentavos", label: "Amount", type: "money" }],
      rows.map((row) => ({ ...row, amountCentavos: money(row.amountCentavos) })),
      [{ label: "Payments", value: rows.reduce((total, row) => total + Number(row.paymentCount), 0), type: "integer" }, { label: "Collections", value: sumMoney(rows.map((row) => row.amountCentavos)), type: "money" }]);
  }

  private async billingVsCollection(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const result = await this.db.execute<{
      monthStart: string; invoiceCount: number; billedCentavos: string;
      paymentCount: number; collectedCentavos: string; differenceCentavos: string;
    }>(sql`
      with events as (
        select date_trunc('month', ${invoices.invoiceDate}::timestamp)::date as month_start,
          1::bigint as invoice_count, ${invoices.totalCentavos} as billed_centavos,
          0::bigint as payment_count, 0::bigint as collected_centavos
        from ${invoices}
        where ${invoices.status} <> 'VOID'
          and ${invoices.invoiceDate} between ${input.dateFrom}::date and ${input.dateTo}::date
        union all
        select date_trunc('month', ${payments.paidAt})::date as month_start,
          0::bigint, 0::bigint, 1::bigint, ${payments.amountCentavos}
        from ${payments}
        where ${payments.status} = 'POSTED'
          and ${payments.paidAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date
      )
      select month_start::text as "monthStart", sum(invoice_count)::int as "invoiceCount",
        sum(billed_centavos)::text as "billedCentavos", sum(payment_count)::int as "paymentCount",
        sum(collected_centavos)::text as "collectedCentavos",
        (sum(billed_centavos) - sum(collected_centavos))::text as "differenceCentavos"
      from events group by month_start order by month_start
    `);
    const rows = result.rows;
    return document("billing-vs-collection", "Billing versus Collection by Month (Currently Posted)", input, generatedBy,
      [{ key: "monthStart", label: "Month", type: "date" }, { key: "invoiceCount", label: "Invoices", type: "integer" }, { key: "billedCentavos", label: "Billed", type: "money" }, { key: "paymentCount", label: "Payments", type: "integer" }, { key: "collectedCentavos", label: "Collected", type: "money" }, { key: "differenceCentavos", label: "Period difference", type: "money" }],
      rows, [{ label: "Invoices", value: rows.reduce((total, row) => total + Number(row.invoiceCount), 0), type: "integer" }, { label: "Billed", value: sumMoney(rows.map((row) => row.billedCentavos)), type: "money" }, { label: "Payments", value: rows.reduce((total, row) => total + Number(row.paymentCount), 0), type: "integer" }, { label: "Collected", value: sumMoney(rows.map((row) => row.collectedCentavos)), type: "money" }, { label: "Period difference", value: sumMoney(rows.map((row) => row.differenceCentavos)), type: "money" }]);
  }

  private async subscriberMaster(input: ReportParameters, generatedBy: string): Promise<ReportDocument> {
    const status = input.status ?? "ALL";
    const search = input.search?.trim() ?? "";
    if (!["ALL", "ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"].includes(status) || search.length > 100) throw new AppError(400, "INVALID_MASTER_FILTER", "Use a valid status and a search of at most 100 characters.");
    const result = await this.db.execute<{
      accountNumber: string; subscriberName: string; status: string; contact: string; address: string;
      area: string; collector: string; billingDay: number; dueDay: number;
      serviceCount: number; activeServiceCount: number; serviceTypes: string;
    }>(sql`
      select ${subscribers.accountNumber} as "accountNumber",
        concat_ws(' ', ${subscribers.firstName}, nullif(${subscribers.middleName}, ''), ${subscribers.lastName}, nullif(${subscribers.suffix}, '')) as "subscriberName",
        ${subscribers.status}::text as "status", coalesce(contact.value, '') as "contact",
        coalesce(address.value, '') as "address", coalesce(${collectionAreas.name}, '') as "area",
        coalesce(${collectors.displayName}, '') as "collector", ${subscribers.billingDay} as "billingDay",
        ${subscribers.dueDay} as "dueDay", service.count as "serviceCount",
        service.active_count as "activeServiceCount", service.types as "serviceTypes"
      from ${subscribers}
      left join ${collectionAreas} on ${collectionAreas.id} = ${subscribers.collectionAreaId}
      left join ${collectors} on ${collectors.id} = ${subscribers.assignedCollectorId}
      left join lateral (
        select ${subscriberContacts.value} as value from ${subscriberContacts}
        where ${subscriberContacts.subscriberId} = ${subscribers.id} and ${subscriberContacts.isActive}
        order by ${subscriberContacts.isPrimary} desc, ${subscriberContacts.createdAt} desc, ${subscriberContacts.id} limit 1
      ) contact on true
      left join lateral (
        select concat_ws(', ', ${subscriberAddresses.line1}, ${subscriberAddresses.barangay}, ${subscriberAddresses.cityMunicipality}, ${subscriberAddresses.province}) as value
        from ${subscriberAddresses}
        where ${subscriberAddresses.subscriberId} = ${subscribers.id} and ${subscriberAddresses.isActive}
        order by ${subscriberAddresses.isPrimary} desc, ${subscriberAddresses.updatedAt} desc, ${subscriberAddresses.id} limit 1
      ) address on true
      left join lateral (
        select count(*)::int as count,
          count(*) filter (where ${serviceAccounts.status} = 'ACTIVE')::int as active_count,
          coalesce(string_agg(distinct ${serviceTypes.name}, ', ' order by ${serviceTypes.name}), '') as types
        from ${serviceAccounts}
        join ${servicePlans} on ${servicePlans.id} = ${serviceAccounts.planId}
        join ${serviceTypes} on ${serviceTypes.id} = ${servicePlans.serviceTypeId}
        where ${serviceAccounts.subscriberId} = ${subscribers.id}
      ) service on true
      where (${status} = 'ALL' or ${subscribers.status}::text = ${status})
        and (${search} = '' or position(lower(${search}) in lower(${subscribers.accountNumber})) > 0
          or position(lower(${search}) in lower(concat_ws(' ', ${subscribers.firstName}, ${subscribers.middleName}, ${subscribers.lastName}, ${subscribers.suffix}))) > 0)
      order by ${subscribers.accountNumber}
    `);
    const rows = result.rows;
    return document("subscriber-master", "Subscriber Master List", { status, ...(search ? { search } : {}) }, generatedBy,
      [{ key: "accountNumber", label: "Account", type: "text", width: 20 }, { key: "subscriberName", label: "Subscriber", type: "text", width: 26 }, { key: "status", label: "Status", type: "text" }, { key: "contact", label: "Primary contact", type: "text", width: 20 }, { key: "address", label: "Primary address", type: "text", width: 42 }, { key: "area", label: "Area", type: "text" }, { key: "collector", label: "Collector", type: "text" }, { key: "billingDay", label: "Bill day", type: "integer" }, { key: "dueDay", label: "Due day", type: "integer" }, { key: "serviceCount", label: "Services", type: "integer" }, { key: "activeServiceCount", label: "Active services", type: "integer" }, { key: "serviceTypes", label: "Service types", type: "text", width: 24 }],
      rows, [{ label: "Subscribers", value: rows.length, type: "integer" }, { label: "Active subscribers", value: rows.filter((row) => row.status === "ACTIVE").length, type: "integer" }, { label: "Inactive or closed subscribers", value: rows.filter((row) => row.status !== "ACTIVE").length, type: "integer" }, { label: "Service accounts", value: rows.reduce((total, row) => total + row.serviceCount, 0), type: "integer" }, { label: "Active services", value: rows.reduce((total, row) => total + row.activeServiceCount, 0), type: "integer" }]);
  }

  private async arAging(asOf: string, generatedBy: string): Promise<ReportDocument> {
    const aging = await this.receivables.aging(asOf);
    const rows = [
      { bucket: "Current", amountCentavos: aging.currentCentavos }, { bucket: "1–30 days", amountCentavos: aging.days1To30Centavos }, { bucket: "31–60 days", amountCentavos: aging.days31To60Centavos }, { bucket: "61–90 days", amountCentavos: aging.days61To90Centavos }, { bucket: "91+ days", amountCentavos: aging.days91PlusCentavos }
    ];
    return document("ar-aging", "Accounts Receivable Aging", { asOf }, generatedBy,
      [{ key: "bucket", label: "Aging Bucket", type: "text", width: 24 }, { key: "amountCentavos", label: "Outstanding", type: "money", width: 18 }], rows,
      [{ label: "Open invoices", value: aging.invoiceCount, type: "integer" }, { label: "Total outstanding", value: aging.totalCentavos, type: "money" }]);
  }

  private async subscriberSoa(input: { subscriberId: string; dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const [subscriber] = await this.db.select({ id: subscribers.id, accountNumber: subscribers.accountNumber, name: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}` }).from(subscribers).where(eq(subscribers.id, input.subscriberId)).limit(1);
    if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
    const [openingResult, entries] = await Promise.all([
      this.db.select({ debit: sum(ledgerEntries.debitCentavos), credit: sum(ledgerEntries.creditCentavos) }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, input.subscriberId), sql`${ledgerEntries.occurredAt}::date < ${input.dateFrom}::date`)),
      this.db.select({ date: sql<string>`${ledgerEntries.occurredAt}::date`, type: ledgerEntries.type, description: ledgerEntries.description, debitCentavos: ledgerEntries.debitCentavos, creditCentavos: ledgerEntries.creditCentavos }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, input.subscriberId), sql`${ledgerEntries.occurredAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id))
    ]);
    const opening = BigInt(openingResult[0]?.debit ?? 0) - BigInt(openingResult[0]?.credit ?? 0);
    const statement = buildStatementBalances(opening, entries);
    const rows = statement.rows.map((entry) => ({ ...entry, debitCentavos: entry.debitCentavos.toString(), creditCentavos: entry.creditCentavos.toString(), balanceCentavos: entry.balanceCentavos.toString() }));
    return document("subscriber-soa", `Statement of Account — ${subscriber.accountNumber} — ${subscriber.name}`, input, generatedBy,
      [{ key: "date", label: "Date", type: "date" }, { key: "type", label: "Type", type: "text" }, { key: "description", label: "Description", type: "text", width: 36 }, { key: "debitCentavos", label: "Debit", type: "money" }, { key: "creditCentavos", label: "Credit", type: "money" }, { key: "balanceCentavos", label: "Balance", type: "money" }], rows,
      [{ label: "Opening balance", value: opening.toString(), type: "money" }, { label: "Closing balance", value: statement.closingCentavos.toString(), type: "money" }]);
  }

  private async subscriberLedger(input: { subscriberId: string; dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const snapshot = await this.db.transaction(async (transaction) => {
      const [subscriber] = await transaction.select({ accountNumber: subscribers.accountNumber, name: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}` }).from(subscribers).where(eq(subscribers.id, input.subscriberId)).limit(1);
      if (!subscriber) throw new AppError(404, "SUBSCRIBER_NOT_FOUND", "The subscriber was not found.");
      const [openingResult] = await transaction.select({ debit: sum(ledgerEntries.debitCentavos), credit: sum(ledgerEntries.creditCentavos) }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, input.subscriberId), sql`${ledgerEntries.occurredAt}::date < ${input.dateFrom}::date`));
      const entries = await transaction.select({ sequenceNumber: ledgerEntries.sequenceNumber, occurredAt: ledgerEntries.occurredAt, type: ledgerEntries.type, description: ledgerEntries.description, debitCentavos: ledgerEntries.debitCentavos, creditCentavos: ledgerEntries.creditCentavos }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, input.subscriberId), sql`${ledgerEntries.occurredAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id));
      return { subscriber, opening: BigInt(openingResult?.debit ?? 0) - BigInt(openingResult?.credit ?? 0), entries };
    }, { isolationLevel: "repeatable read" });
    const statement = buildStatementBalances(snapshot.opening, snapshot.entries);
    const rows = statement.rows.map((entry) => ({ postingTime: entry.occurredAt.toISOString(), sequenceNumber: entry.sequenceNumber.toString(), type: entry.type, description: entry.description, debitCentavos: entry.debitCentavos.toString(), creditCentavos: entry.creditCentavos.toString(), balanceCentavos: entry.balanceCentavos.toString() }));
    return document("subscriber-ledger", `Subscriber Ledger — ${snapshot.subscriber.accountNumber} — ${snapshot.subscriber.name}`, input, generatedBy,
      [{ key: "postingTime", label: "Posting time (UTC)", type: "text", width: 26 }, { key: "sequenceNumber", label: "Sequence", type: "text", width: 14 }, { key: "type", label: "Type", type: "text", width: 20 }, { key: "description", label: "Reference / description", type: "text", width: 32 }, { key: "debitCentavos", label: "Debit", type: "money" }, { key: "creditCentavos", label: "Credit", type: "money" }, { key: "balanceCentavos", label: "Running balance", type: "money" }], rows,
      [{ label: "Entries", value: rows.length, type: "integer" }, { label: "Opening balance", value: snapshot.opening.toString(), type: "money" }, { label: "Debits", value: sumMoney(snapshot.entries.map((entry) => entry.debitCentavos)), type: "money" }, { label: "Credits", value: sumMoney(snapshot.entries.map((entry) => entry.creditCentavos)), type: "money" }, { label: "Closing balance", value: statement.closingCentavos.toString(), type: "money" }]);
  }

  private async collectorAssignments(asOf: string, generatedBy: string): Promise<ReportDocument> {
    validateReportRange(asOf, asOf);
    const rows = await this.db.select({
      accountNumber: subscribers.accountNumber,
      subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`,
      subscriberStatus: subscribers.status,
      serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      serviceStatus: serviceAccounts.status,
      collector: collectors.displayName,
      route: collectionRoutes.name,
      area: collectionAreas.name,
      effectiveFrom: collectorAssignments.effectiveFrom,
      effectiveTo: collectorAssignments.effectiveTo
    }).from(collectorAssignments)
      .innerJoin(serviceAccounts, eq(collectorAssignments.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(collectors, eq(collectorAssignments.collectorId, collectors.id))
      .leftJoin(collectionRoutes, eq(collectorAssignments.routeId, collectionRoutes.id))
      .leftJoin(collectionAreas, eq(collectionRoutes.areaId, collectionAreas.id))
      .where(and(lte(collectorAssignments.effectiveFrom, asOf), sql`(${collectorAssignments.effectiveTo} is null or ${collectorAssignments.effectiveTo} > ${asOf}::date)`))
      .orderBy(asc(collectors.displayName), asc(collectionRoutes.name), asc(serviceAccounts.serviceAccountNumber));
    return document("collector-assignments", "Collector Assignments as of Date", { asOf }, generatedBy,
      [{ key: "accountNumber", label: "Subscriber account", type: "text", width: 20 }, { key: "subscriberName", label: "Subscriber", type: "text", width: 26 }, { key: "subscriberStatus", label: "Current subscriber status", type: "text" }, { key: "serviceAccountNumber", label: "Service account", type: "text", width: 20 }, { key: "serviceStatus", label: "Current service status", type: "text" }, { key: "collector", label: "Collector", type: "text" }, { key: "route", label: "Route", type: "text" }, { key: "area", label: "Area", type: "text" }, { key: "effectiveFrom", label: "Effective from", type: "date" }, { key: "effectiveTo", label: "Effective to (exclusive)", type: "date" }],
      rows.map((row) => ({ ...row, route: row.route ?? "", area: row.area ?? "", effectiveTo: row.effectiveTo ?? "" })),
      [{ label: "Assigned services", value: rows.length, type: "integer" }, { label: "Distinct subscribers", value: new Set(rows.map((row) => row.accountNumber)).size, type: "integer" }, { label: "Collectors", value: new Set(rows.map((row) => row.collector)).size, type: "integer" }]);
  }

  private async collectorPerformance(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const result = await this.db.execute<{
      collector: string; batchCount: number; accountCount: number; collectedAccountCount: number;
      expectedCentavos: string; collectedCentavos: string; remittedCentavos: string;
      confirmedDifferenceCentavos: string; unremittedBatches: number; unresolvedDifferenceBatches: number; totalsMismatchBatches: number;
    }>(sql`
      with account_totals as (
        select ${collectionBatchAccounts.batchId} as batch_id,
          count(*)::int as account_count,
          count(*) filter (where ${collectionBatchAccounts.status} = 'COLLECTED')::int as collected_account_count,
          sum(${collectionBatchAccounts.expectedCentavos}) as expected_centavos,
          sum(${collectionBatchAccounts.collectedCentavos}) as collected_centavos
        from ${collectionBatchAccounts}
        group by ${collectionBatchAccounts.batchId}
      )
      select ${collectors.displayName} as collector,
        count(*)::int as "batchCount",
        coalesce(sum(coalesce(account_totals.account_count, 0)), 0)::int as "accountCount",
        coalesce(sum(coalesce(account_totals.collected_account_count, 0)), 0)::int as "collectedAccountCount",
        coalesce(sum(${collectionBatches.expectedCashCentavos}), 0)::text as "expectedCentavos",
        coalesce(sum(${collectionBatches.collectedCashCentavos}), 0)::text as "collectedCentavos",
        coalesce(sum(${collectionBatches.remittedCashCentavos}), 0)::text as "remittedCentavos",
        coalesce(sum(case when ${collectorRemittances.id} is not null then ${collectionBatches.differenceCentavos} else 0 end), 0)::text as "confirmedDifferenceCentavos",
        count(*) filter (where ${collectorRemittances.id} is null)::int as "unremittedBatches",
        count(*) filter (where ${collectorRemittances.id} is not null and ${collectionBatches.differenceCentavos} <> 0)::int as "unresolvedDifferenceBatches",
        count(*) filter (where coalesce(account_totals.expected_centavos, 0) <> ${collectionBatches.expectedCashCentavos}
          or coalesce(account_totals.collected_centavos, 0) <> ${collectionBatches.collectedCashCentavos})::int as "totalsMismatchBatches"
      from ${collectionBatches}
      join ${collectors} on ${collectors.id} = ${collectionBatches.collectorId}
      left join ${collectorRemittances} on ${collectorRemittances.batchId} = ${collectionBatches.id}
      left join account_totals on account_totals.batch_id = ${collectionBatches.id}
      where ${collectionBatches.collectionDate} between ${input.dateFrom}::date and ${input.dateTo}::date
      group by ${collectors.id}, ${collectors.displayName}
      order by ${collectors.displayName}, ${collectors.id}
    `);
    const rows = result.rows;
    return document("collector-performance", "Collector Performance by Batch Date (Current State)", input, generatedBy,
      [{ key: "collector", label: "Collector", type: "text", width: 25 }, { key: "batchCount", label: "Batches", type: "integer" }, { key: "accountCount", label: "Assigned accounts", type: "integer" }, { key: "collectedAccountCount", label: "Collected accounts", type: "integer" }, { key: "expectedCentavos", label: "Expected Cash", type: "money" }, { key: "collectedCentavos", label: "Collected Cash", type: "money" }, { key: "remittedCentavos", label: "Remitted Cash", type: "money" }, { key: "confirmedDifferenceCentavos", label: "Confirmed difference", type: "money" }, { key: "unremittedBatches", label: "Unremitted batches", type: "integer" }, { key: "unresolvedDifferenceBatches", label: "Unresolved difference batches", type: "integer" }, { key: "totalsMismatchBatches", label: "Totals mismatch batches", type: "integer" }],
      rows, [{ label: "Collectors", value: rows.length, type: "integer" }, { label: "Batches", value: rows.reduce((total, row) => total + row.batchCount, 0), type: "integer" }, { label: "Assigned accounts", value: rows.reduce((total, row) => total + row.accountCount, 0), type: "integer" }, { label: "Collected accounts", value: rows.reduce((total, row) => total + row.collectedAccountCount, 0), type: "integer" }, { label: "Expected Cash", value: sumMoney(rows.map((row) => row.expectedCentavos)), type: "money" }, { label: "Collected Cash", value: sumMoney(rows.map((row) => row.collectedCentavos)), type: "money" }, { label: "Remitted Cash", value: sumMoney(rows.map((row) => row.remittedCentavos)), type: "money" }, { label: "Confirmed difference", value: sumMoney(rows.map((row) => row.confirmedDifferenceCentavos)), type: "money" }, { label: "Unremitted batches", value: rows.reduce((total, row) => total + row.unremittedBatches, 0), type: "integer" }, { label: "Unresolved difference batches", value: rows.reduce((total, row) => total + row.unresolvedDifferenceBatches, 0), type: "integer" }, { label: "Totals mismatch batches", value: rows.reduce((total, row) => total + row.totalsMismatchBatches, 0), type: "integer" }]);
  }

  private async collectorReconciliation(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const accounts = this.db.select({
      batchId: collectionBatchAccounts.batchId,
      count: sql<number>`count(*)::int`.as("account_count"),
      collectedCount: sql<number>`count(*) filter (where ${collectionBatchAccounts.status} = 'COLLECTED')::int`.as("collected_account_count"),
      expected: sql<bigint>`sum(${collectionBatchAccounts.expectedCentavos})`.as("account_expected_centavos"),
      collected: sql<bigint>`sum(${collectionBatchAccounts.collectedCentavos})`.as("account_collected_centavos")
    }).from(collectionBatchAccounts).groupBy(collectionBatchAccounts.batchId).as("report_batch_accounts");
    const rows = await this.db.select({
      batchNumber: collectionBatches.batchNumber, date: collectionBatches.collectionDate,
      collector: collectors.displayName, route: collectionRoutes.name, status: collectionBatches.status,
      expectedCentavos: collectionBatches.expectedCashCentavos, collectedCentavos: collectionBatches.collectedCashCentavos,
      remittedCentavos: collectionBatches.remittedCashCentavos, nonCashCentavos: collectionBatches.nonCashCentavos,
      differenceCentavos: collectionBatches.differenceCentavos, remittanceNumber: collectorRemittances.remittanceNumber,
      accountCount: accounts.count, collectedAccountCount: accounts.collectedCount,
      accountExpectedCentavos: accounts.expected, accountCollectedCentavos: accounts.collected
    }).from(collectionBatches)
      .innerJoin(collectors, eq(collectionBatches.collectorId, collectors.id))
      .innerJoin(collectionRoutes, eq(collectionBatches.routeId, collectionRoutes.id))
      .leftJoin(collectorRemittances, eq(collectorRemittances.batchId, collectionBatches.id))
      .leftJoin(accounts, eq(accounts.batchId, collectionBatches.id))
      .where(sql`${collectionBatches.collectionDate} between ${input.dateFrom}::date and ${input.dateTo}::date`)
      .orderBy(desc(collectionBatches.collectionDate), asc(collectionBatches.batchNumber));
    const serialized = rows.map((row) => {
      const accountExpected = BigInt(row.accountExpectedCentavos ?? 0);
      const accountCollected = BigInt(row.accountCollectedCentavos ?? 0);
      const totalsMatch = accountExpected === row.expectedCentavos && accountCollected === row.collectedCentavos;
      const difference = row.differenceCentavos;
      const remittanceState = !row.remittanceNumber ? "NOT REMITTED" : difference < 0n ? "SHORTAGE" : difference > 0n ? "OVERAGE" : "BALANCED";
      return {
        batchNumber: row.batchNumber, date: row.date, collector: row.collector, route: row.route, status: row.status,
        accountCount: row.accountCount ?? 0, collectedAccountCount: row.collectedAccountCount ?? 0,
        expectedCentavos: row.expectedCentavos.toString(), collectedCentavos: row.collectedCentavos.toString(),
        remittedCentavos: row.remittedCentavos.toString(), nonCashCentavos: row.nonCashCentavos.toString(),
        uncollectedCentavos: (accountExpected - accountCollected).toString(), differenceCentavos: difference.toString(),
        exception: totalsMatch ? remittanceState : `TOTALS MISMATCH / ${remittanceState}`
      };
    });
    return document("collector-reconciliation", "Collector Reconciliation", input, generatedBy,
      [{ key: "batchNumber", label: "Batch", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "collector", label: "Collector", type: "text" }, { key: "route", label: "Route", type: "text" }, { key: "status", label: "Status", type: "text" }, { key: "accountCount", label: "Accounts", type: "integer" }, { key: "collectedAccountCount", label: "Accounts collected", type: "integer" }, { key: "expectedCentavos", label: "Expected Cash", type: "money" }, { key: "collectedCentavos", label: "Collected Cash", type: "money" }, { key: "remittedCentavos", label: "Remitted Cash", type: "money" }, { key: "nonCashCentavos", label: "Non-cash", type: "money" }, { key: "uncollectedCentavos", label: "Uncollected", type: "money" }, { key: "differenceCentavos", label: "Difference", type: "money" }, { key: "exception", label: "Exception / remittance state", type: "text" }], serialized,
      [{ label: "Batches", value: rows.length, type: "integer" }, { label: "Expected Cash", value: sumMoney(rows.map((row) => row.expectedCentavos)), type: "money" }, { label: "Collected Cash", value: sumMoney(rows.map((row) => row.collectedCentavos)), type: "money" }, { label: "Remitted Cash", value: sumMoney(rows.map((row) => row.remittedCentavos)), type: "money" }, { label: "Non-cash", value: sumMoney(rows.map((row) => row.nonCashCentavos)), type: "money" }, { label: "Uncollected", value: sumMoney(serialized.map((row) => row.uncollectedCentavos)), type: "money" }, { label: "Accounts collected", value: serialized.reduce((total, row) => total + row.collectedAccountCount, 0), type: "integer" }, { label: "Confirmed difference", value: sumMoney(rows.filter((row) => row.remittanceNumber).map((row) => row.differenceCentavos)), type: "money" }, { label: "Shortage / overage batches", value: rows.filter((row) => row.remittanceNumber && row.differenceCentavos !== 0n).length, type: "integer" }, { label: "Totals mismatch batches", value: serialized.filter((row) => row.exception.startsWith("TOTALS MISMATCH")).length, type: "integer" }]);
  }
}

function document(code: ReportCode, title: string, parameters: Record<string, string>, generatedBy: string, columns: ReportDocument["columns"], rows: ReportDocument["rows"], summary: ReportDocument["summary"]): ReportDocument { return { code, title, parameters, generatedAt: new Date().toISOString(), generatedBy, columns, rows, summary }; }
function requireRange(input: ReportParameters, maximumDays = 366) { if (!input.dateFrom || !input.dateTo) throw new AppError(400, "REPORT_PARAMETERS_REQUIRED", "Start and end dates are required."); validateReportRange(input.dateFrom, input.dateTo, maximumDays); return { dateFrom: input.dateFrom, dateTo: input.dateTo }; }
function requireCalendarYear(input: ReportParameters) { const range = requireRange(input); if (!/^\d{4}-01-01$/.test(range.dateFrom) || range.dateTo !== `${range.dateFrom.slice(0, 4)}-12-31`) throw new AppError(400, "INVALID_REPORT_YEAR", "Select one complete calendar year."); return range; }
function requireAsOf(input: ReportParameters) { if (!input.asOf) throw new AppError(400, "REPORT_PARAMETERS_REQUIRED", "An as-of date is required."); return input.asOf; }
function requireSoa(input: ReportParameters) { const range = requireRange(input); if (!input.subscriberId) throw new AppError(400, "REPORT_PARAMETERS_REQUIRED", "Select a subscriber for the statement."); return { ...range, subscriberId: input.subscriberId }; }
function money(value: unknown): string { return BigInt(value as string | number | bigint | null ?? 0).toString(); }
function sumMoney(values: unknown[]): string { return sumCentavos(values as Array<bigint | string | number | null | undefined>).toString(); }
