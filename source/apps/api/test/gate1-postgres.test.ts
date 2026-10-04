import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { collectors, collectionRoutes, servicePlans, userRoles, users } from "../src/db/schema/index.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { PostgresAuthStore } from "../src/modules/auth/postgres-auth-store.js";
import { BillingService } from "../src/modules/billing/billing-service.js";
import { CollectionService } from "../src/modules/collections/collection-service.js";
import { PaymentService } from "../src/modules/payments/payment-service.js";
import { ReceivableService } from "../src/modules/receivables/receivable-service.js";
import { ReportService } from "../src/modules/reports/report-service.js";
import { SubscriberService } from "../src/modules/subscribers/subscriber-service.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";

describe.skipIf(!testUri)("Gate 1 PostgreSQL retry integration", () => {
  let database: DatabaseHandle | undefined;
  let assertions: Pool | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let batchIdForPermissionCheck: string | undefined;
  let serviceIdForAssignmentCheck: string | undefined;

  beforeAll(async () => {
    const url = new URL(testUri);
    if (url.hostname !== "127.0.0.1" || url.port !== "5433" || url.pathname !== "/bcis_test") {
      throw new Error("Gate 1 integration tests require local 127.0.0.1:5433/bcis_test.");
    }
    assertions = new Pool({ connectionString: testUri, max: 2 });
    const target = await assertions.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (target.rows[0]?.name !== "bcis_test" || target.rows[0]?.migrations !== 19) {
      throw new Error("The isolated test database must contain all 19 migrations.");
    }
    database = createDatabase(testUri);
    const auth = new AuthService(new PostgresAuthStore(database.db));
    const payments = new PaymentService(database.db);
    app = await buildApp({
      allowedOrigins: [],
      authService: auth,
      subscriberService: new SubscriberService(database.db),
      billingService: new BillingService(database.db),
      paymentService: payments,
      collectionService: new CollectionService(database.db),
      receivableService: new ReceivableService(database.db),
      reportService: new ReportService(database.db)
    });
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await assertions?.end();
  });

  it("returns the same Cash and batch results after lost responses without extra financial rows", async () => {
    if (!app || !database || !assertions) throw new Error("Integration setup did not finish.");
    const username = `gate1_retry_${randomUUID()}`;
    const password = randomBytes(24).toString("base64url");
    const [seedOwner] = await database.db.select().from(users).where(eq(users.username, "gate1_test_owner")).limit(1);
    if (!seedOwner) throw new Error("Run the security seed in bcis_test first.");
    const [ownerRole] = await assertions.query("select id from roles where code = 'OWNER'").then((result) => result.rows);
    const [user] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: "Gate 1 Retry Test", passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
    if (!user || !ownerRole) throw new Error("Could not create synthetic test actor.");
    await database.db.insert(userRoles).values({ userId: user.id, roleId: ownerRole.id });

    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { data: { token: string } }).data.token;
    const request = async (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => {
      const options = { method, url, headers: { authorization: `Bearer ${token}` } };
      return payload === undefined ? await app!.inject(options) : await app!.inject({ ...options, payload });
    };

    const subscriber = await request("POST", "/api/v1/subscribers", {
      firstName: "GateOne", lastName: "Retry", billingDay: 1, dueDay: 15,
      addresses: [{ type: "SERVICE", line1: "1 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000001", isPrimary: true }]
    });
    expect(subscriber.statusCode).toBe(200);
    const subscriberId = (subscriber.json() as { data: { id: string } }).data.id;
    const profile = await request("GET", `/api/v1/subscribers/${subscriberId}`);
    const addressId = (profile.json() as { data: { addresses: Array<{ id: string }> } }).data.addresses[0]?.id;
    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    const [collector] = await database.db.select().from(collectors).limit(1);
    const [route] = await database.db.select().from(collectionRoutes).limit(1);
    if (!addressId || !plan || !collector || !route) throw new Error("Synthetic seed data is incomplete.");
    const service = await request("POST", "/api/v1/service-accounts", { subscriberId, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 });
    expect(service.statusCode).toBe(200);
    const serviceId = (service.json() as { data: { id: string } }).data.id;
    serviceIdForAssignmentCheck = serviceId;
    const assignment = await request("POST", "/api/v1/collector-assignments", { collectorId: collector.id, routeId: route.id, serviceAccountId: serviceId, effectiveFrom: "2026-01-01" });
    expect(assignment.statusCode).toBe(200);

    const unused = await assertions.query("select candidate::int as year from generate_series(3000, 8999) candidate where not exists (select 1 from billing_cycles where left(period_key, 4) = candidate::text) order by candidate limit 1");
    const year = unused.rows[0]?.year as number | undefined;
    if (!year) throw new Error("No unused synthetic billing year is available in bcis_test.");
    const month = "02";
    const periodKey = `${year}-${month}`;
    const previousPeriodKey = new Date(Date.UTC(year, Number(month) - 2, 1)).toISOString().slice(0, 7);
    for (const billedPeriod of [previousPeriodKey, periodKey]) {
      const billing = await request("POST", "/api/v1/billing/finalize", { periodKey: billedPeriod, commandKey: randomUUID() });
      expect(billing.statusCode).toBe(200);
    }
    const invoiceRows = await assertions.query("select id, total_centavos, paid_centavos from invoices where subscriber_id = $1 order by invoice_date", [subscriberId]);
    expect(invoiceRows.rowCount).toBe(2);

    const cashKey = randomUUID();
    const cashPayload = { subscriberId, amountCentavos: "1000", method: "CASH", commandKey: cashKey };
    const lostCashResponse = await request("POST", "/api/v1/payments", cashPayload);
    expect(lostCashResponse.statusCode).toBe(200); // Deliberately discard its body.
    const retriedCash = await request("POST", "/api/v1/payments", cashPayload);
    expect(retriedCash.statusCode).toBe(200);
    const paymentId = (retriedCash.json() as { data: { payment: { id: string } } }).data.payment.id;
    const cashConflict = await request("POST", "/api/v1/payments", { ...cashPayload, amountCentavos: "1001" });
    expect(cashConflict.statusCode).toBe(409);
    expect((cashConflict.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    await expectOneFinancialSet(assertions, cashKey, paymentId, "1000");

    const collectionDate = new Date(Date.UTC(year, Number(month), 20)).toISOString().slice(0, 10);
    const nextCollectionDate = new Date(`${collectionDate}T00:00:00.000Z`);
    nextCollectionDate.setUTCDate(nextCollectionDate.getUTCDate() + 1);
    const futureDate = nextCollectionDate.toISOString().slice(0, 10);
    expect((await request("POST", "/api/v1/collector-assignments", { collectorId: randomUUID(), routeId: route.id, serviceAccountId: serviceId, effectiveFrom: futureDate })).statusCode).toBe(400);
    expect((await request("POST", "/api/v1/collector-assignments", { collectorId: collector.id, routeId: randomUUID(), serviceAccountId: serviceId, effectiveFrom: futureDate })).statusCode).toBe(400);
    expect((await request("POST", "/api/v1/collector-assignments", { collectorId: collector.id, routeId: route.id, serviceAccountId: serviceId, effectiveFrom: "2026-02-30" })).statusCode).toBe(400);
    const [inactiveCollector] = await database.db.insert(collectors).values({ code: `X${randomUUID()}`, displayName: "Inactive synthetic collector", isActive: false }).returning();
    const [inactiveRoute] = await database.db.insert(collectionRoutes).values({ areaId: route.areaId, code: `X${randomUUID()}`, name: "Inactive synthetic route", isActive: false }).returning();
    if (!inactiveCollector || !inactiveRoute) throw new Error("Inactive setup fixtures were not created.");
    expect((await request("POST", "/api/v1/collector-assignments", { collectorId: inactiveCollector.id, routeId: route.id, serviceAccountId: serviceId, effectiveFrom: futureDate })).statusCode).toBe(400);
    expect((await request("POST", "/api/v1/collector-assignments", { collectorId: collector.id, routeId: inactiveRoute.id, serviceAccountId: serviceId, effectiveFrom: futureDate })).statusCode).toBe(400);
    expect((await request("POST", "/api/v1/collector-assignments", { collectorId: collector.id, routeId: route.id, serviceAccountId: serviceId, effectiveFrom: "2026-01-01" })).statusCode).toBe(409);
    const futureCollectorResponse = await request("POST", "/api/v1/collectors", { code: `F${randomUUID().slice(0, 12)}`, displayName: "Future Test Collector" });
    expect(futureCollectorResponse.statusCode).toBe(200);
    const futureCollectorId = (futureCollectorResponse.json() as { data: { id: string } }).data.id;
    const reassigned = await request("POST", "/api/v1/collector-assignments", { collectorId: futureCollectorId, routeId: route.id, serviceAccountId: serviceId, effectiveFrom: futureDate });
    expect(reassigned.statusCode).toBe(200);
    const assignmentHistory = await request("GET", `/api/v1/service-accounts/${serviceId}/collector-assignments`);
    expect(assignmentHistory.statusCode).toBe(200);
    expect((assignmentHistory.json() as { data: Array<{ collectorId: string; routeId: string | null; effectiveFrom: string; effectiveTo: string | null }> }).data).toMatchObject([
      { collectorId: futureCollectorId, routeId: route.id, effectiveFrom: futureDate, effectiveTo: null },
      { collectorId: collector.id, routeId: route.id, effectiveFrom: "2026-01-01", effectiveTo: futureDate }
    ]);
    const assignedServiceNumber = (await assertions.query("select service_account_number from service_accounts where id = $1", [serviceId])).rows[0]?.service_account_number as string;
    const assignmentReport = async (asOf: string) => {
      const response = await request("GET", `/api/v1/reports/collector-assignments/preview?asOf=${asOf}`);
      expect(response.statusCode, response.body).toBe(200);
      return (response.json() as { data: { rows: Array<{ serviceAccountNumber: string; collector: string; effectiveFrom: string; effectiveTo: string }>; summary: Array<{ label: string; value: number }> } }).data;
    };
    const beforeBoundary = await assignmentReport(collectionDate);
    const afterBoundary = await assignmentReport(futureDate);
    expect(beforeBoundary.rows.filter((row) => row.serviceAccountNumber === assignedServiceNumber)).toMatchObject([{ collector: collector.displayName, effectiveFrom: "2026-01-01", effectiveTo: futureDate }]);
    expect(afterBoundary.rows.filter((row) => row.serviceAccountNumber === assignedServiceNumber)).toMatchObject([{ collector: "Future Test Collector", effectiveFrom: futureDate, effectiveTo: "" }]);
    for (const [asOf, report] of [[collectionDate, beforeBoundary], [futureDate, afterBoundary]] as const) {
      const independent = await assertions.query("select count(*)::int as assignments, count(distinct sa.subscriber_id)::int as subscribers from collector_assignments ca join service_accounts sa on sa.id = ca.service_account_id where ca.effective_from <= $1::date and (ca.effective_to is null or ca.effective_to > $1::date)", [asOf]);
      expect(report.rows).toHaveLength(independent.rows[0]?.assignments);
      expect(new Set(report.rows.map((row) => row.serviceAccountNumber)).size).toBe(report.rows.length);
      expect(report.summary).toContainEqual({ label: "Distinct subscribers", value: independent.rows[0]?.subscribers, type: "integer" });
    }
    const emptyAssignments = await assignmentReport("1900-01-01");
    expect(emptyAssignments.rows).toEqual([]);
    expect((await request("GET", "/api/v1/reports/collector-assignments/preview?asOf=2026-02-30")).statusCode).toBe(400);
    expect((await request("GET", "/api/v1/reports/collector-assignments/preview")).statusCode).toBe(400);
    const futureBeforeStart = await request("POST", "/api/v1/collection-batches", { collectorId: futureCollectorId, routeId: route.id, collectionDate });
    expect(futureBeforeStart.statusCode).toBe(200);
    const futureBeforeId = (futureBeforeStart.json() as { data: { id: string } }).data.id;
    expect((await new CollectionService(database.db).getBatch(futureBeforeId)).accounts.some((account) => account.serviceAccountId === serviceId)).toBe(false);
    const batchResponse = await request("POST", "/api/v1/collection-batches", { collectorId: collector.id, routeId: route.id, collectionDate });
    expect(batchResponse.statusCode).toBe(200);
    const batch = (batchResponse.json() as { data: { id: string; version: number } }).data;
    batchIdForPermissionCheck = batch.id;
    const detail = await request("GET", `/api/v1/collection-batches/${batch.id}`);
    const initialDetail = (detail.json() as { data: { batch: { expectedCashCentavos: string }; summary: { accountCount: number; pendingCount: number; partialCount: number; collectedCount: number; uncollectedCentavos: string; totalsMatch: boolean }; accounts: Array<{ id: string; serviceAccountId: string; addressSnapshot: string | null; currentBillCentavosSnapshot: string | null; arrearsCentavosSnapshot: string | null; expectedCentavos: string }> } }).data;
    const snapshotRow = initialDetail.accounts.find((account) => account.serviceAccountId === serviceId);
    const accountId = snapshotRow?.id;
    if (!accountId || !snapshotRow) throw new Error("Synthetic service was not included in its route snapshot.");
    expect(snapshotRow.addressSnapshot).toContain("1 Test Street");
    expect(snapshotRow.currentBillCentavosSnapshot).not.toBeNull();
    expect(BigInt(snapshotRow.currentBillCentavosSnapshot!)).toBe(BigInt(invoiceRows.rows[1]?.total_centavos as string));
    expect(BigInt(snapshotRow.arrearsCentavosSnapshot!)).toBe(BigInt(invoiceRows.rows[0]?.total_centavos as string) - 1000n);
    expect(BigInt(snapshotRow.currentBillCentavosSnapshot!) + BigInt(snapshotRow.arrearsCentavosSnapshot!)).toBe(BigInt(snapshotRow.expectedCentavos));
    expect(initialDetail.summary.accountCount).toBeGreaterThanOrEqual(1);
    expect(initialDetail.summary.pendingCount + initialDetail.summary.partialCount + initialDetail.summary.collectedCount).toBe(initialDetail.summary.accountCount);
    expect(initialDetail.summary).toMatchObject({ uncollectedCentavos: initialDetail.batch.expectedCashCentavos, totalsMatch: true });
    expect((await app.inject({ method: "GET", url: `/api/v1/collection-batches/${batch.id}` })).statusCode).toBe(401);
    const start = await request("POST", `/api/v1/collection-batches/${batch.id}/start`, { version: batch.version });
    expect(start.statusCode).toBe(204);
    const batchKey = randomUUID();
    const batchPayload = { batchAccountId: accountId, amountCentavos: "500", commandKey: batchKey };
    const lostBatchResponse = await request("POST", `/api/v1/collection-batches/${batch.id}/collections`, batchPayload);
    expect(lostBatchResponse.statusCode, lostBatchResponse.body).toBe(200); // Deliberately discard its body.
    const retriedBatch = await request("POST", `/api/v1/collection-batches/${batch.id}/collections`, batchPayload);
    expect(retriedBatch.statusCode).toBe(200);
    const batchPaymentId = (retriedBatch.json() as { data: { payment: { id: string } } }).data.payment.id;
    const batchConflict = await request("POST", `/api/v1/collection-batches/${batch.id}/collections`, { ...batchPayload, amountCentavos: "501" });
    expect(batchConflict.statusCode).toBe(409);
    expect((batchConflict.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    await expectOneFinancialSet(assertions, batchKey, batchPaymentId, "500");
    const batchTotals = await assertions.query("select b.collected_cash_centavos, a.collected_centavos, (select count(*)::int from batch_collection_entries where payment_id = $1) as links from collection_batches b join collection_batch_accounts a on a.batch_id = b.id where b.id = $2 and a.id = $3", [batchPaymentId, batch.id, accountId]);
    expect(batchTotals.rows[0]).toMatchObject({ collected_cash_centavos: "500", collected_centavos: "500", links: 1 });
    const afterCollection = await request("GET", `/api/v1/collection-batches/${batch.id}`);
    const afterData = (afterCollection.json() as { data: { batch: { expectedCashCentavos: string; collectedCashCentavos: string }; summary: { accountCount: number; pendingCount: number; partialCount: number; collectedCount: number; uncollectedCentavos: string; totalsMatch: boolean }; accounts: Array<{ id: string; addressSnapshot: string | null; currentBillCentavosSnapshot: string | null; arrearsCentavosSnapshot: string | null; expectedCentavos: string }> } }).data;
    expect(afterData.accounts.find((account) => account.id === accountId)).toMatchObject({ addressSnapshot: snapshotRow.addressSnapshot, currentBillCentavosSnapshot: snapshotRow.currentBillCentavosSnapshot, arrearsCentavosSnapshot: snapshotRow.arrearsCentavosSnapshot, expectedCentavos: snapshotRow.expectedCentavos });
    expect(afterData.summary).toMatchObject({ accountCount: initialDetail.summary.accountCount, uncollectedCentavos: (BigInt(afterData.batch.expectedCashCentavos) - 500n).toString(), totalsMatch: true });
    expect(afterData.summary.partialCount + afterData.summary.collectedCount).toBeGreaterThan(initialDetail.summary.partialCount + initialDetail.summary.collectedCount);
    expect(afterData.batch.collectedCashCentavos).toBe("500");
    expect((await new CollectionService(database.db).getBatch(batch.id)).summary).toEqual(afterData.summary);
    const subscriberVersion = (await assertions.query("select version from subscribers where id = $1", [subscriberId])).rows[0]?.version as number;
    const replacementAddress = await request("POST", `/api/v1/subscribers/${subscriberId}/addresses`, { type: "SERVICE", line1: "99 Later Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: false, version: subscriberVersion });
    expect(replacementAddress.statusCode).toBe(200);
    const newAddressId = (replacementAddress.json() as { data: { id: string } }).data.id;
    const serviceVersion = (await assertions.query("select version from service_accounts where id = $1", [serviceId])).rows[0]?.version as number;
    expect((await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${serviceId}`, headers: { authorization: `Bearer ${token}` }, payload: { planId: plan.id, installationAddressId: newAddressId, status: "ACTIVE", reason: "Synthetic route-sheet address change", version: serviceVersion } })).statusCode).toBe(204);
    const immutableSheet = await request("GET", `/api/v1/collection-batches/${batch.id}`);
    expect((immutableSheet.json() as { data: { accounts: Array<{ id: string; addressSnapshot: string | null; currentBillCentavosSnapshot: string | null; arrearsCentavosSnapshot: string | null }> } }).data.accounts.find((account) => account.id === accountId)).toMatchObject({ addressSnapshot: snapshotRow.addressSnapshot, currentBillCentavosSnapshot: snapshotRow.currentBillCentavosSnapshot, arrearsCentavosSnapshot: snapshotRow.arrearsCentavosSnapshot });
    const batchState = async () => {
      const response = await request("GET", `/api/v1/collection-batches/${batch.id}`);
      expect(response.statusCode).toBe(200);
      return (response.json() as { data: { batch: { status: string; version: number; collectedCashCentavos: string; remittedCashCentavos: string; differenceCentavos: string }; remittance: { id: string } | null; reconciliation: { id: string } | null } }).data;
    };
    const submitted = await request("POST", `/api/v1/collection-batches/${batch.id}/submit`, { version: (await batchState()).batch.version });
    expect(submitted.statusCode).toBe(204);
    expect((await batchState()).batch.status).toBe("SUBMITTED");
    const beforeRemit = await batchState();
    const remitted = await request("POST", `/api/v1/collection-batches/${batch.id}/remittance`, { remittedCashCentavos: "500", notes: "Balanced synthetic remittance", version: beforeRemit.batch.version });
    expect(remitted.statusCode, remitted.body).toBe(200);
    const afterRemit = await batchState();
    expect(afterRemit.batch).toMatchObject({ status: "REMITTED", collectedCashCentavos: "500", remittedCashCentavos: "500", differenceCentavos: "0", version: beforeRemit.batch.version + 1 });
    expect(afterRemit.remittance).not.toBeNull();
    expect((await request("POST", `/api/v1/collection-batches/${batch.id}/remittance`, { remittedCashCentavos: "500", notes: "Duplicate", version: afterRemit.batch.version })).statusCode).toBe(409);
    expect((await request("POST", `/api/v1/collection-batches/${batch.id}/close`, { version: afterRemit.batch.version })).statusCode).toBe(409);
    expect((await request("POST", `/api/v1/collection-batches/${batch.id}/reconcile`, { notes: "Balanced", version: beforeRemit.batch.version })).statusCode).toBe(409);
    const balanced = await request("POST", `/api/v1/collection-batches/${batch.id}/reconcile`, { notes: "Balanced", version: afterRemit.batch.version });
    expect(balanced.statusCode, balanced.body).toBe(204);
    const afterReconcile = await batchState();
    expect(afterReconcile.batch.status).toBe("RECONCILED");
    expect(afterReconcile.reconciliation).not.toBeNull();
    expect((await request("POST", `/api/v1/collection-batches/${batch.id}/close`, { version: afterReconcile.batch.version })).statusCode).toBe(204);
    expect((await batchState()).batch.status).toBe("CLOSED");
    const lifecycleAudit = await assertions.query("select action from audit_logs where entity_id = $1 and action in ('collection_batch.remit', 'collection_batch.reconcile', 'collection_batch.closed')", [batch.id]);
    expect(lifecycleAudit.rows.map((row) => row.action).sort()).toEqual(["collection_batch.closed", "collection_batch.reconcile", "collection_batch.remit"]);
    const futureAfterStart = await request("POST", "/api/v1/collection-batches", { collectorId: futureCollectorId, routeId: route.id, collectionDate: futureDate });
    expect(futureAfterStart.statusCode).toBe(200);
    const futureAfterId = (futureAfterStart.json() as { data: { id: string } }).data.id;
    expect((await new CollectionService(database.db).getBatch(futureAfterId)).accounts.some((account) => account.serviceAccountId === serviceId)).toBe(true);
    const overageBatchResponse = await request("POST", "/api/v1/collection-batches", { collectorId: collector.id, routeId: route.id, collectionDate: futureDate });
    expect(overageBatchResponse.statusCode).toBe(200);
    const overageBatch = (overageBatchResponse.json() as { data: { id: string; version: number } }).data;
    expect((await new CollectionService(database.db).getBatch(overageBatch.id)).accounts.some((account) => account.serviceAccountId === serviceId)).toBe(false);
    expect((await request("POST", `/api/v1/collection-batches/${overageBatch.id}/start`, { version: overageBatch.version })).statusCode).toBe(204);
    expect((await request("POST", `/api/v1/collection-batches/${overageBatch.id}/submit`, { version: overageBatch.version + 1 })).statusCode).toBe(204);
    expect((await request("POST", `/api/v1/collection-batches/${overageBatch.id}/remittance`, { remittedCashCentavos: "1", notes: "Unresolved synthetic overage", version: overageBatch.version + 2 })).statusCode).toBe(200);
    const blockedReconcile = await request("POST", `/api/v1/collection-batches/${overageBatch.id}/reconcile`, { notes: "Must fail closed", version: overageBatch.version + 3 });
    expect(blockedReconcile.statusCode).toBe(409);
    expect((blockedReconcile.json() as { error: { code: string } }).error.code).toBe("DIFFERENCE_APPROVAL_REQUIRED");
    expect((await request("POST", `/api/v1/collection-batches/${overageBatch.id}/close`, { version: overageBatch.version + 3 })).statusCode).toBe(409);
    expect((await new CollectionService(database.db).getBatch(overageBatch.id)).batch).toMatchObject({ status: "REMITTED", differenceCentavos: "1" });
    const collectorReport = await request("GET", `/api/v1/reports/collector-reconciliation/preview?dateFrom=${collectionDate}&dateTo=${futureDate}`);
    expect(collectorReport.statusCode, collectorReport.body).toBe(200);
    const reportData = (collectorReport.json() as { data: { rows: Array<{ batchNumber: string; status: string; accountCount: number; collectedAccountCount: number; expectedCentavos: string; collectedCentavos: string; remittedCentavos: string; nonCashCentavos: string; uncollectedCentavos: string; differenceCentavos: string; exception: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
    const reportRows = reportData.rows;
    const balancedRow = reportRows.find((row) => row.batchNumber === (batchResponse.json() as { data: { batchNumber: string } }).data.batchNumber);
    const overageRow = reportRows.find((row) => row.batchNumber === (overageBatchResponse.json() as { data: { batchNumber: string } }).data.batchNumber);
    expect(balancedRow).toMatchObject({ status: "CLOSED", accountCount: initialDetail.summary.accountCount, collectedCentavos: "500", remittedCentavos: "500", nonCashCentavos: "0", uncollectedCentavos: afterData.summary.uncollectedCentavos, differenceCentavos: "0", exception: "BALANCED" });
    expect(overageRow).toMatchObject({ status: "REMITTED", collectedCentavos: "0", remittedCentavos: "1", nonCashCentavos: "0", differenceCentavos: "1", exception: "OVERAGE" });
    expect(BigInt(balancedRow!.expectedCentavos) - BigInt(balancedRow!.collectedCentavos)).toBe(BigInt(balancedRow!.uncollectedCentavos));
    expect(BigInt(overageRow!.expectedCentavos) - BigInt(overageRow!.collectedCentavos)).toBe(BigInt(overageRow!.uncollectedCentavos));
    const summaryValue = (label: string) => reportData.summary.find((item) => item.label === label)?.value;
    expect(summaryValue("Confirmed difference")).toBe(reportRows.filter((row) => !row.exception.includes("NOT REMITTED")).reduce((sum, row) => sum + BigInt(row.differenceCentavos), 0n).toString());
    expect(summaryValue("Uncollected")).toBe(reportRows.reduce((sum, row) => sum + BigInt(row.uncollectedCentavos), 0n).toString());
    const performanceUrl = `/api/v1/reports/collector-performance/preview?dateFrom=${collectionDate}&dateTo=${futureDate}`;
    const performanceResponse = await request("GET", performanceUrl);
    expect(performanceResponse.statusCode, performanceResponse.body).toBe(200);
    const performance = (performanceResponse.json() as { data: { rows: Array<{ collector: string; batchCount: number; accountCount: number; collectedAccountCount: number; expectedCentavos: string; collectedCentavos: string; remittedCentavos: string; confirmedDifferenceCentavos: string; unremittedBatches: number; unresolvedDifferenceBatches: number; totalsMismatchBatches: number }>; summary: Array<{ label: string; value: string | number }> } }).data;
    const independentPerformance = await assertions.query("select b.expected_cash_centavos, b.collected_cash_centavos, b.remitted_cash_centavos, b.difference_centavos, r.id as remittance_id, (select count(*)::int from collection_batch_accounts a where a.batch_id = b.id) as accounts, (select count(*)::int from collection_batch_accounts a where a.batch_id = b.id and a.status = 'COLLECTED') as collected_accounts, (select coalesce(sum(a.expected_centavos), 0) from collection_batch_accounts a where a.batch_id = b.id) as account_expected, (select coalesce(sum(a.collected_centavos), 0) from collection_batch_accounts a where a.batch_id = b.id) as account_collected from collection_batches b left join collector_remittances r on r.batch_id = b.id where b.collector_id = $1 and b.collection_date between $2::date and $3::date", [collector.id, collectionDate, futureDate]);
    const collectorPerformance = performance.rows.find((row) => row.collector === collector.displayName);
    expect(collectorPerformance).toBeDefined();
    const independentRows = independentPerformance.rows;
    expect(collectorPerformance).toMatchObject({
      batchCount: independentRows.length,
      accountCount: independentRows.reduce((total, row) => total + Number(row.accounts), 0),
      collectedAccountCount: independentRows.reduce((total, row) => total + Number(row.collected_accounts), 0),
      expectedCentavos: independentRows.reduce((total, row) => total + BigInt(row.expected_cash_centavos as string), 0n).toString(),
      collectedCentavos: independentRows.reduce((total, row) => total + BigInt(row.collected_cash_centavos as string), 0n).toString(),
      remittedCentavos: independentRows.reduce((total, row) => total + BigInt(row.remitted_cash_centavos as string), 0n).toString(),
      confirmedDifferenceCentavos: independentRows.reduce((total, row) => total + (row.remittance_id ? BigInt(row.difference_centavos as string) : 0n), 0n).toString(),
      unremittedBatches: independentRows.filter((row) => !row.remittance_id).length,
      unresolvedDifferenceBatches: independentRows.filter((row) => row.remittance_id && BigInt(row.difference_centavos as string) !== 0n).length,
      totalsMismatchBatches: independentRows.filter((row) => row.account_expected !== row.expected_cash_centavos || row.account_collected !== row.collected_cash_centavos).length
    });
    expect(BigInt(collectorPerformance!.confirmedDifferenceCentavos)).toBeGreaterThanOrEqual(1n);
    expect(collectorPerformance!.unresolvedDifferenceBatches).toBeGreaterThanOrEqual(1);
    expect(performance.summary).toContainEqual({ label: "Confirmed difference", value: performance.rows.reduce((total, row) => total + BigInt(row.confirmedDifferenceCentavos), 0n).toString(), type: "money" });
    const emptyPerformance = await request("GET", "/api/v1/reports/collector-performance/preview?dateFrom=1900-01-01&dateTo=1900-01-01");
    expect(emptyPerformance.statusCode).toBe(200);
    expect((emptyPerformance.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string | number }> } }).data).toMatchObject({ rows: [], summary: expect.arrayContaining([{ label: "Confirmed difference", value: "0", type: "money" }]) });
    expect((await request("GET", "/api/v1/reports/collector-performance/preview?dateFrom=2026-02-30&dateTo=2026-03-01")).statusCode).toBe(400);
    expect((await request("GET", "/api/v1/reports/collector-performance/preview?dateFrom=2026-10-03&dateTo=2026-10-02")).statusCode).toBe(400);
    expect((await request("GET", "/api/v1/reports/collector-performance/preview?dateFrom=2025-01-01&dateTo=2026-12-31")).statusCode).toBe(400);
    const exportUrl = `/api/v1/reports/collector-reconciliation/export?dateFrom=${collectionDate}&dateTo=${futureDate}`;
    const pdf = await request("GET", `${exportUrl}&format=pdf`);
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const xlsx = await request("GET", `${exportUrl}&format=xlsx`);
    expect(xlsx.statusCode, xlsx.body).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.rawPayload as never);
    const sheet = workbook.getWorksheet("Report");
    expect(sheet?.getRow(1).values).toContain("Exception / remittance state");
    const exportedBalanced = sheet?.getRows(2, sheet.rowCount - 1)?.find((row) => row.getCell(1).value === balancedRow?.batchNumber);
    expect(exportedBalanced?.getCell(9).value).toBe(5);
    const exceptionColumn = (sheet?.getRow(1).values as Array<unknown> | undefined)?.findIndex((value) => value === "Exception / remittance state");
    expect(exceptionColumn).toBeGreaterThan(0);
    expect(exportedBalanced?.getCell(exceptionColumn ?? -1).value).toBe("BALANCED");
    const reconciliation = await assertions.query("select (select coalesce(sum(total_centavos - paid_centavos), 0) from invoices where subscriber_id = $1) as receivable, (select coalesce(sum(debit_centavos - credit_centavos), 0) from ledger_entries where subscriber_id = $1) as ledger_net", [subscriberId]);
    expect(reconciliation.rows[0]?.ledger_net).toBe(reconciliation.rows[0]?.receivable);
    expect(BigInt(invoiceRows.rows[0]?.total_centavos as string) + BigInt(invoiceRows.rows[1]?.total_centavos as string) - 1500n).toBe(BigInt(reconciliation.rows[0]?.receivable as string));
  }, 120_000);

  it("rejects generic service-control PATCH and requires independent actors", async () => {
    if (!app || !database || !assertions) throw new Error("Integration setup did not finish.");
    const makeActor = async (roleCode: "OWNER" | "VIEWER") => {
      const username = `gate1_${roleCode.toLowerCase()}_${randomUUID()}`;
      const password = randomBytes(24).toString("base64url");
      const roleResult = await assertions!.query("select id from roles where code = $1", [roleCode]);
      const roleId = roleResult.rows[0]?.id as string | undefined;
      if (!roleId) throw new Error(`Missing ${roleCode} role in bcis_test.`);
      const [user] = await database!.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 1 ${roleCode} Test`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
      if (!user) throw new Error("Could not create test actor.");
      await database!.db.insert(userRoles).values({ userId: user.id, roleId });
      const response = await app!.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
      expect(response.statusCode).toBe(200);
      return { userId: user.id, token: (response.json() as { data: { token: string } }).data.token };
    };
    const requester = await makeActor("OWNER");
    const approver = await makeActor("OWNER");
    const completer = await makeActor("OWNER");
    const viewer = await makeActor("VIEWER");
    if (!batchIdForPermissionCheck) throw new Error("Synthetic batch fixture is missing.");
    expect((await app.inject({ method: "GET", url: `/api/v1/collection-batches/${batchIdForPermissionCheck}`, headers: { authorization: `Bearer ${viewer.token}` } })).statusCode).toBe(403);
    const request = async (token: string, method: "GET" | "POST" | "PATCH", url: string, payload?: Record<string, unknown>) => {
      const options = { method, url, headers: { authorization: `Bearer ${token}` } };
      return payload === undefined ? await app!.inject(options) : await app!.inject({ ...options, payload });
    };

    const created = await request(requester.token, "POST", "/api/v1/subscribers", {
      firstName: "GateOne", lastName: "ServiceControl", billingDay: 1, dueDay: 15,
      addresses: [{ type: "SERVICE", line1: "2 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000002", isPrimary: true }]
    });
    expect(created.statusCode).toBe(200);
    const subscriberId = (created.json() as { data: { id: string } }).data.id;
    const profile = await request(requester.token, "GET", `/api/v1/subscribers/${subscriberId}`);
    const addressId = (profile.json() as { data: { addresses: Array<{ id: string }> } }).data.addresses[0]?.id;
    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    if (!addressId || !plan) throw new Error("Test address or plan is missing.");
    const service = await request(requester.token, "POST", "/api/v1/service-accounts", { subscriberId, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 });
    expect(service.statusCode).toBe(200);
    const serviceId = (service.json() as { data: { id: string; version: number } }).data.id;
    const current = async () => {
      const result = await assertions!.query("select status, version from service_accounts where id = $1", [serviceId]);
      return result.rows[0] as { status: string; version: number };
    };
    const edit = (status: string, version: number) => ({ planId: plan.id, installationAddressId: addressId, status, reason: "Gate 1 authorization regression", version });
    const directSuspend = await request(requester.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, edit("SUSPENDED", (await current()).version));
    expect(directSuspend.statusCode).toBe(409);
    expect((directSuspend.json() as { error: { code: string } }).error.code).toBe("SERVICE_CONTROL_WORKFLOW_REQUIRED");
    const directDisconnect = await request(requester.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, edit("DISCONNECTED", (await current()).version));
    expect(directDisconnect.statusCode).toBe(409);
    const deniedViewer = await request(viewer.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, edit("ACTIVE", (await current()).version));
    expect(deniedViewer.statusCode).toBe(403);
    expect((await current()).status).toBe("ACTIVE");

    const asOf = new Date().toISOString().slice(0, 10);
    const suspensionResponse = await request(requester.token, "POST", "/api/v1/suspensions", { serviceAccountId: serviceId, asOf, reason: "Synthetic manual suspension test" });
    expect(suspensionResponse.statusCode).toBe(200);
    const suspension = (suspensionResponse.json() as { data: { id: string; version: number } }).data;
    const earlyComplete = await request(completer.token, "POST", `/api/v1/suspensions/${suspension.id}/complete`, { version: suspension.version });
    expect(earlyComplete.statusCode).toBe(409);
    const selfApproval = await request(requester.token, "POST", `/api/v1/suspensions/${suspension.id}/approve`, { version: suspension.version, notes: "Not independent" });
    expect(selfApproval.statusCode).toBe(409);
    expect((selfApproval.json() as { error: { code: string } }).error.code).toBe("SERVICE_CONTROL_SEPARATION_REQUIRED");
    const approved = await request(approver.token, "POST", `/api/v1/suspensions/${suspension.id}/approve`, { version: suspension.version, notes: "Approved test" });
    expect(approved.statusCode).toBe(204);
    const selfCompletion = await request(approver.token, "POST", `/api/v1/suspensions/${suspension.id}/complete`, { version: suspension.version + 1 });
    expect(selfCompletion.statusCode).toBe(409);
    const completed = await request(completer.token, "POST", `/api/v1/suspensions/${suspension.id}/complete`, { version: suspension.version + 1 });
    expect(completed.statusCode).toBe(204);
    expect((await current()).status).toBe("SUSPENDED");

    const directReconnect = await request(requester.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, edit("ACTIVE", (await current()).version));
    expect(directReconnect.statusCode).toBe(409);
    expect((directReconnect.json() as { error: { code: string } }).error.code).toBe("SERVICE_CONTROL_WORKFLOW_REQUIRED");
    const reconnectionResponse = await request(requester.token, "POST", "/api/v1/reconnections", { serviceAccountId: serviceId, reason: "Synthetic manual reconnection test" });
    expect(reconnectionResponse.statusCode).toBe(200);
    const reconnection = (reconnectionResponse.json() as { data: { id: string; version: number } }).data;
    expect((await request(requester.token, "POST", `/api/v1/reconnections/${reconnection.id}/approve`, { version: reconnection.version, notes: "Not independent" })).statusCode).toBe(409);
    expect((await request(approver.token, "POST", `/api/v1/reconnections/${reconnection.id}/approve`, { version: reconnection.version, notes: "Approved test" })).statusCode).toBe(204);
    expect((await request(approver.token, "POST", `/api/v1/reconnections/${reconnection.id}/complete`, { version: reconnection.version + 1 })).statusCode).toBe(409);
    expect((await request(completer.token, "POST", `/api/v1/reconnections/${reconnection.id}/complete`, { version: reconnection.version + 1 })).statusCode).toBe(204);
    expect((await current()).status).toBe("ACTIVE");

    const ordinaryEdit = await request(requester.token, "PATCH", `/api/v1/service-accounts/${serviceId}`, edit("ACTIVE", (await current()).version));
    expect(ordinaryEdit.statusCode).toBe(204);
    const history = await assertions.query("select action, count(*)::int as count from audit_logs where action in ('suspension.request','suspension.approve','suspension.complete','reconnection.request','reconnection.approve','reconnection.complete') and entity_id in ($1, $2) group by action", [suspension.id, reconnection.id]);
    expect(Object.fromEntries(history.rows.map((row) => [row.action, row.count]))).toMatchObject({ "suspension.request": 1, "suspension.approve": 1, "suspension.complete": 1, "reconnection.request": 1, "reconnection.approve": 1, "reconnection.complete": 1 });
    const actors = await assertions.query("select requested_by, approved_by, completed_by from suspension_records where id = $1", [suspension.id]);
    expect(actors.rows[0]).toMatchObject({ requested_by: requester.userId, approved_by: approver.userId, completed_by: completer.userId });
  }, 120_000);

  it("authorizes collection setup and batch reports by role", async () => {
    if (!database || !assertions) throw new Error("Integration setup did not finish.");
    const auth = new AuthService(new PostgresAuthStore(database.db));
    const roleApp = await buildApp({
      allowedOrigins: [], authService: auth,
      subscriberService: new SubscriberService(database.db),
      collectionService: new CollectionService(database.db),
      reportService: new ReportService(database.db)
    });
    try {
      const makeToken = async (roleCode: "OWNER" | "COLLECTION_SUPERVISOR" | "VIEWER") => {
        const username = `gate3_${roleCode.toLowerCase()}_${randomUUID()}`;
        const password = randomBytes(24).toString("base64url");
        const role = await assertions!.query("select id from roles where code = $1", [roleCode]);
        const [user] = await database!.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 3 ${roleCode}`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
        if (!user || !role.rows[0]?.id) throw new Error(`Missing ${roleCode} test actor.`);
        await database!.db.insert(userRoles).values({ userId: user.id, roleId: role.rows[0].id as string });
        const login = await roleApp.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
        expect(login.statusCode).toBe(200);
        return (login.json() as { data: { token: string } }).data.token;
      };
      const owner = await makeToken("OWNER");
      const supervisor = await makeToken("COLLECTION_SUPERVISOR");
      const viewer = await makeToken("VIEWER");
      const call = (token: string, method: "GET" | "POST" | "PATCH", url: string, payload?: Record<string, unknown>) => roleApp.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
      if (!serviceIdForAssignmentCheck) throw new Error("Synthetic service assignment fixture is missing.");
      const assignmentUrl = `/api/v1/service-accounts/${serviceIdForAssignmentCheck}/collector-assignments`;
      expect((await roleApp.inject({ method: "GET", url: assignmentUrl })).statusCode).toBe(401);
      expect((await call(viewer, "GET", assignmentUrl)).statusCode).toBe(403);
      expect((await call(owner, "GET", assignmentUrl)).statusCode).toBe(200);
      const persistedAssignments = await call(supervisor, "GET", assignmentUrl);
      expect(persistedAssignments.statusCode).toBe(200);
      expect((persistedAssignments.json() as { data: Array<{ effectiveTo: string | null }> }).data).toHaveLength(2);
      const assignmentAsOf = (persistedAssignments.json() as { data: Array<{ effectiveFrom: string }> }).data[0]?.effectiveFrom;
      if (!assignmentAsOf) throw new Error("Assignment report date fixture is missing.");
      const assignmentReportUrl = `/api/v1/reports/collector-assignments/preview?asOf=${assignmentAsOf}`;
      expect((await roleApp.inject({ method: "GET", url: assignmentReportUrl })).statusCode).toBe(401);
      expect((await call(owner, "GET", assignmentReportUrl)).statusCode).toBe(200);
      expect((await call(supervisor, "GET", assignmentReportUrl)).statusCode).toBe(200);
      expect((await call(viewer, "GET", assignmentReportUrl)).statusCode).toBe(200);
      expect((await call(viewer, "GET", assignmentReportUrl.replace("/preview?", "/export?format=pdf&"))).statusCode).toBe(403);
      const assignmentPdf = await call(supervisor, "GET", assignmentReportUrl.replace("/preview?", "/export?format=pdf&"));
      expect(assignmentPdf.statusCode, assignmentPdf.body.slice(0, 200)).toBe(200);
      expect(assignmentPdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      const assignmentXlsx = await call(owner, "GET", assignmentReportUrl.replace("/preview?", "/export?format=xlsx&"));
      expect(assignmentXlsx.statusCode, assignmentXlsx.body.slice(0, 200)).toBe(200);
      const assignmentWorkbook = new ExcelJS.Workbook();
      await assignmentWorkbook.xlsx.load(assignmentXlsx.rawPayload as never);
      expect(assignmentWorkbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("collector-assignments");
      expect(assignmentWorkbook.getWorksheet("Report")?.rowCount).toBeGreaterThan(1);
      expect((await call(supervisor, "GET", `/api/v1/service-accounts/${randomUUID()}/collector-assignments`)).statusCode).toBe(404);
      expect((await roleApp.inject({ method: "GET", url: "/api/v1/collection-setup" })).statusCode).toBe(401);
      expect((await call(viewer, "GET", "/api/v1/collection-setup")).statusCode).toBe(403);
      expect((await call(owner, "GET", "/api/v1/collection-setup")).statusCode).toBe(200);
      expect((await call(supervisor, "GET", "/api/v1/collection-setup")).statusCode).toBe(200);
      const code = randomUUID().slice(0, 12).toUpperCase();
      expect((await call(viewer, "POST", "/api/v1/collection-areas", { code: `A${code}`, name: "Denied area" })).statusCode).toBe(403);
      expect((await call(supervisor, "POST", "/api/v1/collection-areas", { code: " ", name: "Invalid" })).statusCode).toBe(400);
      const areaResponse = await call(supervisor, "POST", "/api/v1/collection-areas", { code: `A${code}`, name: "Synthetic Area" });
      expect(areaResponse.statusCode, areaResponse.body).toBe(200);
      const areaId = (areaResponse.json() as { data: { id: string } }).data.id;
      const routeResponse = await call(supervisor, "POST", "/api/v1/collection-routes", { areaId, code: `R${code}`, name: "Synthetic Route" });
      expect(routeResponse.statusCode, routeResponse.body).toBe(200);
      const routeId = (routeResponse.json() as { data: { id: string } }).data.id;
      const collectorResponse = await call(supervisor, "POST", "/api/v1/collectors", { code: `C${code}`, displayName: "Synthetic Collector" });
      expect(collectorResponse.statusCode, collectorResponse.body).toBe(200);
      const collectorId = (collectorResponse.json() as { data: { id: string } }).data.id;
      expect((await call(viewer, "POST", "/api/v1/collection-batches", { collectorId, routeId, collectionDate: "2026-10-02" })).statusCode).toBe(403);
      expect((await call(supervisor, "POST", "/api/v1/collection-batches", { collectorId, routeId, collectionDate: "2026-02-30" })).statusCode).toBe(400);
      const batchResponse = await call(supervisor, "POST", "/api/v1/collection-batches", { collectorId, routeId, collectionDate: "2026-10-02" });
      expect(batchResponse.statusCode, batchResponse.body).toBe(200);
      const batchId = (batchResponse.json() as { data: { id: string } }).data.id;
      expect((await call(viewer, "GET", `/api/v1/collection-batches/${batchId}`)).statusCode).toBe(403);
      expect((await call(owner, "GET", `/api/v1/collection-batches/${batchId}`)).statusCode).toBe(200);
      const report = await call(supervisor, "GET", "/api/v1/reports/collector-reconciliation/preview?dateFrom=2026-10-02&dateTo=2026-10-02");
      expect(report.statusCode, report.body).toBe(200);
      expect((report.json() as { data: { rows: Array<{ batchNumber: string }> } }).data.rows.some((row) => row.batchNumber === (batchResponse.json() as { data: { batchNumber: string } }).data.batchNumber)).toBe(true);
      expect((await call(viewer, "GET", "/api/v1/reports/collector-reconciliation/preview?dateFrom=2026-10-02&dateTo=2026-10-02")).statusCode).toBe(200);
      expect((await roleApp.inject({ method: "GET", url: "/api/v1/reports/collector-reconciliation/preview?dateFrom=2026-10-02&dateTo=2026-10-02" })).statusCode).toBe(401);
      expect((await call(viewer, "GET", "/api/v1/reports/collector-reconciliation/export?dateFrom=2026-10-02&dateTo=2026-10-02&format=pdf")).statusCode).toBe(403);
      const performanceRoleUrl = "/api/v1/reports/collector-performance/preview?dateFrom=2026-10-02&dateTo=2026-10-02";
      expect((await roleApp.inject({ method: "GET", url: performanceRoleUrl })).statusCode).toBe(401);
      expect((await call(owner, "GET", performanceRoleUrl)).statusCode).toBe(200);
      expect((await call(supervisor, "GET", performanceRoleUrl)).statusCode).toBe(200);
      expect((await call(viewer, "GET", performanceRoleUrl)).statusCode).toBe(200);
      expect((await call(viewer, "GET", performanceRoleUrl.replace("/preview?", "/export?format=pdf&"))).statusCode).toBe(403);
      const performancePdf = await call(supervisor, "GET", performanceRoleUrl.replace("/preview?", "/export?format=pdf&"));
      expect(performancePdf.statusCode, performancePdf.body.slice(0, 200)).toBe(200);
      expect(performancePdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      const performanceXlsx = await call(owner, "GET", performanceRoleUrl.replace("/preview?", "/export?format=xlsx&"));
      expect(performanceXlsx.statusCode, performanceXlsx.body.slice(0, 200)).toBe(200);
      const performanceWorkbook = new ExcelJS.Workbook();
      await performanceWorkbook.xlsx.load(performanceXlsx.rawPayload as never);
      expect(performanceWorkbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("collector-performance");
      expect(performanceWorkbook.getWorksheet("Report")?.getRow(1).values).toContain("Unresolved difference batches");
      const dashboardUrl = "/api/v1/dashboard?asOf=2026-10-02";
      expect((await roleApp.inject({ method: "GET", url: dashboardUrl })).statusCode).toBe(401);
      const ownerDashboard = await call(owner, "GET", dashboardUrl);
      const viewerDashboard = await call(viewer, "GET", dashboardUrl);
      expect(ownerDashboard.statusCode, ownerDashboard.body).toBe(200);
      expect(viewerDashboard.statusCode, viewerDashboard.body).toBe(200);
      const summary = (ownerDashboard.json() as { data: { collectedCentavos: string; paymentMethods: Array<{ method: string; amountCentavos: string; paymentCount: number }>; collectorPerformance: Array<{ collectorId: string; batchCount: number; expectedCentavos: string; collectedCentavos: string }>; overdueAlerts: Array<{ accountNumber: string; totalArrearsCentavos: string }>; recentPayments: Array<{ paymentNumber: string; amountCentavos: string }> } }).data;
      expect((viewerDashboard.json() as { data: unknown }).data).toEqual(summary);
      expect(summary.paymentMethods.reduce((total, row) => total + BigInt(row.amountCentavos), 0n).toString()).toBe(summary.collectedCentavos);
      const paymentTotals = await assertions.query("select method, count(*)::int as payment_count, coalesce(sum(amount_centavos), 0)::text as amount from payments where paid_at::date between '2026-10-01'::date and '2026-10-02'::date and (reversed_at is null or reversed_at::date > '2026-10-02'::date) group by method");
      expect(summary.paymentMethods).toEqual(paymentTotals.rows.map((row) => ({ method: row.method, paymentCount: row.payment_count, amountCentavos: row.amount })));
      const collectorTotals = await assertions.query("select c.id, count(*)::int as batch_count, coalesce(sum(b.expected_cash_centavos), 0)::text as expected, coalesce(sum(b.collected_cash_centavos), 0)::text as collected from collection_batches b join collectors c on c.id = b.collector_id where b.collection_date between '2026-10-01'::date and '2026-10-02'::date group by c.id, c.display_name order by sum(b.collected_cash_centavos) desc, c.display_name asc limit 5");
      expect(summary.collectorPerformance.map((row) => ({ collectorId: row.collectorId, batchCount: row.batchCount, expectedCentavos: row.expectedCentavos, collectedCentavos: row.collectedCentavos }))).toEqual(collectorTotals.rows.map((row) => ({ collectorId: row.id, batchCount: row.batch_count, expectedCentavos: row.expected, collectedCentavos: row.collected })));
      const overdue = await new ReceivableService(database.db).overdueAccounts({ asOf: "2026-10-02", page: 1, pageSize: 5 });
      expect(summary.overdueAlerts.map((row) => ({ accountNumber: row.accountNumber, totalArrearsCentavos: row.totalArrearsCentavos }))).toEqual(overdue.items.map((row) => ({ accountNumber: row.accountNumber, totalArrearsCentavos: row.totalArrearsCentavos })));
      const recent = await assertions.query("select payment_number, amount_centavos::text as amount from payments where paid_at::date <= '2026-10-02'::date and (reversed_at is null or reversed_at::date > '2026-10-02'::date) order by paid_at desc, id desc limit 5");
      expect(summary.recentPayments.map((row) => ({ paymentNumber: row.paymentNumber, amountCentavos: row.amountCentavos }))).toEqual(recent.rows.map((row) => ({ paymentNumber: row.payment_number, amountCentavos: row.amount })));
      const emptyDashboard = await call(owner, "GET", "/api/v1/dashboard?asOf=1900-01-01");
      expect(emptyDashboard.statusCode).toBe(200);
      expect((emptyDashboard.json() as { data: { paymentMethods: unknown[]; collectorPerformance: unknown[]; recentPayments: unknown[] } }).data).toMatchObject({ paymentMethods: [], collectorPerformance: [], recentPayments: [] });
      expect((await call(owner, "GET", "/api/v1/dashboard?asOf=2026-02-30")).statusCode).toBe(400);
      const reportDates = (await assertions.query("select current_date::text as today, (current_date - interval '10 days')::date::text as \"tenDaysAgo\"")).rows[0] as { today: string; tenDaysAgo: string } | undefined;
      if (!reportDates) throw new Error("The test database did not return its reporting dates.");
      const { today: reportDay, tenDaysAgo } = reportDates;
      const dailyUrl = `/api/v1/reports/daily-collections/preview?dateFrom=${reportDay}&dateTo=${reportDay}`;
      const dailyResponse = await call(owner, "GET", dailyUrl);
      expect(dailyResponse.statusCode, dailyResponse.body).toBe(200);
      const daily = (dailyResponse.json() as { data: { rows: Array<{ paymentNumber: string; accountNumber: string; method: string; amountCentavos: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
      const postedToday = await assertions.query("select p.payment_number, s.account_number, p.method, p.amount_centavos::text as amount from payments p join subscribers s on s.id = p.subscriber_id where p.status = 'POSTED' and p.paid_at::date = $1::date order by p.paid_at, p.payment_number", [reportDay]);
      expect(daily.rows.length).toBeGreaterThan(0);
      expect(daily.rows.map((row) => ({ paymentNumber: row.paymentNumber, accountNumber: row.accountNumber, method: row.method, amountCentavos: row.amountCentavos }))).toEqual(postedToday.rows.map((row) => ({ paymentNumber: row.payment_number, accountNumber: row.account_number, method: row.method, amountCentavos: row.amount })));
      expect(daily.summary.find((row) => row.label === "Collections")?.value).toBe(postedToday.rows.reduce((total, row) => total + BigInt(row.amount), 0n).toString());
      const weeklyUrl = `/api/v1/reports/weekly-collections/preview?dateFrom=${tenDaysAgo}&dateTo=${reportDay}`;
      const weeklyResponse = await call(owner, "GET", weeklyUrl);
      expect(weeklyResponse.statusCode, weeklyResponse.body).toBe(200);
      const weekly = (weeklyResponse.json() as { data: { rows: Array<{ weekStart: string; method: string; paymentCount: number; amountCentavos: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
      const weeklySql = await assertions.query("select date_trunc('week', paid_at)::date::text as week_start, method, count(*)::int as payment_count, sum(amount_centavos)::text as amount from payments where status = 'POSTED' and paid_at::date between $1::date and $2::date group by date_trunc('week', paid_at)::date, method order by week_start, method", [tenDaysAgo, reportDay]);
      expect(weekly.rows.map((row) => ({ weekStart: row.weekStart, method: row.method, paymentCount: row.paymentCount, amountCentavos: row.amountCentavos }))).toEqual(weeklySql.rows.map((row) => ({ weekStart: row.week_start, method: row.method, paymentCount: row.payment_count, amountCentavos: row.amount })));
      expect(weekly.summary.find((row) => row.label === "Collections")?.value).toBe(weeklySql.rows.reduce((total, row) => total + BigInt(row.amount), 0n).toString());
      const reportYear = reportDay.slice(0, 4);
      const annualRange = `dateFrom=${reportYear}-01-01&dateTo=${reportYear}-12-31`;
      const annualUrl = `/api/v1/reports/annual-collections/preview?${annualRange}`;
      const annualResponse = await call(owner, "GET", annualUrl);
      expect(annualResponse.statusCode, annualResponse.body).toBe(200);
      const annual = (annualResponse.json() as { data: { rows: Array<{ monthStart: string; method: string; paymentCount: number; amountCentavos: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
      const annualSql = await assertions.query("select date_trunc('month', paid_at)::date::text as month_start, method, count(*)::int as payment_count, sum(amount_centavos)::text as amount from payments where status = 'POSTED' and paid_at::date between $1::date and $2::date group by date_trunc('month', paid_at)::date, method order by month_start, method", [`${reportYear}-01-01`, `${reportYear}-12-31`]);
      expect(annual.rows.map((row) => ({ monthStart: row.monthStart, method: row.method, paymentCount: row.paymentCount, amountCentavos: row.amountCentavos }))).toEqual(annualSql.rows.map((row) => ({ monthStart: row.month_start, method: row.method, paymentCount: row.payment_count, amountCentavos: row.amount })));
      const annualTotal = annualSql.rows.reduce((total, row) => total + BigInt(row.amount), 0n).toString();
      expect(annual.summary.find((row) => row.label === "Collections")?.value).toBe(annualTotal);
      const existingMonthly = await call(owner, "GET", `/api/v1/reports/monthly-collections/preview?${annualRange}`);
      expect(existingMonthly.statusCode).toBe(200);
      expect((existingMonthly.json() as { data: { summary: Array<{ label: string; value: string | number }> } }).data.summary.find((row) => row.label === "Collections")?.value).toBe(annualTotal);
      expect((await call(viewer, "GET", annualUrl)).statusCode).toBe(200);
      expect((await roleApp.inject({ method: "GET", url: annualUrl })).statusCode).toBe(401);
      expect((await call(viewer, "GET", `/api/v1/reports/annual-collections/export?${annualRange}&format=pdf`)).statusCode).toBe(403);
      const annualPdf = await call(owner, "GET", `/api/v1/reports/annual-collections/export?${annualRange}&format=pdf`);
      expect(annualPdf.statusCode, annualPdf.body.slice(0, 200)).toBe(200);
      expect(annualPdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      const annualXlsx = await call(owner, "GET", `/api/v1/reports/annual-collections/export?${annualRange}&format=xlsx`);
      expect(annualXlsx.statusCode, annualXlsx.body.slice(0, 200)).toBe(200);
      const annualWorkbook = new ExcelJS.Workbook();
      await annualWorkbook.xlsx.load(annualXlsx.rawPayload as never);
      expect(annualWorkbook.getWorksheet("Report")?.rowCount).toBe(annual.rows.length + 1);
      expect(annualWorkbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("annual-collections");
      expect(annualWorkbook.getWorksheet("Report")?.getCell("D2").value).toBe(Number(BigInt(annual.rows[0]?.amountCentavos ?? "0")) / 100);
      const emptyAnnual = await call(owner, "GET", "/api/v1/reports/annual-collections/preview?dateFrom=1900-01-01&dateTo=1900-12-31");
      expect(emptyAnnual.statusCode).toBe(200);
      expect((emptyAnnual.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string | number }> } }).data).toMatchObject({ rows: [], summary: expect.arrayContaining([{ label: "Collections", value: "0", type: "money" }]) });
      expect((await call(owner, "GET", "/api/v1/reports/annual-collections/preview?dateFrom=2024-01-01&dateTo=2024-12-31")).statusCode).toBe(200);
      expect((await call(owner, "GET", "/api/v1/reports/annual-collections/preview?dateFrom=2026-01-02&dateTo=2026-12-31")).statusCode).toBe(400);
      expect((await call(owner, "GET", "/api/v1/reports/annual-collections/preview?dateFrom=2026-01-01&dateTo=2027-01-01")).statusCode).toBe(400);
      expect((await call(owner, "GET", "/api/v1/reports/annual-collections/preview?dateFrom=2026-02-30&dateTo=2026-12-31")).statusCode).toBe(400);
      const compareUrl = (date: string) => `/api/v1/reports/billing-vs-collection/preview?dateFrom=${date}&dateTo=${date}`;
      const compareResponse = await call(owner, "GET", compareUrl(reportDay));
      expect(compareResponse.statusCode, compareResponse.body).toBe(200);
      const comparison = (compareResponse.json() as { data: { rows: Array<{ monthStart: string; invoiceCount: number; billedCentavos: string; paymentCount: number; collectedCentavos: string; differenceCentavos: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
      const periodTotals = await assertions.query("select (select count(*)::int from invoices where status <> 'VOID' and invoice_date = $1::date) as invoice_count, (select coalesce(sum(total_centavos), 0)::text from invoices where status <> 'VOID' and invoice_date = $1::date) as billed, (select count(*)::int from payments where status = 'POSTED' and paid_at::date = $1::date) as payment_count, (select coalesce(sum(amount_centavos), 0)::text from payments where status = 'POSTED' and paid_at::date = $1::date) as collected", [reportDay]);
      const totals = periodTotals.rows[0] as { invoice_count: number; billed: string; payment_count: number; collected: string };
      expect(comparison.rows).toHaveLength(1);
      expect(comparison.rows[0]).toMatchObject({ monthStart: `${reportDay.slice(0, 7)}-01`, invoiceCount: totals.invoice_count, billedCentavos: totals.billed, paymentCount: totals.payment_count, collectedCentavos: totals.collected, differenceCentavos: (BigInt(totals.billed) - BigInt(totals.collected)).toString() });
      expect(comparison.summary.find((row) => row.label === "Period difference")?.value).toBe((BigInt(totals.billed) - BigInt(totals.collected)).toString());
      const invoiceDayResult = await assertions.query("select invoice_date::text as invoice_day from invoices where status <> 'VOID' order by created_at desc limit 1");
      const invoiceDay = invoiceDayResult.rows[0]?.invoice_day as string | undefined;
      if (!invoiceDay) throw new Error("No finalized synthetic invoice is available for the billing comparison.");
      const invoiceComparison = await call(owner, "GET", compareUrl(invoiceDay));
      expect(invoiceComparison.statusCode).toBe(200);
      const billedOnInvoiceDay = await assertions.query("select sum(total_centavos)::text as billed from invoices where status <> 'VOID' and invoice_date = $1::date", [invoiceDay]);
      expect((invoiceComparison.json() as { data: { summary: Array<{ label: string; value: string | number }> } }).data.summary.find((row) => row.label === "Billed")?.value).toBe(billedOnInvoiceDay.rows[0]?.billed);
      expect((await call(viewer, "GET", compareUrl(reportDay))).statusCode).toBe(200);
      expect((await roleApp.inject({ method: "GET", url: compareUrl(reportDay) })).statusCode).toBe(401);
      expect((await call(viewer, "GET", `/api/v1/reports/billing-vs-collection/export?dateFrom=${reportDay}&dateTo=${reportDay}&format=pdf`)).statusCode).toBe(403);
      const comparisonPdf = await call(owner, "GET", `/api/v1/reports/billing-vs-collection/export?dateFrom=${reportDay}&dateTo=${reportDay}&format=pdf`);
      expect(comparisonPdf.statusCode, comparisonPdf.body.slice(0, 200)).toBe(200);
      expect(comparisonPdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      const comparisonXlsx = await call(owner, "GET", `/api/v1/reports/billing-vs-collection/export?dateFrom=${reportDay}&dateTo=${reportDay}&format=xlsx`);
      expect(comparisonXlsx.statusCode, comparisonXlsx.body.slice(0, 200)).toBe(200);
      const comparisonWorkbook = new ExcelJS.Workbook();
      await comparisonWorkbook.xlsx.load(comparisonXlsx.rawPayload as never);
      expect(comparisonWorkbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("billing-vs-collection");
      expect(comparisonWorkbook.getWorksheet("Report")?.getCell("F2").value).toBe(Number(BigInt(comparison.rows[0]?.differenceCentavos ?? "0")) / 100);
      const emptyComparison = await call(owner, "GET", "/api/v1/reports/billing-vs-collection/preview?dateFrom=1900-01-01&dateTo=1900-01-01");
      expect(emptyComparison.statusCode).toBe(200);
      expect((emptyComparison.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string | number }> } }).data).toMatchObject({ rows: [], summary: expect.arrayContaining([{ label: "Period difference", value: "0", type: "money" }]) });
      expect((await call(owner, "GET", "/api/v1/reports/billing-vs-collection/preview?dateFrom=2026-02-30&dateTo=2026-03-01")).statusCode).toBe(400);
      expect((await call(owner, "GET", "/api/v1/reports/billing-vs-collection/preview?dateFrom=2026-10-03&dateTo=2026-10-02")).statusCode).toBe(400);
      expect((await call(owner, "GET", "/api/v1/reports/billing-vs-collection/preview?dateFrom=2025-01-01&dateTo=2026-12-31")).statusCode).toBe(400);
      const masterFixture = await assertions.query("select sa.subscriber_id, sa.installation_address_id, sa.plan_id, s.account_number from service_accounts sa join subscribers s on s.id = sa.subscriber_id where sa.id = $1", [serviceIdForAssignmentCheck]);
      const fixture = masterFixture.rows[0] as { subscriber_id: string; installation_address_id: string; plan_id: string; account_number: string } | undefined;
      if (!fixture) throw new Error("The synthetic subscriber master fixture is missing.");
      const secondService = await call(owner, "POST", "/api/v1/service-accounts", { subscriberId: fixture.subscriber_id, planId: fixture.plan_id, installationAddressId: fixture.installation_address_id, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 });
      expect(secondService.statusCode, secondService.body).toBe(200);
      const inactiveCreated = await call(owner, "POST", "/api/v1/subscribers", { firstName: "GateThree", lastName: "InactiveMaster", billingDay: 1, dueDay: 15, addresses: [{ type: "SERVICE", line1: "4 Master Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }], contacts: [{ type: "MOBILE", value: "09170000005", isPrimary: true }] });
      expect(inactiveCreated.statusCode, inactiveCreated.body).toBe(200);
      const inactiveId = (inactiveCreated.json() as { data: { id: string } }).data.id;
      const inactiveCurrent = await assertions.query("select account_number, version from subscribers where id = $1", [inactiveId]);
      const inactiveAccount = inactiveCurrent.rows[0]?.account_number as string;
      expect((await call(owner, "PATCH", `/api/v1/subscribers/${inactiveId}`, { status: "INACTIVE", billingDay: 1, dueDay: 15, notes: "Synthetic report fixture", version: inactiveCurrent.rows[0]?.version as number })).statusCode).toBe(204);
      const masterUrl = `/api/v1/reports/subscriber-master/preview?status=ALL&search=${fixture.account_number}`;
      const masterResponse = await call(owner, "GET", masterUrl);
      expect(masterResponse.statusCode, masterResponse.body).toBe(200);
      const master = (masterResponse.json() as { data: { rows: Array<{ accountNumber: string; subscriberName: string; status: string; contact: string; address: string; serviceCount: number; activeServiceCount: number; serviceTypes: string }>; summary: Array<{ label: string; value: string | number }> } }).data;
      expect(master.rows).toHaveLength(1);
      expect(master.rows[0]).toMatchObject({ accountNumber: fixture.account_number, status: "ACTIVE", contact: "09170000001", serviceCount: 2, activeServiceCount: 2 });
      expect(master.rows[0]?.address).toContain("1 Test Street");
      expect(master.rows[0]?.serviceTypes.length).toBeGreaterThan(0);
      expect(master.summary).toContainEqual({ label: "Subscribers", value: 1, type: "integer" });
      const allMaster = await call(owner, "GET", "/api/v1/reports/subscriber-master/preview?status=ALL");
      expect(allMaster.statusCode).toBe(200);
      const allData = (allMaster.json() as { data: { rows: Array<{ accountNumber: string; serviceCount: number; status: string }>; summary: Array<{ label: string; value: number }> } }).data;
      const independentCounts = await assertions.query("select (select count(*)::int from subscribers) as subscribers, (select count(*)::int from service_accounts) as services");
      expect(allData.rows.length).toBe(independentCounts.rows[0]?.subscribers);
      expect(new Set(allData.rows.map((row) => row.accountNumber)).size).toBe(allData.rows.length);
      expect(allData.rows.reduce((total, row) => total + row.serviceCount, 0)).toBe(independentCounts.rows[0]?.services);
      expect(allData.rows.some((row) => row.accountNumber === inactiveAccount && row.status === "INACTIVE")).toBe(true);
      const inactiveMaster = await call(viewer, "GET", `/api/v1/reports/subscriber-master/preview?status=INACTIVE&search=${inactiveAccount}`);
      expect(inactiveMaster.statusCode).toBe(200);
      expect((inactiveMaster.json() as { data: { rows: Array<{ accountNumber: string; status: string }> } }).data.rows).toEqual([expect.objectContaining({ accountNumber: inactiveAccount, status: "INACTIVE" })]);
      const emptyMaster = await call(owner, "GET", `/api/v1/reports/subscriber-master/preview?search=${randomUUID()}`);
      expect(emptyMaster.statusCode).toBe(200);
      expect((emptyMaster.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: number }> } }).data).toMatchObject({ rows: [], summary: expect.arrayContaining([{ label: "Subscribers", value: 0, type: "integer" }]) });
      expect((await call(viewer, "GET", masterUrl)).statusCode).toBe(200);
      expect((await roleApp.inject({ method: "GET", url: masterUrl })).statusCode).toBe(401);
      expect((await call(viewer, "GET", `/api/v1/reports/subscriber-master/export?status=ALL&search=${fixture.account_number}&format=pdf`)).statusCode).toBe(403);
      const masterPdf = await call(owner, "GET", `/api/v1/reports/subscriber-master/export?status=ALL&search=${fixture.account_number}&format=pdf`);
      expect(masterPdf.statusCode, masterPdf.body.slice(0, 200)).toBe(200);
      expect(masterPdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      const masterXlsx = await call(owner, "GET", `/api/v1/reports/subscriber-master/export?status=ALL&search=${fixture.account_number}&format=xlsx`);
      expect(masterXlsx.statusCode, masterXlsx.body.slice(0, 200)).toBe(200);
      const masterWorkbook = new ExcelJS.Workbook();
      await masterWorkbook.xlsx.load(masterXlsx.rawPayload as never);
      expect(masterWorkbook.getWorksheet("Report")?.rowCount).toBe(2);
      expect(masterWorkbook.getWorksheet("Report")?.getCell("A2").value).toBe(fixture.account_number);
      expect(masterWorkbook.getWorksheet("Parameters")?.getCell("B2").value).toBe("subscriber-master");
      expect((await call(owner, "GET", "/api/v1/reports/subscriber-master/preview?status=BAD")).statusCode).toBe(400);
      expect((await call(owner, "GET", `/api/v1/reports/subscriber-master/preview?search=${"x".repeat(101)}`)).statusCode).toBe(400);
      expect((await call(viewer, "GET", dailyUrl)).statusCode).toBe(200);
      expect((await call(viewer, "GET", weeklyUrl)).statusCode).toBe(200);
      expect((await roleApp.inject({ method: "GET", url: dailyUrl })).statusCode).toBe(401);
      expect((await call(viewer, "GET", `/api/v1/reports/daily-collections/export?dateFrom=${reportDay}&dateTo=${reportDay}&format=pdf`)).statusCode).toBe(403);
      for (const code of ["daily-collections", "weekly-collections"] as const) {
        const range = code === "daily-collections" ? `dateFrom=${reportDay}&dateTo=${reportDay}` : `dateFrom=${tenDaysAgo}&dateTo=${reportDay}`;
        const pdf = await call(owner, "GET", `/api/v1/reports/${code}/export?${range}&format=pdf`);
        expect(pdf.statusCode, pdf.body.slice(0, 200)).toBe(200);
        expect(pdf.headers["content-type"]).toContain("application/pdf");
        expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
        const xlsx = await call(owner, "GET", `/api/v1/reports/${code}/export?${range}&format=xlsx`);
        expect(xlsx.statusCode, xlsx.body.slice(0, 200)).toBe(200);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(xlsx.rawPayload as never);
        expect(workbook.getWorksheet("Report")?.rowCount).toBeGreaterThan(1);
        expect(workbook.getWorksheet("Parameters")?.getCell("B2").value).toBe(code);
      }
      const emptyDaily = await call(owner, "GET", "/api/v1/reports/daily-collections/preview?dateFrom=1900-01-01&dateTo=1900-01-01");
      expect(emptyDaily.statusCode).toBe(200);
      expect((emptyDaily.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string | number }> } }).data).toMatchObject({ rows: [], summary: expect.arrayContaining([{ label: "Collections", value: "0", type: "money" }]) });
      expect((await call(owner, "GET", "/api/v1/reports/weekly-collections/preview?dateFrom=1900-01-01&dateTo=1900-01-10")).statusCode).toBe(200);
      expect((await call(owner, "GET", "/api/v1/reports/daily-collections/preview?dateFrom=2026-10-01&dateTo=2026-10-02")).statusCode).toBe(400);
      expect((await call(owner, "GET", "/api/v1/reports/weekly-collections/preview?dateFrom=2026-02-30&dateTo=2026-03-01")).statusCode).toBe(400);
      expect((await call(owner, "GET", "/api/v1/reports/weekly-collections/preview?dateFrom=2026-10-03&dateTo=2026-10-02")).statusCode).toBe(400);
      const empty = await call(supervisor, "GET", "/api/v1/reports/collector-reconciliation/preview?dateFrom=1900-01-01&dateTo=1900-01-01");
      expect(empty.statusCode).toBe(200);
      expect((empty.json() as { data: { rows: unknown[]; summary: Array<{ label: string; value: string | number }> } }).data).toMatchObject({ rows: [], summary: expect.arrayContaining([{ label: "Confirmed difference", value: "0", type: "money" }]) });
      expect((await call(supervisor, "GET", "/api/v1/reports/collector-reconciliation/preview?dateFrom=2026-02-30&dateTo=2026-03-01")).statusCode).toBe(400);
      expect((await call(supervisor, "GET", "/api/v1/reports/collector-reconciliation/preview?dateFrom=2026-10-03&dateTo=2026-10-02")).statusCode).toBe(400);
      const actions = await assertions.query("select action from audit_logs where entity_id = any($1::text[])", [[areaId, routeId, collectorId, batchId]]);
      expect(actions.rows.map((row) => row.action).sort()).toEqual(["collection_area.create", "collection_batch.create", "collection_route.create", "collector.create"]);
    } finally { await roleApp.close(); }
  }, 120_000);
});

async function expectOneFinancialSet(pool: Pool, commandKey: string, paymentId: string, amount: string) {
  const result = await pool.query("select p.id, p.amount_centavos, (select count(*)::int from receipts where payment_id = p.id) as receipts, (select count(*)::int from payment_allocations where payment_id = p.id) as allocations, (select count(*)::int from ledger_entries where payment_id = p.id and type = 'PAYMENT_CREDIT') as credits, (select count(*)::int from audit_logs where entity_type = 'payment' and entity_id = p.id::text and action = 'payment.post') as audits from payments p where p.command_key = $1", [commandKey]);
  expect(result.rowCount).toBe(1);
  expect(result.rows[0]).toMatchObject({ id: paymentId, amount_centavos: amount, receipts: 1, allocations: 1, credits: 1, audits: 1 });
}
