import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { renderReportPdf, renderReportXlsx } from "../infrastructure/reports/report-renderers.js";
import type { ReportDocument } from "../infrastructure/reports/report-model.js";

const outputDirectory = resolve(import.meta.dirname, "../../../../../reports-samples");
const generatedAt = "2026-09-22T12:00:00.000Z";
const common = { generatedAt, generatedBy: "BCIS Sample Generator" };
const samples: ReportDocument[] = [
  {
    ...common, code: "monthly-collections", title: "Collections by Day and Payment Method", parameters: { dateFrom: "2026-09-01", dateTo: "2026-09-22" },
    columns: [{ key: "date", label: "Date", type: "date" }, { key: "method", label: "Method", type: "text" }, { key: "paymentCount", label: "Payments", type: "integer" }, { key: "amountCentavos", label: "Amount", type: "money" }],
    rows: [{ date: "2026-09-21", method: "CASH", paymentCount: 18, amountCentavos: "2450000" }, { date: "2026-09-22", method: "CASH", paymentCount: 22, amountCentavos: "3185000" }],
    summary: [{ label: "Payments", value: 40, type: "integer" }, { label: "Collections", value: "5635000", type: "money" }]
  },
  {
    ...common, code: "ar-aging", title: "Accounts Receivable Aging", parameters: { asOf: "2026-09-22" },
    columns: [{ key: "bucket", label: "Aging Bucket", type: "text" }, { key: "amountCentavos", label: "Outstanding", type: "money" }],
    rows: [{ bucket: "Current", amountCentavos: "4200000" }, { bucket: "1–30 days", amountCentavos: "1750000" }, { bucket: "31–60 days", amountCentavos: "640000" }, { bucket: "61–90 days", amountCentavos: "275000" }, { bucket: "91+ days", amountCentavos: "130000" }],
    summary: [{ label: "Open invoices", value: 74, type: "integer" }, { label: "Total outstanding", value: "6995000", type: "money" }]
  },
  {
    ...common, code: "subscriber-soa", title: "Statement of Account — SAMPLE-0001 — Juan Dela Cruz", parameters: { subscriberId: "sanitized-sample", dateFrom: "2026-09-01", dateTo: "2026-09-22" },
    columns: [{ key: "date", label: "Date", type: "date" }, { key: "type", label: "Type", type: "text" }, { key: "description", label: "Description", type: "text" }, { key: "debitCentavos", label: "Debit", type: "money" }, { key: "creditCentavos", label: "Credit", type: "money" }, { key: "balanceCentavos", label: "Balance", type: "money" }],
    rows: [{ date: "2026-09-01", type: "INVOICE_DEBIT", description: "September plan service", debitCentavos: "99900", creditCentavos: "0", balanceCentavos: "99900" }, { date: "2026-09-15", type: "PAYMENT_CREDIT", description: "Cash payment SAMPLE-PAY-001", debitCentavos: "0", creditCentavos: "99900", balanceCentavos: "0" }],
    summary: [{ label: "Opening balance", value: "0", type: "money" }, { label: "Closing balance", value: "0", type: "money" }]
  },
  {
    ...common, code: "collector-reconciliation", title: "Collector Reconciliation", parameters: { dateFrom: "2026-09-01", dateTo: "2026-09-22" },
    columns: [{ key: "batchNumber", label: "Batch", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "collector", label: "Collector", type: "text" }, { key: "route", label: "Route", type: "text" }, { key: "status", label: "Status", type: "text" }, { key: "collectedCentavos", label: "Collected", type: "money" }, { key: "remittedCentavos", label: "Remitted", type: "money" }, { key: "differenceCentavos", label: "Difference", type: "money" }],
    rows: [{ batchNumber: "BAT-SAMPLE-001", date: "2026-09-22", collector: "Sample Collector", route: "Sample Route", status: "CLOSED", collectedCentavos: "2000000", remittedCentavos: "2000000", differenceCentavos: "0" }],
    summary: [{ label: "Batches", value: 1, type: "integer" }, { label: "Collected", value: "2000000", type: "money" }, { label: "Difference", value: "0", type: "money" }]
  }
];

await mkdir(outputDirectory, { recursive: true });
for (const report of samples) {
  const [pdf, xlsx] = await Promise.all([renderReportPdf(report), renderReportXlsx(report)]);
  await Promise.all([writeFile(resolve(outputDirectory, `${report.code}-sample.pdf`), pdf), writeFile(resolve(outputDirectory, `${report.code}-sample.xlsx`), xlsx)]);
}
