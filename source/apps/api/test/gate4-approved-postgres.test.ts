import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { servicePlans, userRoles, users } from "../src/db/schema/index.js";
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

describe.skipIf(!testUri)("Gate 4 approved financial workflows on guarded PostgreSQL", () => {
  let database: DatabaseHandle;
  let pool: Pool;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const target = new URL(testUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("Gate 4 tests require 127.0.0.1:5433/bcis_test.");
    pool = new Pool({ connectionString: testUri, max: 2 });
    const result = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (result.rows[0]?.name !== "bcis_test" || result.rows[0]?.migrations !== 19) throw new Error("The isolated test database must have all 19 migrations.");
    database = createDatabase(testUri);
    app = await makeApp(database);
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await pool?.end();
  });

  it("posts confirmed methods once, preserves references and voids only untouched invoices", async () => {
    const owner = await actor(database, pool, app, "OWNER");
    const viewer = await actor(database, pool, app, "VIEWER");
    const call = (token: string, method: "GET" | "POST", url: string, payload?: Record<string, unknown>) =>
      app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
    const created = await call(owner.token, "POST", "/api/v1/subscribers", {
      firstName: "GateFour", lastName: "ApprovedMethods", billingDay: 1, dueDay: 15,
      addresses: [{ type: "SERVICE", line1: "17 Synthetic Street", barangay: "Test", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000017", isPrimary: true }]
    });
    expect(created.statusCode).toBe(200);
    const subscriberId = created.json().data.id as string;
    const profile = await call(owner.token, "GET", `/api/v1/subscribers/${subscriberId}`);
    const addressId = profile.json().data.addresses[0]?.id as string;
    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    if (!plan || !addressId) throw new Error("Synthetic master data is missing.");
    expect((await call(owner.token, "POST", "/api/v1/service-accounts", { subscriberId, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 })).statusCode).toBe(200);
    const yearResult = await pool.query("select candidate::int as year from generate_series(9000, 9998) candidate where not exists (select 1 from billing_cycles where left(period_key, 4) = candidate::text and right(period_key, 2) in ('01','02')) order by candidate limit 1");
    const year = yearResult.rows[0]?.year as number | undefined;
    if (!year) throw new Error("No synthetic billing year remains.");
    for (const month of ["01", "02"]) expect((await call(owner.token, "POST", "/api/v1/billing/finalize", { periodKey: `${year}-${month}`, commandKey: randomUUID() })).statusCode).toBe(200);
    const invoiceRows = await pool.query("select i.id, i.total_centavos, i.status from invoices i join billing_cycles c on c.id=i.billing_cycle_id where i.subscriber_id=$1 order by c.period_key", [subscriberId]);
    expect(invoiceRows.rows).toHaveLength(2);
    const [paidInvoice, voidInvoice] = invoiceRows.rows as Array<{ id: string; total_centavos: string; status: string }>;
    if (!paidInvoice || !voidInvoice) throw new Error("Synthetic invoices missing.");
    const base = { subscriberId, amountCentavos: "100", method: "BANK_TRANSFER", commandKey: randomUUID(), externalReference: `BT${randomBytes(8).toString("hex")}` };
    expect((await call(owner.token, "POST", "/api/v1/payments", base)).statusCode).toBe(400);
    expect((await call(viewer.token, "POST", "/api/v1/payments", { ...base, receivedConfirmed: true })).statusCode).toBe(403);
    const posted = await call(owner.token, "POST", "/api/v1/payments", { ...base, receivedConfirmed: true });
    expect(posted.statusCode).toBe(200);
    const bankId = posted.json().data.payment.id as string;
    expect(posted.json().data.receipt.snapshot.externalReference).toBe(base.externalReference.toUpperCase());
    expect((await call(owner.token, "POST", "/api/v1/payments", { ...base, receivedConfirmed: true })).json().data.payment.id).toBe(bankId);
    expect((await call(owner.token, "POST", "/api/v1/payments", { ...base, commandKey: randomUUID(), receivedConfirmed: true })).statusCode).toBe(409);
    expect((await call(owner.token, "POST", "/api/v1/payments", { ...base, externalReference: `${base.externalReference.slice(0, 4)}-${base.externalReference.slice(4).toLowerCase()}`, commandKey: randomUUID(), receivedConfirmed: true })).statusCode).toBe(409);
    const cheque = await call(owner.token, "POST", "/api/v1/payments", { subscriberId, amountCentavos: "200", method: "CHEQUE", commandKey: randomUUID(), externalReference: `CH${randomBytes(8).toString("hex")}`, receivedConfirmed: true });
    expect(cheque.statusCode).toBe(200);
    const chequeId = cheque.json().data.payment.id as string;
    const otherRef = `OT${randomBytes(8).toString("hex")}`;
    expect((await call(owner.token, "POST", "/api/v1/payments", { subscriberId, amountCentavos: "300", method: "OTHER", commandKey: randomUUID(), externalReference: otherRef, receivedConfirmed: true })).statusCode).toBe(400);
    const other = await call(owner.token, "POST", "/api/v1/payments", { subscriberId, amountCentavos: "300", method: "OTHER", commandKey: randomUUID(), externalReference: otherRef, otherDescription: "Synthetic office payment", receivedConfirmed: true });
    expect(other.statusCode).toBe(200);
    const otherId = other.json().data.payment.id as string;
    expect(other.json().data.receipt.snapshot.otherDescription).toBe("Synthetic office payment");
    const paidDate = (await pool.query("select paid_at::date::text as date from payments where id=$1", [bankId])).rows[0]?.date as string;
    const daily = await call(owner.token, "GET", `/api/v1/reports/daily-collections/preview?dateFrom=${paidDate}&dateTo=${paidDate}`);
    expect(daily.statusCode).toBe(200);
    const numbers = (await pool.query("select id,payment_number from payments where id=any($1::uuid[])", [[bankId, chequeId, otherId]])).rows as Array<{ id: string; payment_number: string }>;
    const rows = daily.json().data.rows as Array<{ paymentNumber: string; method: string }>;
    expect(rows.filter((row) => numbers.some((payment) => payment.payment_number === row.paymentNumber)).map((row) => row.method).sort()).toEqual(["BANK_TRANSFER", "CHEQUE", "OTHER"].sort());
    expect((await call(viewer.token, "POST", `/api/v1/invoices/${voidInvoice.id}/void`, { reason: "Synthetic unpaid invoice void" })).statusCode).toBe(403);
    expect((await call(owner.token, "POST", `/api/v1/invoices/${paidInvoice.id}/void`, { reason: "Synthetic paid invoice void" })).statusCode).toBe(409);
    const competingVoids = await Promise.all([
      call(owner.token, "POST", `/api/v1/invoices/${voidInvoice.id}/void`, { reason: "Synthetic unpaid invoice void" }),
      call(owner.token, "POST", `/api/v1/invoices/${voidInvoice.id}/void`, { reason: "Synthetic competing void request" })
    ]);
    expect(competingVoids.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await call(owner.token, "GET", `/api/v1/invoices/${voidInvoice.id}`)).json().data).toMatchObject({ invoice: { status: "VOID", outstandingCentavos: "0" }, voidRecord: { reason: expect.stringContaining("Synthetic") } });
    expect((await pool.query("select type, credit_centavos from ledger_entries where invoice_id=$1 order by sequence_number", [voidInvoice.id])).rows).toMatchObject([{ type: "INVOICE_DEBIT", credit_centavos: "0" }, { type: "VOID_CREDIT", credit_centavos: voidInvoice.total_centavos }]);
    const bankReverse = await call(owner.token, "POST", `/api/v1/payments/${bankId}/reverse`, { reason: "Synthetic bank correction" });
    expect(bankReverse.statusCode).toBe(200);
    expect((await call(owner.token, "POST", "/api/v1/payments", { ...base, commandKey: randomUUID(), receivedConfirmed: true })).statusCode).toBe(409);
    const ledger = await pool.query("select coalesce(sum(debit_centavos-credit_centavos),0) as balance from ledger_entries where subscriber_id=$1", [subscriberId]);
    expect((await call(owner.token, "GET", `/api/v1/subscribers/${subscriberId}/statement`)).json().data.closingBalanceCentavos).toBe(ledger.rows[0]?.balance);
    const balances = await pool.query("select (select coalesce(sum(total_centavos-paid_centavos),0) from invoices where subscriber_id=$1 and status<>'VOID') as outstanding, (select coalesce(sum(remaining_centavos),0) from subscriber_credits where subscriber_id=$1 and status='AVAILABLE') as credit", [subscriberId]);
    expect(BigInt(ledger.rows[0]?.balance as string)).toBe(BigInt(balances.rows[0]?.outstanding as string) - BigInt(balances.rows[0]?.credit as string));
    await app.close();
    app = await makeApp(database);
    expect((await call(viewer.token, "GET", `/api/v1/invoices/${voidInvoice.id}`)).json().data.invoice.status).toBe("VOID");
  }, 120_000);

  it("keeps the original shortage visible and reconciles only a confirmed exact correction", async () => {
    const owner = await actor(database, pool, app, "OWNER");
    const viewer = await actor(database, pool, app, "VIEWER");
    const call = (token: string, method: "GET" | "POST", url: string, payload?: Record<string, unknown>) =>
      app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
    const collector = (await pool.query("select id from collectors order by code limit 1")).rows[0]?.id as string | undefined;
    const route = (await pool.query("select id from collection_routes order by code limit 1")).rows[0]?.id as string | undefined;
    if (!collector || !route) throw new Error("Synthetic collector or route missing.");
    const dateResult = await pool.query("select day::date::text as date from generate_series('8900-01-01'::date, '8909-12-31'::date, '1 day') day where not exists (select 1 from collection_batches where collector_id=$1 and route_id=$2 and collection_date=day::date) order by day limit 1", [collector, route]);
    const collectionDate = dateResult.rows[0]?.date as string | undefined;
    if (!collectionDate) throw new Error("No unused synthetic collection date remains.");
    const batchNumber = `BAT-G4-${randomBytes(6).toString("hex").toUpperCase()}`;
    const batch = await pool.query("insert into collection_batches(batch_number,collector_id,route_id,collection_date,status,expected_cash_centavos,collected_cash_centavos,remitted_cash_centavos,difference_centavos,created_by) values($1,$2,$3,$4,'REMITTED',1000,1000,900,-100,$5) returning id,version", [batchNumber, collector, route, collectionDate, owner.id]);
    const batchId = batch.rows[0]?.id as string;
    const remittance = await pool.query("insert into collector_remittances(remittance_number,batch_id,remitted_cash_centavos,difference_centavos,notes,remitted_by) values($1,$2,900,-100,'Synthetic shortage',$3) returning id", [`REM-G4-${randomBytes(6).toString("hex").toUpperCase()}`, batchId, owner.id]);
    const initial = await call(owner.token, "GET", `/api/v1/collection-batches/${batchId}`);
    expect(initial.json().data.batch.differenceCentavos).toBe("-100");
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/reconcile`, { notes: "", version: 1 })).statusCode).toBe(409);
    const correction = { correctedCashCentavos: "1000", reason: "Synthetic counted cash correction", cashCountConfirmed: true, version: 1 };
    expect((await call(viewer.token, "POST", `/api/v1/collection-batches/${batchId}/remittance-correction`, correction)).statusCode).toBe(403);
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/remittance-correction`, { ...correction, cashCountConfirmed: false })).statusCode).toBe(400);
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/remittance-correction`, { ...correction, correctedCashCentavos: "999" })).statusCode).toBe(409);
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/remittance-correction`, correction)).statusCode).toBe(200);
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/remittance-correction`, { ...correction, version: 2 })).statusCode).toBe(409);
    const detail = (await call(owner.token, "GET", `/api/v1/collection-batches/${batchId}`)).json().data;
    expect(detail).toMatchObject({ batch: { remittedCashCentavos: "1000", differenceCentavos: "0", version: 2 }, remittance: { remittedCashCentavos: "900", differenceCentavos: "-100" }, correction: { correctedCashCentavos: "1000", reason: correction.reason } });
    expect((await pool.query("select remitted_cash_centavos,difference_centavos from collector_remittances where id=$1", [remittance.rows[0]?.id])).rows).toEqual([{ remitted_cash_centavos: "900", difference_centavos: "-100" }]);
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/reconcile`, { notes: "Exact cash matched", version: 2 })).statusCode).toBe(204);
    expect((await call(owner.token, "POST", `/api/v1/collection-batches/${batchId}/close`, { version: 3 })).statusCode).toBe(204);
    const report = await call(owner.token, "GET", `/api/v1/reports/collector-reconciliation/preview?dateFrom=${collectionDate}&dateTo=${collectionDate}`);
    expect(report.statusCode).toBe(200);
    expect(report.json().data.rows).toContainEqual(expect.objectContaining({ batchNumber, originalRemittedCentavos: "900", remittedCentavos: "1000", correctionReason: correction.reason }));
  }, 120_000);
});

function makeApp(database: DatabaseHandle) {
  const auth = new AuthService(new PostgresAuthStore(database.db));
  return buildApp({ allowedOrigins: [], checkDatabase: database.check, authService: auth, subscriberService: new SubscriberService(database.db), billingService: new BillingService(database.db), paymentService: new PaymentService(database.db), collectionService: new CollectionService(database.db), receivableService: new ReceivableService(database.db), reportService: new ReportService(database.db) });
}

async function actor(database: DatabaseHandle, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>, roleCode: "OWNER" | "VIEWER") {
  const username = `gate4_${roleCode.toLowerCase()}_${randomUUID()}`;
  const password = randomBytes(24).toString("base64url");
  const roleId = (await pool.query("select id from roles where code=$1", [roleCode])).rows[0]?.id as string | undefined;
  if (!roleId) throw new Error(`Missing ${roleCode} role.`);
  const [user] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 4 ${roleCode} Test`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
  if (!user) throw new Error("Synthetic actor could not be created.");
  await database.db.insert(userRoles).values({ userId: user.id, roleId });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
  expect(login.statusCode).toBe(200);
  return { id: user.id, token: login.json().data.token as string };
}
