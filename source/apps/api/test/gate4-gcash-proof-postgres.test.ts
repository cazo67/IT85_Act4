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
import { PaymentService } from "../src/modules/payments/payment-service.js";
import { ReportService } from "../src/modules/reports/report-service.js";
import { SubscriberService } from "../src/modules/subscribers/subscriber-service.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

describe.skipIf(!testUri)("Gate 4 pending GCash proof PostgreSQL integration", () => {
  let database: DatabaseHandle | undefined;
  let pool: Pool | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeAll(async () => {
    const target = new URL(testUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("GCash integration tests require isolated 127.0.0.1:5433/bcis_test.");
    pool = new Pool({ connectionString: testUri, max: 2 });
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("The isolated test database must have all 19 migrations.");
    database = createDatabase(testUri);
    app = await buildTestApp(database);
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await pool?.end();
  });

  it("stores a pending proof, rejects duplicate references and invalid submissions, and never posts payment", async () => {
    if (!database || !pool || !app) throw new Error("GCash test setup did not finish.");
    const owner = await createActor(database, pool, app, "OWNER");
    const otherOwner = await createActor(database, pool, app, "OWNER");
    const viewer = await createActor(database, pool, app, "VIEWER");
    const auditor = await createActor(database, pool, app, "ACCOUNTING_AUDITOR");
    const request = (token: string, method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => app!.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
    const subscriber = await request(owner, "POST", "/api/v1/subscribers", {
      firstName: "GateFour", lastName: "GCashProof", billingDay: 1, dueDay: 15,
      addresses: [{ type: "SERVICE", line1: "7 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000008", isPrimary: true }]
    });
    expect(subscriber.statusCode).toBe(200);
    const subscriberId = (subscriber.json() as { data: { id: string } }).data.id;
    const reference = `AB${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const payload = { subscriberId, amountCentavos: "12345", senderName: "Synthetic Sender", senderMobile: "09171234567", externalReference: reference, originalFileName: "proof.png", imageBase64: pngBase64 };
    expect((await request(viewer, "POST", "/api/v1/gcash/proofs", payload)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/gcash/proofs", payload })).statusCode).toBe(401);
    const uploaded = await request(owner, "POST", "/api/v1/gcash/proofs", payload);
    expect(uploaded.statusCode).toBe(200);
    const proofId = (uploaded.json() as { data: { id: string; status: string; normalizedExternalReference: string } }).data.id;
    expect((uploaded.json() as { data: { status: string; normalizedExternalReference: string } }).data).toMatchObject({ status: "PENDING", normalizedExternalReference: reference });
    const saved = await pool.query("select status, sender_name, sender_mobile, amount_centavos, media_type, size_bytes, octet_length(proof_data) as actual_size, normalized_external_reference from payment_proofs where id = $1", [proofId]);
    expect(saved.rows).toMatchObject([{ status: "PENDING", sender_name: "Synthetic Sender", sender_mobile: "09171234567", amount_centavos: "12345", media_type: "image/png", normalized_external_reference: reference }]);
    expect(saved.rows[0]?.size_bytes).toBe(String(saved.rows[0]?.actual_size));
    expect((await request(viewer, "GET", "/api/v1/gcash/proofs?status=PENDING")).statusCode).toBe(403);
    expect((await request(viewer, "GET", "/api/v1/gcash/my-proofs")).statusCode).toBe(403);
    expect((await request(otherOwner, "GET", "/api/v1/gcash/my-proofs?status=PENDING")).json()).toMatchObject({ data: { items: [] } });
    expect((await request(owner, "GET", "/api/v1/gcash/my-proofs?status=PENDING")).json()).toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ id: proofId })]) } });
    const pendingList = await request(auditor, "GET", "/api/v1/gcash/proofs?status=PENDING&pageSize=100");
    expect(pendingList.statusCode).toBe(200);
    expect((pendingList.json() as { data: { items: Array<{ id: string }> } }).data.items).toContainEqual(expect.objectContaining({ id: proofId }));
    expect(JSON.stringify(pendingList.json())).not.toContain(pngBase64);
    const duplicate = await request(owner, "POST", "/api/v1/gcash/proofs", { ...payload, externalReference: `${reference.slice(0, 4).toLowerCase()}-${reference.slice(4).toLowerCase()}` });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe("GCASH_REFERENCE_DUPLICATE");
    expect((await request(owner, "POST", "/api/v1/gcash/proofs", { ...payload, externalReference: randomUUID().slice(0, 8), imageBase64: Buffer.from("not an image").toString("base64") })).statusCode).toBe(400);
    expect((await request(owner, "POST", "/api/v1/gcash/proofs", { ...payload, externalReference: randomUUID().slice(0, 8), senderMobile: "123" })).statusCode).toBe(400);
    expect((await request(owner, "POST", "/api/v1/gcash/proofs", { ...payload, externalReference: randomUUID().slice(0, 8), imageBase64: Buffer.alloc(2 * 1024 * 1024 + 1, 1).toString("base64") })).statusCode).toBe(400);
    const detail = await request(auditor, "GET", `/api/v1/gcash/proofs/${proofId}`);
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { data: Record<string, unknown> }).data).toMatchObject({ id: proofId, status: "PENDING", amountCentavos: "12345" });
    expect(JSON.stringify(detail.json())).not.toContain(pngBase64);
    expect((await request(viewer, "GET", `/api/v1/gcash/proofs/${proofId}`)).statusCode).toBe(403);
    expect((await request(viewer, "GET", `/api/v1/gcash/proofs/${proofId}/image`)).statusCode).toBe(403);
    const image = await request(auditor, "GET", `/api/v1/gcash/proofs/${proofId}/image`);
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.rawPayload).toEqual(Buffer.from(pngBase64, "base64"));
    expect((await request(viewer, "POST", `/api/v1/gcash/proofs/${proofId}/reject`, { reason: "Reference not found in receiver history" })).statusCode).toBe(403);
    const rejected = await request(auditor, "POST", `/api/v1/gcash/proofs/${proofId}/reject`, { reason: "Reference not found in receiver history" });
    expect(rejected.statusCode).toBe(200);
    expect((rejected.json() as { data: { status: string } }).data.status).toBe("REJECTED");
    expect((await request(auditor, "POST", `/api/v1/gcash/proofs/${proofId}/verify`, { receiverHistoryConfirmed: true })).statusCode).toBe(409);
    expect((await request(auditor, "GET", "/api/v1/gcash/proofs?status=REJECTED&pageSize=100")).json()).toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ id: proofId, status: "REJECTED" })]) } });
    expect((await request(owner, "GET", "/api/v1/gcash/my-proofs?status=REJECTED")).json()).toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ id: proofId, reviewReason: "Reference not found in receiver history" })]) } });
    expect((await request(auditor, "POST", `/api/v1/gcash/proofs/${proofId}/reject`, { reason: "Repeated rejected proof decision" })).statusCode).toBe(409);
    expect((await request(owner, "POST", "/api/v1/gcash/proofs", payload)).statusCode).toBe(409);
    const correction = { amountCentavos: "12346", senderName: "Corrected Sender", senderMobile: "09171234567", originalFileName: "corrected.png", imageBase64: pngBase64 };
    expect((await request(viewer, "POST", `/api/v1/gcash/proofs/${proofId}/resubmit`, correction)).statusCode).toBe(403);
    expect((await request(owner, "POST", `/api/v1/gcash/proofs/${proofId}/resubmit`, { ...correction, externalReference: "DIFFERENT123" })).statusCode).toBe(400);
    const resubmitted = await request(owner, "POST", `/api/v1/gcash/proofs/${proofId}/resubmit`, correction);
    expect(resubmitted.statusCode).toBe(200);
    expect((resubmitted.json() as { data: { id: string; status: string; amountCentavos: string; normalizedExternalReference: string } }).data).toMatchObject({ id: proofId, status: "PENDING", amountCentavos: "12346", normalizedExternalReference: reference });
    expect((await request(owner, "POST", `/api/v1/gcash/proofs/${proofId}/resubmit`, correction)).statusCode).toBe(409);
    expect((await request(owner, "POST", "/api/v1/gcash/proofs", payload)).statusCode).toBe(409);
    expect((await pool.query("select count(*)::int as count from payment_proofs where normalized_external_reference = $1", [reference])).rows[0]?.count).toBe(1);
    const concurrentReference = `CD${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const simultaneous = await Promise.all([request(owner, "POST", "/api/v1/gcash/proofs", { ...payload, externalReference: concurrentReference }), request(owner, "POST", "/api/v1/gcash/proofs", { ...payload, externalReference: concurrentReference })]);
    expect(simultaneous.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await pool.query("select count(*)::int as count from payment_proofs where normalized_external_reference = $1", [concurrentReference])).rows[0]?.count).toBe(1);
    const audit = await pool.query("select action from audit_logs where entity_id = $1 and action in ('gcash.proof.submit', 'gcash.proof.reject', 'gcash.proof.resubmit') order by occurred_at", [proofId]);
    expect(audit.rows.map((row) => row.action)).toEqual(["gcash.proof.submit", "gcash.proof.reject", "gcash.proof.resubmit"]);
    expect((await request(owner, "POST", "/api/v1/payments", { subscriberId, amountCentavos: "12345", method: "GCASH", commandKey: randomUUID() })).statusCode).toBe(409);
    expect((await pool.query("select count(*)::int as count from payments where subscriber_id = $1", [subscriberId])).rows[0]?.count).toBe(0);
    expect((await pool.query("select count(*)::int as count from receipts r join payments p on p.id = r.payment_id where p.subscriber_id = $1", [subscriberId])).rows[0]?.count).toBe(0);
    expect((await pool.query("select count(*)::int as count from ledger_entries where subscriber_id = $1", [subscriberId])).rows[0]?.count).toBe(0);
    await app.close();
    app = await buildTestApp(database);
  }, 120_000);

  it("posts only a receiver-confirmed proof once, reconciles advance credit and reversal, and rolls back a failed receipt", async () => {
    if (!database || !pool || !app) throw new Error("GCash test setup did not finish.");
    const owner = await createActor(database, pool, app, "OWNER");
    const viewer = await createActor(database, pool, app, "VIEWER");
    const request = (token: string, method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => app!.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
    const created = await request(owner, "POST", "/api/v1/subscribers", { firstName: "GateFour", lastName: "GCashPosting", billingDay: 1, dueDay: 15, addresses: [{ type: "SERVICE", line1: "8 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }], contacts: [{ type: "MOBILE", value: "09170000009", isPrimary: true }] });
    expect(created.statusCode).toBe(200);
    const subscriberId = (created.json() as { data: { id: string; accountNumber: string } }).data.id;
    const accountNumber = (created.json() as { data: { accountNumber: string } }).data.accountNumber;
    const profile = await request(owner, "GET", `/api/v1/subscribers/${subscriberId}`);
    const addressId = (profile.json() as { data: { addresses: Array<{ id: string }> } }).data.addresses[0]?.id;
    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    if (!addressId || !plan) throw new Error("Synthetic address or active plan missing.");
    const yearRow = await pool.query("select candidate::int as year from generate_series(9000, 9998) candidate where not exists (select 1 from billing_cycles where period_key = candidate::text || '-01') order by candidate limit 1");
    const year = yearRow.rows[0]?.year as number | undefined;
    if (!year) throw new Error("No unused synthetic billing year is available.");
    expect((await request(owner, "POST", "/api/v1/service-accounts", { subscriberId, planId: plan.id, installationAddressId: addressId, billingStartDate: `${year}-01-01`, activationDate: `${year}-01-01`, billingDay: 1, dueDay: 15 })).statusCode).toBe(200);
    const proofPayload = (reference: string, amountCentavos: string) => ({ subscriberId, amountCentavos, senderName: "Synthetic Sender", senderMobile: "09171234567", externalReference: reference, originalFileName: "proof.png", imageBase64: pngBase64 });
    const submit = async (amountCentavos: string) => {
      const reference = `GX${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const response = await request(owner, "POST", "/api/v1/gcash/proofs", proofPayload(reference, amountCentavos));
      expect(response.statusCode).toBe(200);
      return { id: (response.json() as { data: { id: string } }).data.id, reference };
    };
    const confirmation = { receiverHistoryConfirmed: true };
    const advance = await submit((plan.priceCentavos + 123n).toString());
    const verifyUrl = `/api/v1/gcash/proofs/${advance.id}/verify`;
    expect((await request(viewer, "POST", verifyUrl, confirmation)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: verifyUrl, payload: confirmation })).statusCode).toBe(401);
    expect((await request(owner, "POST", verifyUrl, { receiverHistoryConfirmed: false })).statusCode).toBe(400);
    expect((await request(owner, "POST", verifyUrl, { receiverHistoryConfirmed: true, override: true })).statusCode).toBe(400);
    expect((await pool.query("select count(*)::int as count from payments where subscriber_id = $1", [subscriberId])).rows[0]?.count).toBe(0);
    const simultaneous = await Promise.all([request(owner, "POST", verifyUrl, confirmation), request(owner, "POST", verifyUrl, confirmation)]);
    expect(simultaneous.map((response) => response.statusCode)).toEqual([200, 200]);
    const paymentId = (simultaneous[0]!.json() as { data: { payment: { id: string } } }).data.payment.id;
    expect((simultaneous[1]!.json() as { data: { payment: { id: string } } }).data.payment.id).toBe(paymentId);
    expect((await request(owner, "POST", verifyUrl, confirmation)).json()).toMatchObject({ data: { payment: { id: paymentId, method: "GCASH", amountCentavos: (plan.priceCentavos + 123n).toString() } } });
    expect((await request(owner, "POST", "/api/v1/payments", { subscriberId, amountCentavos: "1", method: "GCASH", commandKey: randomUUID() })).statusCode).toBe(409);
    const financial = await pool.query("select p.method, p.status, p.normalized_external_reference, r.snapshot, c.original_centavos, c.remaining_centavos, (select count(*)::int from ledger_entries where payment_id = p.id) as ledger_count from payments p join receipts r on r.payment_id = p.id join subscriber_credits c on c.source_payment_id = p.id where p.id = $1", [paymentId]);
    expect(financial.rows).toMatchObject([{ method: "GCASH", status: "POSTED", normalized_external_reference: advance.reference, original_centavos: (plan.priceCentavos + 123n).toString(), remaining_centavos: (plan.priceCentavos + 123n).toString(), ledger_count: 1, snapshot: { method: "GCASH", externalReference: advance.reference, advanceCreditCentavos: (plan.priceCentavos + 123n).toString() } }]);
    expect((await pool.query("select count(*)::int as count from payments where normalized_external_reference = $1", [advance.reference])).rows[0]?.count).toBe(1);
    expect((await pool.query("select count(*)::int as count from audit_logs where entity_id in ($1, $2) and action in ('gcash.proof.verify', 'payment.post')", [advance.id, paymentId])).rows[0]?.count).toBe(2);
    const paymentRow = await pool.query("select payment_number, paid_at::date::text as paid_date from payments where id = $1", [paymentId]);
    const daily = await request(owner, "GET", `/api/v1/reports/daily-collections/preview?dateFrom=${paymentRow.rows[0]?.paid_date}&dateTo=${paymentRow.rows[0]?.paid_date}`);
    expect(daily.statusCode).toBe(200);
    expect((daily.json() as { data: { rows: Array<{ paymentNumber: string; method: string; amountCentavos: string }> } }).data.rows).toContainEqual(expect.objectContaining({ paymentNumber: paymentRow.rows[0]?.payment_number, method: "GCASH", amountCentavos: (plan.priceCentavos + 123n).toString() }));
    expect((await request(owner, "POST", "/api/v1/gcash/proofs", proofPayload(advance.reference, "100"))).statusCode).toBe(409);

    expect((await request(owner, "POST", "/api/v1/billing/finalize", { periodKey: `${year}-01`, commandKey: randomUUID() })).statusCode).toBe(200);
    const invoice = await pool.query("select id, total_centavos, paid_centavos, status from invoices where subscriber_id = $1", [subscriberId]);
    expect(invoice.rows).toMatchObject([{ total_centavos: plan.priceCentavos.toString(), paid_centavos: plan.priceCentavos.toString(), status: "PAID" }]);
    expect((await pool.query("select remaining_centavos from subscriber_credits where source_payment_id = $1", [paymentId])).rows[0]?.remaining_centavos).toBe("123");
    const ledger = await pool.query("select coalesce(sum(debit_centavos - credit_centavos), 0)::text as balance from ledger_entries where subscriber_id = $1", [subscriberId]);
    expect(ledger.rows[0]?.balance).toBe("-123");
    expect((await request(owner, "POST", `/api/v1/payments/${paymentId}/reverse`, { reason: "Synthetic GCash record correction" })).statusCode).toBe(200);
    expect((await pool.query("select count(*)::int as count from receipts where payment_id = $1 and voided_at is not null", [paymentId])).rows[0]?.count).toBe(1);
    expect((await pool.query("select status, paid_centavos from invoices where id = $1", [invoice.rows[0]?.id])).rows).toMatchObject([{ status: "OPEN", paid_centavos: "0" }]);
    expect((await pool.query("select status, remaining_centavos from subscriber_credits where source_payment_id = $1", [paymentId])).rows).toMatchObject([{ status: "REVERSED", remaining_centavos: "0" }]);
    expect((await pool.query("select status from payment_proofs where id = $1", [advance.id])).rows[0]?.status).toBe("VERIFIED");
    expect((await request(owner, "POST", verifyUrl, confirmation)).json()).toMatchObject({ data: { payment: { id: paymentId, status: "REVERSED" } } });
    expect((await pool.query("select coalesce(sum(debit_centavos - credit_centavos), 0)::text as balance from ledger_entries where subscriber_id = $1", [subscriberId])).rows[0]?.balance).toBe(plan.priceCentavos.toString());
    const reversalDate = (await pool.query("select reversed_at::date::text as date from payment_reversals where payment_id = $1", [paymentId])).rows[0]?.date as string;
    const reversalReport = await request(owner, "GET", `/api/v1/reports/payment-reversals/preview?dateFrom=${reversalDate}&dateTo=${reversalDate}`);
    expect(reversalReport.statusCode).toBe(200);
    expect((reversalReport.json() as { data: { rows: Array<{ paymentNumber: string; method: string; amountCentavos: string; receiptState: string }> } }).data.rows).toContainEqual(expect.objectContaining({ paymentNumber: paymentRow.rows[0]?.payment_number, method: "GCASH", amountCentavos: (plan.priceCentavos + 123n).toString(), receiptState: "VOIDED" }));
    const afterReversalCollections = await request(owner, "GET", `/api/v1/reports/daily-collections/preview?dateFrom=${paymentRow.rows[0]?.paid_date}&dateTo=${paymentRow.rows[0]?.paid_date}`);
    expect((afterReversalCollections.json() as { data: { rows: Array<{ paymentNumber: string }> } }).data.rows.some((row) => row.paymentNumber === paymentRow.rows[0]?.payment_number)).toBe(false);

    const partial = await submit("100");
    const partialPost = await request(owner, "POST", `/api/v1/gcash/proofs/${partial.id}/verify`, confirmation);
    expect(partialPost.statusCode).toBe(200);
    expect((await pool.query("select paid_centavos, status from invoices where id = $1", [invoice.rows[0]?.id])).rows).toMatchObject([{ paid_centavos: "100", status: "PARTIALLY_PAID" }]);
    expect((await pool.query("select amount_centavos from payment_allocations where payment_id = $1", [(partialPost.json() as { data: { payment: { id: string } } }).data.payment.id])).rows).toMatchObject([{ amount_centavos: "100" }]);

    const rollback = await submit("200");
    const receiptConstraint = `gate4_gcash_rollback_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`alter table receipts add constraint ${receiptConstraint} check ((snapshot ->> 'accountNumber') <> '${accountNumber}') not valid`);
    try {
      expect((await request(owner, "POST", `/api/v1/gcash/proofs/${rollback.id}/verify`, confirmation)).statusCode).toBe(500);
      expect((await pool.query("select status from payment_proofs where id = $1", [rollback.id])).rows[0]?.status).toBe("PENDING");
      expect((await pool.query("select count(*)::int as count from payments where normalized_external_reference = $1", [rollback.reference])).rows[0]?.count).toBe(0);
      expect((await pool.query("select count(*)::int as count from receipts r join payments p on p.id = r.payment_id where p.normalized_external_reference = $1", [rollback.reference])).rows[0]?.count).toBe(0);
    } finally {
      await pool.query(`alter table receipts drop constraint ${receiptConstraint}`);
    }
    const recovered = await request(owner, "POST", `/api/v1/gcash/proofs/${rollback.id}/verify`, confirmation);
    expect(recovered.statusCode).toBe(200);
    const recoveredPaymentId = (recovered.json() as { data: { payment: { id: string } } }).data.payment.id;
    await app.close();
    app = await buildTestApp(database);
    const restartRetry = await request(owner, "POST", `/api/v1/gcash/proofs/${rollback.id}/verify`, confirmation);
    expect(restartRetry.statusCode).toBe(200);
    expect((restartRetry.json() as { data: { payment: { id: string } } }).data.payment.id).toBe(recoveredPaymentId);
  }, 120_000);
});

function buildTestApp(database: DatabaseHandle) {
  return buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db), billingService: new BillingService(database.db), paymentService: new PaymentService(database.db), reportService: new ReportService(database.db), checkDatabase: database.check });
}

async function createActor(database: DatabaseHandle, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>, roleCode: "OWNER" | "VIEWER" | "ACCOUNTING_AUDITOR") {
  const username = `gate4_${roleCode.toLowerCase()}_${randomUUID()}`;
  const password = randomBytes(24).toString("base64url");
  const role = await pool.query("select id from roles where code = $1", [roleCode]);
  if (!role.rows[0]?.id) throw new Error(`Missing ${roleCode} test role.`);
  const [user] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 4 ${roleCode} Test`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
  if (!user) throw new Error("Test user creation failed.");
  await database.db.insert(userRoles).values({ userId: user.id, roleId: role.rows[0].id as string });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
  expect(login.statusCode).toBe(200);
  return (login.json() as { data: { token: string } }).data.token;
}
