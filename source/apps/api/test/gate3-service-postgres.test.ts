import { randomBytes, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { authSessions, serviceTypes, userRoles, users } from "../src/db/schema/index.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { PostgresAuthStore } from "../src/modules/auth/postgres-auth-store.js";
import { BillingService } from "../src/modules/billing/billing-service.js";
import { SubscriberService } from "../src/modules/subscribers/subscriber-service.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";

describe.skipIf(!testUri)("Gate 3 service-account PostgreSQL integration", () => {
  let database: DatabaseHandle | undefined;
  let pool: Pool | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  const actorIds: string[] = [];

  const build = (handle: DatabaseHandle) => buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(handle.db)), subscriberService: new SubscriberService(handle.db), billingService: new BillingService(handle.db) });

  beforeAll(async () => {
    const target = new URL(testUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("The test target must be local bcis_test on port 5433.");
    pool = new Pool({ connectionString: testUri, max: 2 });
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("The isolated test database is not ready.");
    database = createDatabase(testUri);
    app = await build(database);
  });

  afterAll(async () => {
    if (database) for (const id of actorIds) {
      await database.db.update(users).set({ isActive: false }).where(eq(users.id, id));
      await database.db.update(authSessions).set({ revokedAt: sql`now()` }).where(eq(authSessions.userId, id));
    }
    await app?.close();
    await database?.close();
    await pool?.end();
  });

  it("keeps old invoice and address-only rate while allowing an authorized future plan change", async () => {
    if (!app || !database || !pool) throw new Error("Integration setup did not finish.");
    const actor = async (roleCode: "OWNER" | "VIEWER") => {
      const username = `gate3_service_${roleCode.toLowerCase()}_${randomUUID()}`;
      const password = randomBytes(24).toString("base64url");
      const role = await pool!.query("select id from roles where code = $1", [roleCode]);
      if (!role.rows[0]?.id) throw new Error(`Missing ${roleCode} role.`);
      const [user] = await database!.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 3 ${roleCode}`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
      if (!user) throw new Error("Could not create test actor.");
      actorIds.push(user.id);
      await database!.db.insert(userRoles).values({ userId: user.id, roleId: role.rows[0].id as string });
      const login = await app!.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
      expect(login.statusCode).toBe(200);
      return (login.json() as { data: { token: string } }).data.token;
    };
    const owner = await actor("OWNER");
    const viewer = await actor("VIEWER");
    const request = (token: string, method: "GET" | "POST" | "PATCH" | "PUT", url: string, payload?: Record<string, unknown>) => app!.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload === undefined ? {} : { payload }) });
    const [internet] = await database.db.select().from(serviceTypes).where(eq(serviceTypes.code, "INTERNET")).limit(1);
    if (!internet) throw new Error("Run the synthetic master-data seed in bcis_test first.");
    const code = randomUUID().slice(0, 8).toUpperCase();
    const createPlan = async (suffix: string, priceCentavos: string) => {
      const response = await request(owner, "POST", "/api/v1/plans", { code: `G3${suffix}${code}`, serviceTypeId: internet.id, name: `Gate 3 ${suffix} ${code}`, description: "Synthetic test plan", priceCentavos, installationFeeCentavos: "0", reconnectionFeeCentavos: "0", internetSpeedMbps: 25 });
      expect(response.statusCode).toBe(200);
      return (response.json() as { data: { id: string; version: number; name: string } }).data;
    };
    const oldPlan = await createPlan("A", "150000");
    const newPlan = await createPlan("B", "200000");
    const subscriber = await request(owner, "POST", "/api/v1/subscribers", { firstName: "GateThree", lastName: "ServiceEdit", billingDay: 1, dueDay: 10, addresses: [
      { type: "SERVICE", line1: "123 First Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true },
      { type: "SERVICE", line1: "456 Second Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: false }
    ], contacts: [{ type: "MOBILE", value: "09170000001", isPrimary: true }] });
    expect(subscriber.statusCode).toBe(200);
    const subscriberId = (subscriber.json() as { data: { id: string } }).data.id;
    const profile = await request(owner, "GET", `/api/v1/subscribers/${subscriberId}`);
    const addresses = (profile.json() as { data: { addresses: Array<{ id: string }> } }).data.addresses;
    const firstAddressId = addresses[0]?.id;
    const secondAddressId = addresses[1]?.id;
    if (!firstAddressId || !secondAddressId) throw new Error("Test addresses were not created.");
    const availableYear = await pool.query("select candidate::int as year from generate_series(7000, 7899) candidate where not exists (select 1 from billing_cycles where left(period_key, 4) = candidate::text and right(period_key, 2) = any($1::text[])) order by candidate limit 1", [["01", "02", "03"]]);
    const year = availableYear.rows[0]?.year as number | undefined;
    if (!year) throw new Error("No unused billing year remains for the service-account test.");
    const service = await request(owner, "POST", "/api/v1/service-accounts", { subscriberId, planId: oldPlan.id, installationAddressId: firstAddressId, billingStartDate: `${year}-01-01`, activationDate: `${year}-01-01`, billingDay: 1, dueDay: 10 });
    expect(service.statusCode).toBe(200);
    const account = (service.json() as { data: { id: string; version: number; status: string } }).data;
    expect((await request(owner, "POST", "/api/v1/billing/finalize", { periodKey: `${year}-01`, commandKey: randomUUID() })).statusCode).toBe(200);
    const firstInvoice = await pool.query("select total_centavos from invoices where service_account_id = $1", [account.id]);
    expect(firstInvoice.rows.map((row) => row.total_centavos)).toEqual(["150000"]);
    const repriced = await request(owner, "PUT", `/api/v1/plans/${oldPlan.id}`, { name: oldPlan.name, description: "Synthetic test plan", priceCentavos: "170000", installationFeeCentavos: "0", reconnectionFeeCentavos: "0", version: oldPlan.version });
    expect(repriced.statusCode).toBe(200);
    const afterPrice = await pool.query("select current_rate_centavos, version from service_accounts where id = $1", [account.id]);
    expect(afterPrice.rows[0]).toMatchObject({ current_rate_centavos: "170000", version: account.version + 1 });
    const addressEdit = { planId: oldPlan.id, installationAddressId: secondAddressId, status: "ACTIVE", reason: "Correct service address", version: account.version + 1 };
    expect((await request(viewer, "PATCH", `/api/v1/service-accounts/${account.id}`, addressEdit)).statusCode).toBe(403);
    expect((await request(owner, "PATCH", `/api/v1/service-accounts/${account.id}`, { ...addressEdit, status: "SUSPENDED" })).statusCode).toBe(409);
    expect((await request(owner, "PATCH", `/api/v1/service-accounts/${account.id}`, { ...addressEdit, installationAddressId: randomUUID() })).statusCode).toBe(400);
    expect((await request(owner, "PATCH", `/api/v1/service-accounts/${account.id}`, addressEdit)).statusCode).toBe(204);
    expect((await request(owner, "PATCH", `/api/v1/service-accounts/${account.id}`, addressEdit)).statusCode).toBe(409);
    const afterAddress = await pool.query("select plan_id, installation_address_id, current_rate_centavos, version from service_accounts where id = $1", [account.id]);
    expect(afterAddress.rows[0]).toMatchObject({ plan_id: oldPlan.id, installation_address_id: secondAddressId, current_rate_centavos: "170000", version: account.version + 2 });
    expect((await request(owner, "POST", "/api/v1/billing/finalize", { periodKey: `${year}-02`, commandKey: randomUUID() })).statusCode).toBe(200);
    const planEdit = { planId: newPlan.id, installationAddressId: secondAddressId, status: "ACTIVE", reason: "Customer selected new plan", version: account.version + 2 };
    expect((await request(owner, "PATCH", `/api/v1/service-accounts/${account.id}`, planEdit)).statusCode).toBe(204);
    const afterPlan = await pool.query("select plan_id, current_rate_centavos, version from service_accounts where id = $1", [account.id]);
    expect(afterPlan.rows[0]).toMatchObject({ plan_id: newPlan.id, current_rate_centavos: "200000", version: account.version + 3 });
    expect((await request(viewer, "PATCH", `/api/v1/plans/${newPlan.id}/active`, { isActive: false, version: newPlan.version })).statusCode).toBe(403);
    expect((await request(owner, "PATCH", `/api/v1/plans/${newPlan.id}/active`, { isActive: false, version: newPlan.version })).statusCode).toBe(204);
    expect((await request(owner, "PATCH", `/api/v1/plans/${newPlan.id}/active`, { isActive: true, version: newPlan.version })).statusCode).toBe(409);
    const inactiveAssignment = await request(owner, "POST", "/api/v1/service-accounts", { subscriberId, planId: newPlan.id, installationAddressId: firstAddressId, billingStartDate: `${year}-03-01`, activationDate: `${year}-03-01`, billingDay: 1, dueDay: 10 });
    expect(inactiveAssignment.statusCode).toBe(400);
    expect((await request(owner, "POST", "/api/v1/billing/finalize", { periodKey: `${year}-03`, commandKey: randomUUID() })).statusCode).toBe(200);
    const invoiceRows = await pool.query("select total_centavos from invoices where service_account_id = $1 order by invoice_date", [account.id]);
    expect(invoiceRows.rows.map((row) => row.total_centavos)).toEqual(["150000", "170000", "200000"]);
    await app.close();
    app = await build(database);
    const persisted = await request(viewer, "GET", `/api/v1/subscribers/${subscriberId}`);
    const persistedService = (persisted.json() as { data: { services: Array<{ account: { planId: string; currentRateCentavos: string; version: number } }> } }).data.services[0]?.account;
    expect(persistedService).toMatchObject({ planId: newPlan.id, currentRateCentavos: "200000", version: account.version + 3 });
    const events = await pool.query("select type from service_events where service_account_id = $1 and type in ('ADDRESS_CHANGED', 'PLAN_CHANGED') order by occurred_at", [account.id]);
    expect(events.rows.map((row) => row.type)).toEqual(["ADDRESS_CHANGED", "PLAN_CHANGED"]);
    const audit = await pool.query("select count(*)::int as total from audit_logs where entity_type = 'service_account' and entity_id = $1 and action = 'service.update'", [account.id]);
    expect(audit.rows[0]?.total).toBe(2);
    const priceAudit = await pool.query("select count(*)::int as total from audit_logs where entity_type = 'service_plan' and entity_id = $1 and action = 'plan.update'", [oldPlan.id]);
    expect(priceAudit.rows[0]?.total).toBe(1);
  });
});
