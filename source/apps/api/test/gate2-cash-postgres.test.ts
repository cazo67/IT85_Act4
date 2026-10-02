import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { servicePlans, userRoles, users } from "../src/db/schema/index.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { PostgresAuthStore } from "../src/modules/auth/postgres-auth-store.js";
import { BillingService } from "../src/modules/billing/billing-service.js";
import { PaymentService } from "../src/modules/payments/payment-service.js";
import { ReceivableService } from "../src/modules/receivables/receivable-service.js";
import { ReportService } from "../src/modules/reports/report-service.js";
import { SubscriberService } from "../src/modules/subscribers/subscriber-service.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";

describe.skipIf(!testUri)("Gate 2 Cash PostgreSQL integration", () => {
  let database: DatabaseHandle | undefined;
  let assertions: Pool | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeAll(async () => {
    const targetUrl = new URL(testUri);
    if (targetUrl.hostname !== "127.0.0.1" || targetUrl.port !== "5433" || targetUrl.pathname !== "/bcis_test") {
      throw new Error("Gate 2 integration tests require 127.0.0.1:5433/bcis_test.");
    }
    assertions = new Pool({ connectionString: testUri, max: 2 });
    const target = await assertions.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (target.rows[0]?.name !== "bcis_test" || target.rows[0]?.migrations !== 15) {
      throw new Error("The isolated test database must have all 15 migrations.");
    }
    database = createDatabase(testUri);
    app = await makeApp(database);
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await assertions?.end();
  });

  it("reconciles two invoices, partial Cash, reversal, authorization and restart persistence", async () => {
    if (!database || !assertions || !app) throw new Error("Gate 2 test setup did not finish.");
    const owner = await createActor(database, assertions, app, "OWNER");
    const viewer = await createActor(database, assertions, app, "VIEWER");
    const technician = await createActor(database, assertions, app, "TECHNICIAN");
    const request = (token: string, method: "GET" | "POST" | "PATCH", url: string, payload?: Record<string, unknown>) =>
      app!.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

    const created = await request(owner.token, "POST", "/api/v1/subscribers", {
      firstName: "GateTwo", lastName: "Cash", billingDay: 1, dueDay: 15,
      addresses: [{ type: "SERVICE", line1: "2 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000003", isPrimary: true }]
    });
    expect(created.statusCode).toBe(200);
    const subscriberId = (created.json() as { data: { id: string } }).data.id;
    const profile = await request(owner.token, "GET", `/api/v1/subscribers/${subscriberId}`);
    const addressId = (profile.json() as { data: { addresses: Array<{ id: string }> } }).data.addresses[0]?.id;
    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    if (!addressId || !plan) throw new Error("Test address or service plan missing.");
    const service = await request(owner.token, "POST", "/api/v1/service-accounts", { subscriberId, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 });
    expect(service.statusCode).toBe(200);
    const serviceId = (service.json() as { data: { id: string } }).data.id;
    const subscriberVersion = await assertions.query("select version from subscribers where id = $1", [subscriberId]);
    const [areaRow, collectorRow] = await Promise.all([assertions.query("select id, name from collection_areas order by code limit 1"), assertions.query("select id, display_name from collectors order by code limit 1")]);
    const area = areaRow.rows[0] as { id: string; name: string } | undefined;
    const collector = collectorRow.rows[0] as { id: string; display_name: string } | undefined;
    if (!area || !collector) throw new Error("Synthetic area or collector is missing.");
    const subscriberEdit = { status: "ACTIVE", billingDay: 1, dueDay: 15, notes: "Gate 2 synthetic edit", collectionAreaId: area.id, assignedCollectorId: collector.id, version: subscriberVersion.rows[0]?.version as number };
    expect((await request(viewer.token, "PATCH", `/api/v1/subscribers/${subscriberId}`, subscriberEdit)).statusCode).toBe(403);
    expect((await request(owner.token, "PATCH", `/api/v1/subscribers/${subscriberId}`, subscriberEdit)).statusCode).toBe(204);
    expect((await assertions.query("select notes from subscribers where id = $1", [subscriberId])).rows[0]?.notes).toBe("Gate 2 synthetic edit");
    const serviceVersion = await assertions.query("select version from service_accounts where id = $1", [serviceId]);
    const serviceEdit = { planId: plan.id, installationAddressId: addressId, status: "ACTIVE", reason: "Gate 2 ordinary edit", version: serviceVersion.rows[0]?.version as number };
    expect((await request(viewer.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, serviceEdit)).statusCode).toBe(403);
    expect((await request(owner.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, serviceEdit)).statusCode).toBe(204);

    const year = await unusedBillingYear(assertions, 6000, 7999, ["01", "02"]);
    const periods = [`${year}-01`, `${year}-02`];
    for (const periodKey of periods) {
      const commandKey = randomUUID();
      const denied = await request(viewer.token, "POST", "/api/v1/billing/finalize", { periodKey, commandKey: randomUUID() });
      expect(denied.statusCode).toBe(403);
      const billed = await request(owner.token, "POST", "/api/v1/billing/finalize", { periodKey, commandKey });
      expect(billed.statusCode).toBe(200);
      const sameCommand = await request(owner.token, "POST", "/api/v1/billing/finalize", { periodKey, commandKey });
      expect(sameCommand.statusCode).toBe(200);
    }

    const invoices = await assertions.query("select id, invoice_number, total_centavos, paid_centavos, due_date from invoices where subscriber_id = $1 order by due_date", [subscriberId]);
    expect(invoices.rowCount).toBe(2);
    const firstTotal = BigInt(invoices.rows[0]?.total_centavos as string);
    const secondTotal = BigInt(invoices.rows[1]?.total_centavos as string);
    const amount = firstTotal + 100n;
    expect(secondTotal).toBeGreaterThan(100n);
    const preview = await request(owner.token, "GET", `/api/v1/payments/preview?subscriberId=${subscriberId}&amountCentavos=${amount}`);
    expect(preview.statusCode).toBe(200);
    expect((preview.json() as { data: { allocations: Array<{ amountCentavos: string }> } }).data.allocations.map((row) => row.amountCentavos)).toEqual([firstTotal.toString(), "100"]);
    const paymentKey = randomUUID();
    const payload = { subscriberId, amountCentavos: amount.toString(), method: "CASH", commandKey: paymentKey };
    expect((await request(viewer.token, "POST", "/api/v1/payments", payload)).statusCode).toBe(403);
    const posted = await request(owner.token, "POST", "/api/v1/payments", payload);
    expect(posted.statusCode).toBe(200);
    const paymentId = (posted.json() as { data: { payment: { id: string } } }).data.payment.id;
    const replay = await request(owner.token, "POST", "/api/v1/payments", payload);
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as { data: { payment: { id: string } } }).data.payment.id).toBe(paymentId);
    expect((await request(owner.token, "POST", "/api/v1/payments", { ...payload, amountCentavos: (amount + 1n).toString() })).statusCode).toBe(409);

    const beforeRollback = await financialSnapshot(assertions, subscriberId);
    expect(beforeRollback.payments).toBe(1);
    expect(beforeRollback.receipts).toBe(1);
    expect(beforeRollback.allocations).toBe(2);
    expect(beforeRollback.debits - beforeRollback.credits).toBe(beforeRollback.outstanding);
    expect(beforeRollback.outstanding).toBe(secondTotal - 100n);
    const followUpAccountNumber = (await assertions.query("select account_number from subscribers where id = $1", [subscriberId])).rows[0]?.account_number as string;
    const preReversalFollowUp = await request(viewer.token, "GET", `/api/v1/receivables/overdue-accounts?asOf=8999-12-31&search=${encodeURIComponent(followUpAccountNumber)}`);
    expect(preReversalFollowUp.statusCode).toBe(200);
    const preReversalRows = (preReversalFollowUp.json() as { data: { items: Array<{ monthsUnpaid: number; totalArrearsCentavos: string; lastPaymentAt: string | null }> } }).data.items;
    expect(preReversalRows).toMatchObject([{ monthsUnpaid: 1, totalArrearsCentavos: (secondTotal - 100n).toString(), lastPaymentAt: expect.any(String) }]);
    const paymentHistoryUrl = `/api/v1/payments?subscriberId=${subscriberId}&page=1&pageSize=1`;
    const paymentHistory = await request(viewer.token, "GET", paymentHistoryUrl);
    expect(paymentHistory.statusCode).toBe(200);
    expect((paymentHistory.json() as { data: { items: Array<{ payment: { id: string } }>; hasMore: boolean } }).data).toMatchObject({ hasMore: false, items: [{ payment: { id: paymentId } }] });
    expect((await request(technician.token, "GET", paymentHistoryUrl)).statusCode).toBe(403);
    const paymentDetail = await request(viewer.token, "GET", `/api/v1/payments/${paymentId}`);
    expect(paymentDetail.statusCode).toBe(200);
    expect((paymentDetail.json() as { data: { receipt: { snapshot: { amountCentavos: string }; voidedAt: string | null }; allocations: Array<{ isReversed: boolean }> } }).data).toMatchObject({ receipt: { snapshot: { amountCentavos: amount.toString() }, voidedAt: null }, allocations: [{ isReversed: false }, { isReversed: false }] });
    const firstInvoiceId = invoices.rows[0]?.id as string;
    const firstInvoiceNumber = invoices.rows[0]?.invoice_number as string;
    const listUrl = `/api/v1/invoices?subscriberId=${subscriberId}&page=1&pageSize=1`;
    const firstPage = await request(viewer.token, "GET", listUrl);
    expect(firstPage.statusCode).toBe(200);
    expect((firstPage.json() as { data: { items: Array<{ subscriberId: string }>; hasMore: boolean } }).data).toMatchObject({ hasMore: true, items: [{ subscriberId }] });
    const secondPage = await request(viewer.token, "GET", `${listUrl.replace("page=1", "page=2")}`);
    expect((secondPage.json() as { data: { items: unknown[]; hasMore: boolean } }).data).toMatchObject({ hasMore: false, items: [expect.any(Object)] });
    const searchedInvoice = await request(viewer.token, "GET", `/api/v1/invoices?invoiceNumber=${encodeURIComponent(firstInvoiceNumber)}&pageSize=1`);
    expect((searchedInvoice.json() as { data: { items: Array<{ invoiceNumber: string; subscriberAccountNumber: string; serviceAccountNumber: string; outstandingCentavos: string }>; hasMore: boolean } }).data).toMatchObject({ hasMore: false, items: [expect.objectContaining({ invoiceNumber: firstInvoiceNumber, outstandingCentavos: "0" })] });
    expect((await request(viewer.token, "GET", "/api/v1/invoices?invoiceNumber=%25")).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/v1/invoices/${firstInvoiceId}` })).statusCode).toBe(401);
    const invoiceDetail = await request(viewer.token, "GET", `/api/v1/invoices/${firstInvoiceId}`);
    expect(invoiceDetail.statusCode).toBe(200);
    const detailData = (invoiceDetail.json() as { data: { invoice: { invoiceNumber: string; totalCentavos: string; paidCentavos: string; outstandingCentavos: string; subscriberAccountNumber: string; serviceAccountNumber: string }; items: Array<{ totalCentavos: string }> } }).data;
    expect(detailData.invoice).toMatchObject({ invoiceNumber: firstInvoiceNumber, totalCentavos: firstTotal.toString(), paidCentavos: firstTotal.toString(), outstandingCentavos: "0" });
    expect(detailData.invoice.subscriberAccountNumber).toMatch(/^SUB-/);
    expect(detailData.invoice.serviceAccountNumber).toMatch(/^SVC-/);
    expect(detailData.items.reduce((total, item) => total + BigInt(item.totalCentavos), 0n)).toBe(firstTotal);
    const invoiceDebit = await assertions.query("select coalesce(sum(debit_centavos), 0) as debit from ledger_entries where invoice_id = $1 and type = 'INVOICE_DEBIT'", [firstInvoiceId]);
    expect(invoiceDebit.rows[0]?.debit).toBe(firstTotal.toString());
    const blockedKey = randomUUID();
    const blocked = await request(owner.token, "POST", "/api/v1/payments", { subscriberId, amountCentavos: (secondTotal + 1n).toString(), method: "CASH", commandKey: blockedKey });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: { code: string } }).error.code).toBe("ADVANCE_PAYMENT_POLICY_REQUIRED");
    expect(await financialSnapshot(assertions, subscriberId)).toEqual(beforeRollback);
    expect((await assertions.query("select count(*)::int as value from payments where command_key = $1", [blockedKey])).rows[0]?.value).toBe(0);

    const statement = await request(owner.token, "GET", `/api/v1/subscribers/${subscriberId}/statement`);
    expect(statement.statusCode).toBe(200);
    expect((statement.json() as { data: { closingBalanceCentavos: string } }).data.closingBalanceCentavos).toBe(beforeRollback.outstanding.toString());
    expect((await request(technician.token, "GET", `/api/v1/subscribers/${subscriberId}/statement`)).statusCode).toBe(200);
    const dates = await assertions.query("select current_date::text as today, (current_date - 1)::text as yesterday, (current_date + 1)::text as tomorrow");
    const { today, yesterday, tomorrow } = dates.rows[0] as { today: string; yesterday: string; tomorrow: string };
    const ledgerUrl = (page: number, from?: string, to?: string) => `/api/v1/subscribers/${subscriberId}/ledger?page=${page}&pageSize=1${from && to ? `&dateFrom=${from}&dateTo=${to}` : ""}`;
    const ledgerPages = [];
    for (const page of [1, 2, 3]) {
      const response = await request(technician.token, "GET", ledgerUrl(page, today, today));
      expect(response.statusCode).toBe(200);
      ledgerPages.push((response.json() as { data: { entries: Array<{ debitCentavos: string; creditCentavos: string; balanceCentavos: string }>; openingBalanceCentavos: string; pageOpeningBalanceCentavos: string; closingBalanceCentavos: string; hasMore: boolean } }).data);
    }
    expect(ledgerPages.map((page) => page.entries.length)).toEqual([1, 1, 1]);
    expect(ledgerPages.map((page) => page.hasMore)).toEqual([true, true, false]);
    expect(ledgerPages[0]?.openingBalanceCentavos).toBe("0");
    expect(ledgerPages[0]?.pageOpeningBalanceCentavos).toBe("0");
    expect(ledgerPages[1]?.pageOpeningBalanceCentavos).toBe(ledgerPages[0]?.entries[0]?.balanceCentavos);
    expect(ledgerPages[2]?.pageOpeningBalanceCentavos).toBe(ledgerPages[1]?.entries[0]?.balanceCentavos);
    expect(ledgerPages[2]?.entries[0]?.balanceCentavos).toBe(beforeRollback.outstanding.toString());
    expect(ledgerPages.every((page) => page.closingBalanceCentavos === beforeRollback.outstanding.toString())).toBe(true);
    expect(ledgerPages.flatMap((page) => page.entries).reduce((net, entry) => net + BigInt(entry.debitCentavos) - BigInt(entry.creditCentavos), 0n)).toBe(beforeRollback.outstanding);
    const priorLedger = await request(viewer.token, "GET", ledgerUrl(1, yesterday, yesterday));
    expect(priorLedger.statusCode).toBe(200);
    expect((priorLedger.json() as { data: { entries: unknown[]; closingBalanceCentavos: string } }).data).toMatchObject({ entries: [], closingBalanceCentavos: "0" });
    const laterLedger = await request(viewer.token, "GET", ledgerUrl(1, tomorrow, tomorrow));
    expect(laterLedger.statusCode).toBe(200);
    expect((laterLedger.json() as { data: { entries: unknown[]; openingBalanceCentavos: string; closingBalanceCentavos: string } }).data).toMatchObject({ entries: [], openingBalanceCentavos: beforeRollback.outstanding.toString(), closingBalanceCentavos: beforeRollback.outstanding.toString() });
    expect((await request(viewer.token, "GET", `/api/v1/subscribers/${subscriberId}/ledger?dateFrom=${today}`)).statusCode).toBe(400);
    expect((await request(viewer.token, "GET", `/api/v1/subscribers/${subscriberId}/ledger?dateFrom=2026-02-31&dateTo=${today}`)).statusCode).toBe(400);
    expect((await request(viewer.token, "GET", `/api/v1/subscribers/${subscriberId}/ledger?pageSize=101`)).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: ledgerUrl(1) })).statusCode).toBe(401);
    expect((await request(viewer.token, "GET", `/api/v1/subscribers/${randomUUID()}/ledger`)).statusCode).toBe(404);
    const soaUrl = (from: string, to: string) => `/api/v1/reports/subscriber-soa/preview?subscriberId=${subscriberId}&dateFrom=${from}&dateTo=${to}`;
    const earlier = await request(owner.token, "GET", soaUrl(yesterday, yesterday));
    expect(earlier.statusCode).toBe(200);
    expect((earlier.json() as { data: { rows: unknown[] } }).data.rows).toHaveLength(0);
    const sameDay = await request(viewer.token, "GET", soaUrl(today, today));
    expect(sameDay.statusCode).toBe(200);
    expect((await request(technician.token, "GET", soaUrl(today, today))).statusCode).toBe(403);
    const sameDayData = (sameDay.json() as { data: { rows: Array<{ debitCentavos: string; creditCentavos: string; balanceCentavos: string }>; summary: Array<{ label: string; value: string }> } }).data;
    const summary = (label: string) => sameDayData.summary.find((item) => item.label === label)?.value;
    expect(summary("Opening balance")).toBe("0");
    expect(sameDayData.rows.reduce((net, row) => net + BigInt(row.debitCentavos) - BigInt(row.creditCentavos), 0n)).toBe(beforeRollback.outstanding);
    expect(sameDayData.rows.at(-1)?.balanceCentavos).toBe(beforeRollback.outstanding.toString());
    expect(summary("Closing balance")).toBe(beforeRollback.outstanding.toString());
    const later = await request(owner.token, "GET", soaUrl(tomorrow, tomorrow));
    expect(later.statusCode).toBe(200);
    const laterData = (later.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string }> } }).data;
    expect(laterData.rows).toHaveLength(0);
    expect(laterData.summary.find((item) => item.label === "Opening balance")?.value).toBe(beforeRollback.outstanding.toString());
    expect((await request(viewer.token, "GET", `/api/v1/reports/subscriber-soa/export?subscriberId=${subscriberId}&dateFrom=${today}&dateTo=${today}&format=pdf`)).statusCode).toBe(403);
    const soaPdf = await request(owner.token, "GET", `/api/v1/reports/subscriber-soa/export?subscriberId=${subscriberId}&dateFrom=${today}&dateTo=${today}&format=pdf`);
    expect(soaPdf.statusCode).toBe(200);
    expect(soaPdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    const comparisonUrl = `/api/v1/reports/billing-vs-collection/preview?dateFrom=${today}&dateTo=${today}`;
    const beforeComparison = await request(owner.token, "GET", comparisonUrl);
    expect(beforeComparison.statusCode).toBe(200);
    const beforeCollected = BigInt((beforeComparison.json() as { data: { summary: Array<{ label: string; value: string | number }> } }).data.summary.find((row) => row.label === "Collected")?.value ?? "0");
    const reversal = await request(owner.token, "POST", `/api/v1/payments/${paymentId}/reverse`, { reason: "Gate 2 compensating reversal" });
    expect(reversal.statusCode).toBe(200);
    const afterComparison = await request(owner.token, "GET", comparisonUrl);
    expect(afterComparison.statusCode).toBe(200);
    const afterCollected = BigInt((afterComparison.json() as { data: { summary: Array<{ label: string; value: string | number }> } }).data.summary.find((row) => row.label === "Collected")?.value ?? "0");
    expect(beforeCollected - afterCollected).toBe(amount);
    expect((await request(owner.token, "POST", `/api/v1/payments/${paymentId}/reverse`, { reason: "Gate 2 repeated reversal" })).statusCode).toBe(409);
    const afterReversal = await financialSnapshot(assertions, subscriberId);
    expect(afterReversal.debits - afterReversal.credits).toBe(firstTotal + secondTotal);
    expect(afterReversal.outstanding).toBe(firstTotal + secondTotal);
    const history = await assertions.query("select p.status, r.voided_at, count(pr.id)::int as reversals from payments p join receipts r on r.payment_id = p.id left join payment_reversals pr on pr.payment_id = p.id where p.id = $1 group by p.status, r.voided_at", [paymentId]);
    expect(history.rows[0]).toMatchObject({ status: "REVERSED", reversals: 1 });
    expect(history.rows[0]?.voided_at).not.toBeNull();
    const voidedDetail = await request(viewer.token, "GET", `/api/v1/payments/${paymentId}`);
    expect(voidedDetail.statusCode).toBe(200);
    const voidedData = (voidedDetail.json() as { data: { payment: { status: string }; receipt: { voidedAt: string | null }; allocations: Array<{ isReversed: boolean }> } }).data;
    expect(voidedData.payment.status).toBe("REVERSED");
    expect(voidedData.receipt.voidedAt).not.toBeNull();
    expect(voidedData.allocations.every((row) => row.isReversed)).toBe(true);
    const reversedLedger = await request(viewer.token, "GET", ledgerUrl(4, today, today));
    expect(reversedLedger.statusCode).toBe(200);
    expect((reversedLedger.json() as { data: { entries: Array<{ type: string; balanceCentavos: string }>; pageOpeningBalanceCentavos: string; closingBalanceCentavos: string; hasMore: boolean } }).data).toMatchObject({ entries: [{ type: "PAYMENT_REVERSAL_DEBIT", balanceCentavos: (firstTotal + secondTotal).toString() }], pageOpeningBalanceCentavos: beforeRollback.outstanding.toString(), closingBalanceCentavos: (firstTotal + secondTotal).toString(), hasMore: false });

    const reportUrl = `/api/v1/reports/subscriber-ledger/preview?subscriberId=${subscriberId}&dateFrom=${today}&dateTo=${today}`;
    const ledgerReportResponse = await request(viewer.token, "GET", reportUrl);
    expect(ledgerReportResponse.statusCode, ledgerReportResponse.body).toBe(200);
    const ledgerReport = (ledgerReportResponse.json() as { data: { rows: Array<{ sequenceNumber: string; postingTime: string; type: string; debitCentavos: string; creditCentavos: string; balanceCentavos: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
    const independentLedger = await assertions.query("select sequence_number::text as sequence_number, occurred_at, type, debit_centavos, credit_centavos from ledger_entries where subscriber_id = $1 and occurred_at::date = $2::date order by occurred_at, id", [subscriberId, today]);
    expect(ledgerReport.rows.map((row) => row.sequenceNumber)).toEqual(independentLedger.rows.map((row) => row.sequence_number));
    expect(ledgerReport.rows.map((row) => row.type)).toEqual(independentLedger.rows.map((row) => row.type));
    expect(ledgerReport.rows.map((row) => row.postingTime)).toEqual(independentLedger.rows.map((row) => (row.occurred_at as Date).toISOString()));
    expect(ledgerReport.rows.map((row) => [row.debitCentavos, row.creditCentavos])).toEqual(independentLedger.rows.map((row) => [row.debit_centavos, row.credit_centavos]));
    expect(ledgerReport.rows.at(-1)?.balanceCentavos).toBe((firstTotal + secondTotal).toString());
    expect(ledgerReport.summary).toContainEqual({ label: "Closing balance", value: (firstTotal + secondTotal).toString(), type: "money" });
    expect((await request(technician.token, "GET", reportUrl)).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: reportUrl })).statusCode).toBe(401);
    expect((await request(viewer.token, "GET", reportUrl.replace("/preview?", "/export?format=pdf&"))).statusCode).toBe(403);
    expect((await request(owner.token, "GET", reportUrl.replace(`subscriberId=${subscriberId}`, `subscriberId=${randomUUID()}`))).statusCode).toBe(404);
    expect((await request(owner.token, "GET", reportUrl.replace(`dateFrom=${today}`, "dateFrom=2026-02-30"))).statusCode).toBe(400);
    const emptyLedgerReport = await request(owner.token, "GET", reportUrl.replace(`dateFrom=${today}&dateTo=${today}`, `dateFrom=${yesterday}&dateTo=${yesterday}`));
    expect(emptyLedgerReport.statusCode).toBe(200);
    expect((emptyLedgerReport.json() as { data: { rows: unknown[] } }).data.rows).toEqual([]);
    const ledgerPdf = await request(owner.token, "GET", reportUrl.replace("/preview?", "/export?format=pdf&"));
    expect(ledgerPdf.statusCode, ledgerPdf.body.slice(0, 200)).toBe(200);
    expect(ledgerPdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const ledgerXlsx = await request(owner.token, "GET", reportUrl.replace("/preview?", "/export?format=xlsx&"));
    expect(ledgerXlsx.statusCode, ledgerXlsx.body.slice(0, 200)).toBe(200);
    const ledgerWorkbook = new ExcelJS.Workbook();
    await ledgerWorkbook.xlsx.load(ledgerXlsx.rawPayload as never);
    expect(ledgerWorkbook.getWorksheet("Report")?.rowCount).toBe(ledgerReport.rows.length + 1);
    expect(ledgerWorkbook.getWorksheet("Report")?.getCell("E2").value).toBe(Number(BigInt(ledgerReport.rows[0]?.debitCentavos ?? "0")) / 100);
    expect(ledgerWorkbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("subscriber-ledger");

    await app.close();
    app = await makeApp(database);
    const reopened = await request(owner.token, "GET", `/api/v1/subscribers/${subscriberId}/statement`);
    expect(reopened.statusCode).toBe(200);
    expect((reopened.json() as { data: { closingBalanceCentavos: string } }).data.closingBalanceCentavos).toBe((firstTotal + secondTotal).toString());
    const persistedPayment = await request(viewer.token, "GET", `/api/v1/payments/${paymentId}`);
    expect(persistedPayment.statusCode).toBe(200);
    expect((persistedPayment.json() as { data: { payment: { status: string }; receipt: { voidedAt: string | null } } }).data.payment.status).toBe("REVERSED");
    expect((persistedPayment.json() as { data: { receipt: { voidedAt: string | null } } }).data.receipt.voidedAt).not.toBeNull();
    const persistedLedger = await request(viewer.token, "GET", `/api/v1/subscribers/${subscriberId}/ledger?page=1&pageSize=1&dateFrom=${today}&dateTo=${today}`);
    expect(persistedLedger.statusCode).toBe(200);
    expect((persistedLedger.json() as { data: { closingBalanceCentavos: string } }).data.closingBalanceCentavos).toBe((firstTotal + secondTotal).toString());
    const persistedLedgerReport = await request(viewer.token, "GET", reportUrl);
    expect(persistedLedgerReport.statusCode).toBe(200);
    expect((persistedLedgerReport.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string | number }> } }).data).toMatchObject({ rows: ledgerReport.rows, summary: ledgerReport.summary });
    const reopenedSoa = await request(owner.token, "GET", soaUrl(today, today));
    expect(reopenedSoa.statusCode).toBe(200);
    expect((reopenedSoa.json() as { data: { summary: Array<{ label: string; value: string }> } }).data.summary.find((item) => item.label === "Closing balance")?.value).toBe((firstTotal + secondTotal).toString());
    const reopenedInvoice = await request(viewer.token, "GET", `/api/v1/invoices/${firstInvoiceId}`);
    expect((reopenedInvoice.json() as { data: { invoice: { outstandingCentavos: string } } }).data.invoice.outstandingCentavos).toBe(firstTotal.toString());
    const aging = await request(owner.token, "GET", "/api/v1/receivables/aging?asOf=8999-12-31");
    expect(aging.statusCode).toBe(200);
    const accountNumber = (await assertions.query("select account_number from subscribers where id = $1", [subscriberId])).rows[0]?.account_number as string;
    const arQuery = `/api/v1/receivables?asOf=8999-12-31&overdueOnly=true&search=${encodeURIComponent(accountNumber)}&pageSize=1`;
    const arFirst = await request(viewer.token, "GET", `${arQuery}&page=1`);
    const arSecond = await request(viewer.token, "GET", `${arQuery}&page=2`);
    expect(arFirst.statusCode).toBe(200);
    expect(arSecond.statusCode).toBe(200);
    const firstAr = (arFirst.json() as { data: { items: Array<{ remainingCentavos: string; ageBucket: string; planCode: string; serviceTypeCode: string; serviceAccountNumber: string; lastPaymentAt: string | null }>; hasMore: boolean } }).data;
    const secondAr = (arSecond.json() as { data: { items: Array<{ remainingCentavos: string; ageBucket: string }>; hasMore: boolean } }).data;
    expect(firstAr).toMatchObject({ hasMore: true, items: [expect.objectContaining({ ageBucket: "DAYS_91_PLUS", planCode: plan.code, serviceAccountNumber: expect.stringMatching(/^SVC-/), areaName: area.name, collectorName: collector.display_name, lastPaymentAt: null })] });
    expect(secondAr).toMatchObject({ hasMore: false, items: [expect.objectContaining({ ageBucket: "DAYS_91_PLUS" })] });
    expect([...firstAr.items, ...secondAr.items].reduce((total, row) => total + BigInt(row.remainingCentavos), 0n)).toBe(firstTotal + secondTotal);
    const overdueQuery = `/api/v1/receivables/overdue-accounts?asOf=8999-12-31&search=${encodeURIComponent(accountNumber)}`;
    const overdue = await request(viewer.token, "GET", overdueQuery);
    expect(overdue.statusCode).toBe(200);
    const overdueData = (overdue.json() as { data: { items: Array<{ accountNumber: string; serviceAccountId: string; monthsUnpaid: number; overdueInvoiceCount: number; oldestUnpaidInvoice: string; totalArrearsCentavos: string; lastPaymentAt: string | null }>; hasMore: boolean } }).data;
    expect(overdueData.items).toHaveLength(1);
    expect(overdueData.items[0]).toMatchObject({ accountNumber, serviceAccountId: serviceId, monthsUnpaid: 2, overdueInvoiceCount: 2, oldestUnpaidInvoice: firstInvoiceNumber, totalArrearsCentavos: (firstTotal + secondTotal).toString(), lastPaymentAt: null });
    expect(overdueData.hasMore).toBe(false);
    expect(overdueData.items.reduce((sum, row) => sum + BigInt(row.totalArrearsCentavos), 0n)).toBe([...firstAr.items, ...secondAr.items].reduce((sum, row) => sum + BigInt(row.remainingCentavos), 0n));
    expect((await request(viewer.token, "GET", `${overdueQuery}&pageSize=1&page=2`)).json()).toMatchObject({ data: { items: [], hasMore: false } });
    expect((await request(viewer.token, "GET", `${overdueQuery}&bucket=CURRENT`)).json()).toMatchObject({ data: { items: [] } });
    expect((await request(viewer.token, "GET", `${overdueQuery}&areaId=${area.id}&collectorId=${collector.id}&serviceTypeId=${plan.serviceTypeId}&bucket=DAYS_91_PLUS`)).statusCode).toBe(200);
    expect((await request(technician.token, "GET", overdueQuery)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: overdueQuery })).statusCode).toBe(401);
    expect((await request(viewer.token, "GET", `${overdueQuery}&pageSize=101`)).statusCode).toBe(400);
    const arPlanFilter = await request(viewer.token, "GET", `${arQuery}&planId=${plan.id}&serviceTypeId=${plan.serviceTypeId}&areaId=${area.id}&collectorId=${collector.id}&bucket=DAYS_91_PLUS`);
    expect(arPlanFilter.statusCode).toBe(200);
    expect((arPlanFilter.json() as { data: { items: unknown[] } }).data.items).toHaveLength(1);
    const arCurrent = await request(viewer.token, "GET", `${arQuery}&bucket=CURRENT`);
    expect((arCurrent.json() as { data: { items: unknown[] } }).data.items).toHaveLength(0);
    const arNameSearch = await request(viewer.token, "GET", "/api/v1/receivables?asOf=8999-12-31&search=GateTwo%20Cash&pageSize=1");
    expect((arNameSearch.json() as { data: { items: unknown[]; hasMore: boolean } }).data).toMatchObject({ hasMore: true, items: [expect.any(Object)] });
    const arOptions = await request(viewer.token, "GET", "/api/v1/receivables/filter-options");
    expect(arOptions.statusCode).toBe(200);
    expect((arOptions.json() as { data: { plans: Array<{ id: string }> } }).data.plans.some((item) => item.id === plan.id)).toBe(true);
    expect((await request(technician.token, "GET", arQuery)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: arQuery })).statusCode).toBe(401);
    expect((await request(viewer.token, "GET", `${arQuery}&bucket=BAD`)).statusCode).toBe(400);
    expect((await request(viewer.token, "GET", "/api/v1/receivables?asOf=2026-02-31")).statusCode).toBe(400);
    const report = await request(owner.token, "GET", "/api/v1/reports/ar-aging/preview?asOf=8999-12-31");
    expect(report.statusCode).toBe(200);
    const reportTotal = (report.json() as { data: { summary: Array<{ label: string; value: string }> } }).data.summary.find((row) => row.label === "Total outstanding")?.value;
    expect(reportTotal).toBe((aging.json() as { data: { totalCentavos: string } }).data.totalCentavos);
    const audit = await assertions.query("select action, count(*)::int as value from audit_logs where entity_id in ($1, $2) and action in ('payment.post', 'payment.reverse') group by action", [paymentId, subscriberId]);
    expect(Object.fromEntries(audit.rows.map((row) => [row.action, row.value]))).toMatchObject({ "payment.post": 1, "payment.reverse": 1 });
    const exactKey = randomUUID();
    const exact = await request(owner.token, "POST", "/api/v1/payments", { subscriberId, amountCentavos: (firstTotal + secondTotal).toString(), method: "CASH", commandKey: exactKey });
    expect(exact.statusCode).toBe(200);
    const fullyPaid = await financialSnapshot(assertions, subscriberId);
    expect(fullyPaid.outstanding).toBe(0n);
    expect(fullyPaid.debits - fullyPaid.credits).toBe(0n);
    expect(fullyPaid).toMatchObject({ payments: 2, receipts: 2, allocations: 4 });
  }, 120_000);

  it("rolls back a receipt-insert failure and serializes concurrent billing and Cash commands", async () => {
    if (!database || !assertions || !app) throw new Error("Gate 2 test setup did not finish.");
    const owner = await createActor(database, assertions, app, "OWNER");
    const request = (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) =>
      app!.inject({ method, url, headers: { authorization: `Bearer ${owner.token}` }, ...(payload ? { payload } : {}) });
    const created = await request("POST", "/api/v1/subscribers", {
      firstName: "GateTwo", lastName: "Concurrency", billingDay: 1, dueDay: 15,
      addresses: [{ type: "SERVICE", line1: "3 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000004", isPrimary: true }]
    });
    expect(created.statusCode).toBe(200);
    const subscriberId = (created.json() as { data: { id: string } }).data.id;
    const profile = await request("GET", `/api/v1/subscribers/${subscriberId}`);
    const addressId = (profile.json() as { data: { addresses: Array<{ id: string }> } }).data.addresses[0]?.id;
    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    if (!addressId || !plan) throw new Error("Test address or service plan missing.");
    expect((await request("POST", "/api/v1/service-accounts", { subscriberId, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 })).statusCode).toBe(200);
    const periodKey = `${await unusedBillingYear(assertions, 4000, 5999, ["01"])}-01`;
    const finalized = await Promise.all([randomUUID(), randomUUID()].map((commandKey) => request("POST", "/api/v1/billing/finalize", { periodKey, commandKey })));
    expect(finalized.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(finalized.map((response) => (response.json() as { data: { alreadyFinalized: boolean } }).data.alreadyFinalized).sort()).toEqual([false, true]);
    const invoice = await assertions.query("select count(*)::int as count, max(total_centavos) as amount from invoices where subscriber_id = $1", [subscriberId]);
    expect(invoice.rows[0]?.count).toBe(1);
    const invoiceTotal = BigInt(invoice.rows[0]?.amount as string);
    expect(invoiceTotal).toBeGreaterThan(300n);

    const account = await assertions.query("select account_number from subscribers where id = $1", [subscriberId]);
    const accountNumber = account.rows[0]?.account_number as string;
    if (!/^[A-Z0-9-]+$/.test(accountNumber)) throw new Error("Unexpected synthetic account number.");
    const constraint = `gate2_receipt_fail_${randomUUID().replaceAll("-", "")}`;
    const beforeFailure = await financialSnapshot(assertions, subscriberId);
    const failureKey = randomUUID();
    const sequencesBefore = await assertions.query("select code, last_value from number_sequences where code in ('PAYMENT', 'RECEIPT', 'LEDGER') order by code");
    await assertions.query(`alter table receipts add constraint ${constraint} check ((snapshot ->> 'accountNumber') <> '${accountNumber}') not valid`);
    try {
      const failed = await request("POST", "/api/v1/payments", { subscriberId, amountCentavos: "100", method: "CASH", commandKey: failureKey });
      expect(failed.statusCode).toBe(500);
      expect(await financialSnapshot(assertions, subscriberId)).toEqual(beforeFailure);
      expect((await assertions.query("select count(*)::int as value from payments where command_key = $1", [failureKey])).rows[0]?.value).toBe(0);
      const sequencesAfter = await assertions.query("select code, last_value from number_sequences where code in ('PAYMENT', 'RECEIPT', 'LEDGER') order by code");
      expect(sequencesAfter.rows).toEqual(sequencesBefore.rows);
    } finally {
      await assertions.query(`alter table receipts drop constraint ${constraint}`);
    }

    const sharedKey = randomUUID();
    const sharedPayload = { subscriberId, amountCentavos: "100", method: "CASH", commandKey: sharedKey };
    const replayed = await Promise.all([request("POST", "/api/v1/payments", sharedPayload), request("POST", "/api/v1/payments", sharedPayload)]);
    expect(replayed.map((response) => response.statusCode)).toEqual([200, 200]);
    const replayedIds = replayed.map((response) => (response.json() as { data: { payment: { id: string } } }).data.payment.id);
    expect(new Set(replayedIds).size).toBe(1);
    const distinct = await Promise.all([randomUUID(), randomUUID()].map((commandKey) => request("POST", "/api/v1/payments", { subscriberId, amountCentavos: "100", method: "CASH", commandKey })));
    expect(distinct.map((response) => response.statusCode)).toEqual([200, 200]);
    const after = await financialSnapshot(assertions, subscriberId);
    expect(after).toMatchObject({ payments: 3, receipts: 3, allocations: 3 });
    expect(after.outstanding).toBe(invoiceTotal - 300n);
    expect(after.debits - after.credits).toBe(after.outstanding);
    const numbering = await assertions.query("select count(*)::int as total, count(distinct p.payment_number)::int as payment_numbers, count(distinct r.receipt_number)::int as receipt_numbers from payments p join receipts r on r.payment_id = p.id where p.subscriber_id = $1", [subscriberId]);
    expect(numbering.rows[0]).toMatchObject({ total: 3, payment_numbers: 3, receipt_numbers: 3 });
  }, 120_000);
});

function makeApp(database: DatabaseHandle) {
  const auth = new AuthService(new PostgresAuthStore(database.db));
  return buildApp({ allowedOrigins: [], checkDatabase: database.check, authService: auth, subscriberService: new SubscriberService(database.db), billingService: new BillingService(database.db), paymentService: new PaymentService(database.db), receivableService: new ReceivableService(database.db), reportService: new ReportService(database.db) });
}

async function unusedBillingYear(pool: Pool, first: number, last: number, months: string[]): Promise<number> {
  const result = await pool.query("select candidate::int as year from generate_series($1::int, $2::int) candidate where not exists (select 1 from billing_cycles where left(period_key, 4) = candidate::text and right(period_key, 2) = any($3::text[])) order by candidate limit 1", [first, last, months]);
  const year = result.rows[0]?.year as number | undefined;
  if (!year) throw new Error("No unused synthetic billing year is available in bcis_test.");
  return year;
}

async function createActor(database: DatabaseHandle, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>, roleCode: "OWNER" | "VIEWER" | "TECHNICIAN") {
  const username = `gate2_${roleCode.toLowerCase()}_${randomUUID()}`;
  const password = randomBytes(24).toString("base64url");
  const role = await pool.query("select id from roles where code = $1", [roleCode]);
  if (!role.rows[0]?.id) throw new Error(`Missing ${roleCode} test role.`);
  const [user] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 2 ${roleCode} Test`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
  if (!user) throw new Error("Test user creation failed.");
  await database.db.insert(userRoles).values({ userId: user.id, roleId: role.rows[0].id as string });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
  expect(login.statusCode).toBe(200);
  return { token: (login.json() as { data: { token: string } }).data.token };
}

async function financialSnapshot(pool: Pool, subscriberId: string) {
  const result = await pool.query("select (select count(*)::int from payments where subscriber_id = $1) as payments, (select count(*)::int from receipts r join payments p on p.id = r.payment_id where p.subscriber_id = $1) as receipts, (select count(*)::int from payment_allocations a join payments p on p.id = a.payment_id where p.subscriber_id = $1) as allocations, (select coalesce(sum(total_centavos - paid_centavos), 0) from invoices where subscriber_id = $1) as outstanding, (select coalesce(sum(debit_centavos), 0) from ledger_entries where subscriber_id = $1) as debits, (select coalesce(sum(credit_centavos), 0) from ledger_entries where subscriber_id = $1) as credits", [subscriberId]);
  const row = result.rows[0];
  return { payments: row.payments as number, receipts: row.receipts as number, allocations: row.allocations as number, outstanding: BigInt(row.outstanding as string), debits: BigInt(row.debits as string), credits: BigInt(row.credits as string) };
}
