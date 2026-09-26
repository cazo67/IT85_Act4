import { and, asc, count, desc, eq, inArray, lt, lte, ne, sql, sum } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import { auditLogs, collectionBatches, collectionRoutes, collectors, invoices, ledgerEntries, payments, serviceAccounts, subscribers } from "../../db/schema/index.js";
import { renderReportPdf, renderReportXlsx } from "../../infrastructure/reports/report-renderers.js";
import { reportDefinitions, type ReportCode, type ReportDocument } from "../../infrastructure/reports/report-model.js";
import { ReceivableService } from "../receivables/receivable-service.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { buildStatementBalances, safeReportFilename, sumCentavos, validateReportRange } from "./report-rules.js";

export interface ReportParameters { asOf?: string | undefined; dateFrom?: string | undefined; dateTo?: string | undefined; subscriberId?: string | undefined; }

export class ReportService {
  private readonly receivables: ReceivableService;
  constructor(private readonly db: BcisDatabase) { this.receivables = new ReceivableService(db); }

  definitions() { return reportDefinitions; }

  async dashboard(asOf: string) {
    const monthStart = `${asOf.slice(0, 7)}-01`;
    const [[billed], [collected], serviceCounts, [openBatches], aging] = await Promise.all([
      this.db.select({ amount: sum(invoices.totalCentavos), value: count() }).from(invoices).where(and(ne(invoices.status, "VOID"), sql`${invoices.invoiceDate} between ${monthStart}::date and ${asOf}::date`)),
      this.db.select({ amount: sum(payments.amountCentavos), value: count() }).from(payments).where(and(sql`${payments.paidAt}::date between ${monthStart}::date and ${asOf}::date`, sql`(${payments.reversedAt} is null or ${payments.reversedAt}::date > ${asOf}::date)`)),
      this.db.select({ status: serviceAccounts.status, value: count() }).from(serviceAccounts).where(inArray(serviceAccounts.status, ["ACTIVE", "SUSPENDED"])).groupBy(serviceAccounts.status),
      this.db.select({ value: count() }).from(collectionBatches).where(ne(collectionBatches.status, "CLOSED")),
      this.receivables.aging(asOf)
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
      aging
    };
  }

  async run(code: ReportCode, parameters: ReportParameters, generatedBy: string): Promise<ReportDocument> {
    if (code === "monthly-collections") return this.monthlyCollections(requireRange(parameters), generatedBy);
    if (code === "ar-aging") return this.arAging(requireAsOf(parameters), generatedBy);
    if (code === "subscriber-soa") return this.subscriberSoa(requireSoa(parameters), generatedBy);
    return this.collectorReconciliation(requireRange(parameters), generatedBy);
  }

  async export(code: ReportCode, parameters: ReportParameters, format: "pdf" | "xlsx", generatedBy: string, actor: SecurityActor) {
    const report = await this.run(code, parameters, generatedBy);
    const buffer = format === "pdf" ? await renderReportPdf(report) : await renderReportXlsx(report);
    await this.db.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "report.export", entityType: "report", entityId: code, requestId: actor.requestId ?? null, afterValues: { format, parameters: report.parameters, rowCount: report.rows.length, sizeBytes: buffer.length } });
    const suffix = report.parameters.asOf ?? `${report.parameters.dateFrom ?? ""}-${report.parameters.dateTo ?? ""}`;
    return { buffer, filename: safeReportFilename(code, suffix, format), mediaType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  private async monthlyCollections(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const rows = await this.db.select({ date: sql<string>`${payments.paidAt}::date`, method: payments.method, paymentCount: sql<number>`count(*)::integer`, amountCentavos: sum(payments.amountCentavos) }).from(payments).where(and(eq(payments.status, "POSTED"), sql`${payments.paidAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).groupBy(sql`${payments.paidAt}::date`, payments.method).orderBy(asc(sql`${payments.paidAt}::date`), asc(payments.method));
    return document("monthly-collections", "Collections by Day and Payment Method", input, generatedBy,
      [{ key: "date", label: "Date", type: "date" }, { key: "method", label: "Method", type: "text" }, { key: "paymentCount", label: "Payments", type: "integer" }, { key: "amountCentavos", label: "Amount", type: "money" }],
      rows.map((row) => ({ ...row, amountCentavos: money(row.amountCentavos) })),
      [{ label: "Payments", value: rows.reduce((total, row) => total + Number(row.paymentCount), 0), type: "integer" }, { label: "Collections", value: sumMoney(rows.map((row) => row.amountCentavos)), type: "money" }]);
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
      this.db.select({ debit: sum(ledgerEntries.debitCentavos), credit: sum(ledgerEntries.creditCentavos) }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, input.subscriberId), lt(ledgerEntries.occurredAt, new Date(`${input.dateFrom}T00:00:00.000Z`)))),
      this.db.select({ date: sql<string>`${ledgerEntries.occurredAt}::date`, type: ledgerEntries.type, description: ledgerEntries.description, debitCentavos: ledgerEntries.debitCentavos, creditCentavos: ledgerEntries.creditCentavos }).from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, input.subscriberId), sql`${ledgerEntries.occurredAt}::date between ${input.dateFrom}::date and ${input.dateTo}::date`)).orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id))
    ]);
    const opening = BigInt(openingResult[0]?.debit ?? 0) - BigInt(openingResult[0]?.credit ?? 0);
    const statement = buildStatementBalances(opening, entries);
    const rows = statement.rows.map((entry) => ({ ...entry, debitCentavos: entry.debitCentavos.toString(), creditCentavos: entry.creditCentavos.toString(), balanceCentavos: entry.balanceCentavos.toString() }));
    return document("subscriber-soa", `Statement of Account — ${subscriber.accountNumber} — ${subscriber.name}`, input, generatedBy,
      [{ key: "date", label: "Date", type: "date" }, { key: "type", label: "Type", type: "text" }, { key: "description", label: "Description", type: "text", width: 36 }, { key: "debitCentavos", label: "Debit", type: "money" }, { key: "creditCentavos", label: "Credit", type: "money" }, { key: "balanceCentavos", label: "Balance", type: "money" }], rows,
      [{ label: "Opening balance", value: opening.toString(), type: "money" }, { label: "Closing balance", value: statement.closingCentavos.toString(), type: "money" }]);
  }

  private async collectorReconciliation(input: { dateFrom: string; dateTo: string }, generatedBy: string): Promise<ReportDocument> {
    const rows = await this.db.select({ batchNumber: collectionBatches.batchNumber, date: collectionBatches.collectionDate, collector: collectors.displayName, route: collectionRoutes.name, status: collectionBatches.status, expectedCentavos: collectionBatches.expectedCashCentavos, collectedCentavos: collectionBatches.collectedCashCentavos, remittedCentavos: collectionBatches.remittedCashCentavos, differenceCentavos: collectionBatches.differenceCentavos }).from(collectionBatches).innerJoin(collectors, eq(collectionBatches.collectorId, collectors.id)).innerJoin(collectionRoutes, eq(collectionBatches.routeId, collectionRoutes.id)).where(sql`${collectionBatches.collectionDate} between ${input.dateFrom}::date and ${input.dateTo}::date`).orderBy(desc(collectionBatches.collectionDate), asc(collectionBatches.batchNumber));
    const serialized = rows.map((row) => ({ ...row, expectedCentavos: row.expectedCentavos.toString(), collectedCentavos: row.collectedCentavos.toString(), remittedCentavos: row.remittedCentavos.toString(), differenceCentavos: row.differenceCentavos.toString() }));
    return document("collector-reconciliation", "Collector Reconciliation", input, generatedBy,
      [{ key: "batchNumber", label: "Batch", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "collector", label: "Collector", type: "text" }, { key: "route", label: "Route", type: "text" }, { key: "status", label: "Status", type: "text" }, { key: "expectedCentavos", label: "Expected", type: "money" }, { key: "collectedCentavos", label: "Collected", type: "money" }, { key: "remittedCentavos", label: "Remitted", type: "money" }, { key: "differenceCentavos", label: "Difference", type: "money" }], serialized,
      [{ label: "Batches", value: rows.length, type: "integer" }, { label: "Collected", value: sumMoney(rows.map((row) => row.collectedCentavos)), type: "money" }, { label: "Difference", value: sumMoney(rows.map((row) => row.differenceCentavos)), type: "money" }]);
  }
}

function document(code: ReportCode, title: string, parameters: Record<string, string>, generatedBy: string, columns: ReportDocument["columns"], rows: ReportDocument["rows"], summary: ReportDocument["summary"]): ReportDocument { return { code, title, parameters, generatedAt: new Date().toISOString(), generatedBy, columns, rows, summary }; }
function requireRange(input: ReportParameters) { if (!input.dateFrom || !input.dateTo) throw new AppError(400, "REPORT_PARAMETERS_REQUIRED", "Start and end dates are required."); validateReportRange(input.dateFrom, input.dateTo); return { dateFrom: input.dateFrom, dateTo: input.dateTo }; }
function requireAsOf(input: ReportParameters) { if (!input.asOf) throw new AppError(400, "REPORT_PARAMETERS_REQUIRED", "An as-of date is required."); return input.asOf; }
function requireSoa(input: ReportParameters) { const range = requireRange(input); if (!input.subscriberId) throw new AppError(400, "REPORT_PARAMETERS_REQUIRED", "Select a subscriber for the statement."); return { ...range, subscriberId: input.subscriberId }; }
function money(value: unknown): string { return BigInt(value as string | number | bigint | null ?? 0).toString(); }
function sumMoney(values: unknown[]): string { return sumCentavos(values as Array<bigint | string | number | null | undefined>).toString(); }
