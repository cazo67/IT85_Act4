import { randomBytes, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { authSessions, servicePlans, userRoles, users } from "../src/db/schema/index.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { PostgresAuthStore } from "../src/modules/auth/postgres-auth-store.js";
import { SubscriberService } from "../src/modules/subscribers/subscriber-service.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";

describe.skipIf(!testUri)("Gate 3 subscriber identity PostgreSQL integration", () => {
  let database: DatabaseHandle | undefined;
  let pool: Pool | undefined;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  const actorIds: string[] = [];

  beforeAll(async () => {
    const target = new URL(testUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("The test target must be local bcis_test on port 5433.");
    pool = new Pool({ connectionString: testUri, max: 2 });
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("The isolated test database is not ready.");
    database = createDatabase(testUri);
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
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

  it("edits identity with authorization, optimistic concurrency, normalized search, persistence and audit", async () => {
    if (!app || !database || !pool) throw new Error("Integration setup did not finish.");
    const actor = async (roleCode: "OWNER" | "VIEWER") => {
      const username = `gate3_identity_${roleCode.toLowerCase()}_${randomUUID()}`;
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
    const request = (token: string, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: Record<string, unknown>) => app!.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload === undefined ? {} : { payload }) });
    const created = await request(owner, "POST", "/api/v1/subscribers", {
      firstName: "Old", lastName: "Identity", billingDay: 1, dueDay: 10,
      addresses: [{ type: "SERVICE", line1: "123 Test Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
      contacts: [{ type: "MOBILE", value: "09170000001", isPrimary: true }]
    });
    expect(created.statusCode).toBe(200);
    const id = (created.json() as { data: { id: string } }).data.id;
    const profile = await request(owner, "GET", `/api/v1/subscribers/${id}`);
    const original = (profile.json() as { data: { subscriber: { version: number; billingDay: number; dueDay: number }; addresses: unknown[]; contacts: unknown[] } }).data;
    const input = { firstName: "Edited", middleName: "Middle", lastName: "Subscriber", suffix: "Jr", version: original.subscriber.version };
    expect((await request(viewer, "PATCH", `/api/v1/subscribers/${id}/identity`, input)).statusCode).toBe(403);
    expect((await request(owner, "PATCH", `/api/v1/subscribers/${id}/identity`, { ...input, firstName: "X" })).statusCode).toBe(400);
    expect((await request(owner, "PATCH", `/api/v1/subscribers/${id}/identity`, input)).statusCode).toBe(204);
    expect((await request(owner, "PATCH", `/api/v1/subscribers/${id}/identity`, input)).statusCode).toBe(409);
    const found = await request(viewer, "GET", `/api/v1/subscribers?search=edited%20middle%20subscriber&page=1&pageSize=25`);
    expect(found.statusCode).toBe(200);
    expect((found.json() as { data: { items: Array<{ id: string }> } }).data.items.some((item) => item.id === id)).toBe(true);
    await app.close();
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
    const persisted = await request(viewer, "GET", `/api/v1/subscribers/${id}`);
    const revised = (persisted.json() as { data: { subscriber: { firstName: string; middleName: string; lastName: string; suffix: string; billingDay: number; dueDay: number; version: number }; addresses: unknown[]; contacts: unknown[] } }).data;
    expect(revised.subscriber).toMatchObject({ firstName: "Edited", middleName: "Middle", lastName: "Subscriber", suffix: "Jr", billingDay: original.subscriber.billingDay, dueDay: original.subscriber.dueDay, version: input.version + 1 });
    expect(revised.addresses).toHaveLength(original.addresses.length);
    expect(revised.contacts).toHaveLength(original.contacts.length);
    const audit = await pool.query("select count(*)::int as total from audit_logs where entity_type = 'subscriber' and entity_id = $1 and action = 'subscriber.identity.update'", [id]);
    expect(audit.rows[0]?.total).toBe(1);

    const [plan] = await database.db.select().from(servicePlans).where(eq(servicePlans.isActive, true)).limit(1);
    const addressId = (revised.addresses[0] as { id: string } | undefined)?.id;
    if (!plan || !addressId) throw new Error("The test plan or service address is unavailable.");
    const createdService = await request(owner, "POST", "/api/v1/service-accounts", { subscriberId: id, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 10 });
    expect(createdService.statusCode).toBe(200);
    const service = (createdService.json() as { data: { id: string; version: number; status: string } }).data;
    const deactivate = { status: "INACTIVE", billingDay: 1, dueDay: 10, notes: "", version: revised.subscriber.version };
    expect((await request(viewer, "PATCH", `/api/v1/subscribers/${id}`, deactivate)).statusCode).toBe(403);
    const blocked = await request(owner, "PATCH", `/api/v1/subscribers/${id}`, deactivate);
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: { code: string } }).error.code).toBe("OPEN_SERVICES_EXIST");
    const afterBlocked = await request(owner, "GET", `/api/v1/subscribers/${id}`);
    expect((afterBlocked.json() as { data: { subscriber: { status: string; version: number } } }).data.subscriber).toMatchObject({ status: "ACTIVE", version: deactivate.version });
    const terminated = await request(owner, "PATCH", `/api/v1/service-accounts/${service.id}`, { planId: plan.id, installationAddressId: addressId, status: "TERMINATED", reason: "Synthetic test closure", version: service.version });
    expect(terminated.statusCode).toBe(204);
    expect((await request(owner, "PATCH", `/api/v1/subscribers/${id}`, deactivate)).statusCode).toBe(204);
    expect((await request(owner, "PATCH", `/api/v1/subscribers/${id}`, deactivate)).statusCode).toBe(409);
    const noNewService = await request(owner, "POST", "/api/v1/service-accounts", { subscriberId: id, planId: plan.id, installationAddressId: addressId, billingStartDate: "2026-02-01", activationDate: "2026-02-01", billingDay: 1, dueDay: 10 });
    expect(noNewService.statusCode).toBe(400);
    await app.close();
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
    const inactive = await request(viewer, "GET", `/api/v1/subscribers/${id}`);
    expect((inactive.json() as { data: { subscriber: { status: string; version: number }; services: Array<{ account: { status: string } }> } }).data).toMatchObject({ subscriber: { status: "INACTIVE", version: deactivate.version + 1 }, services: [{ account: { status: "TERMINATED" } }] });
    const statusAudit = await pool.query("select count(*)::int as total from audit_logs where entity_type = 'subscriber' and entity_id = $1 and action = 'subscriber.update'", [id]);
    expect(statusAudit.rows[0]?.total).toBe(1);

    const addedContact = { type: "MOBILE", value: "09170000002", isPrimary: true, version: deactivate.version + 1 };
    expect((await request(viewer, "POST", `/api/v1/subscribers/${id}/contacts`, addedContact)).statusCode).toBe(403);
    expect((await request(owner, "POST", `/api/v1/subscribers/${id}/contacts`, { ...addedContact, value: "x" })).statusCode).toBe(400);
    const contactResponse = await request(owner, "POST", `/api/v1/subscribers/${id}/contacts`, addedContact);
    expect(contactResponse.statusCode).toBe(200);
    expect((await request(owner, "POST", `/api/v1/subscribers/${id}/contacts`, addedContact)).statusCode).toBe(409);
    expect((await request(owner, "POST", `/api/v1/subscribers/${id}/contacts`, { ...addedContact, version: addedContact.version + 1 })).statusCode).toBe(409);
    const contactSearch = await request(viewer, "GET", "/api/v1/subscribers?search=09170000002&page=1&pageSize=25");
    expect((contactSearch.json() as { data: { items: Array<{ id: string }> } }).data.items.filter((item) => item.id === id)).toHaveLength(1);
    await app.close();
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
    const contactProfile = await request(viewer, "GET", `/api/v1/subscribers/${id}`);
    const contactData = (contactProfile.json() as { data: { subscriber: { version: number }; contacts: Array<{ value: string; isPrimary: boolean; isActive: boolean }> } }).data;
    expect(contactData.subscriber.version).toBe(addedContact.version + 1);
    expect(contactData.contacts.filter((contact) => contact.isActive)).toHaveLength(2);
    expect(contactData.contacts.filter((contact) => contact.isPrimary).map((contact) => contact.value)).toEqual([addedContact.value]);
    const contactAudit = await pool.query("select count(*)::int as total from audit_logs where entity_type = 'subscriber' and entity_id = $1 and action = 'subscriber.contact.add'", [id]);
    expect(contactAudit.rows[0]?.total).toBe(1);

    const newAddress = { type: "SERVICE", line1: "456 Second Street", barangay: "Second Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true, version: contactData.subscriber.version };
    expect((await request(viewer, "POST", `/api/v1/subscribers/${id}/addresses`, newAddress)).statusCode).toBe(403);
    expect((await request(owner, "POST", `/api/v1/subscribers/${id}/addresses`, { ...newAddress, line1: "X" })).statusCode).toBe(400);
    const addressResponse = await request(owner, "POST", `/api/v1/subscribers/${id}/addresses`, newAddress);
    expect(addressResponse.statusCode).toBe(200);
    expect((await request(owner, "POST", `/api/v1/subscribers/${id}/addresses`, newAddress)).statusCode).toBe(409);
    expect((await request(owner, "POST", `/api/v1/subscribers/${id}/addresses`, { ...newAddress, version: newAddress.version + 1 })).statusCode).toBe(409);
    const addressSearch = await request(viewer, "GET", "/api/v1/subscribers?search=456%20second%20street&page=1&pageSize=25");
    expect((addressSearch.json() as { data: { items: Array<{ id: string }> } }).data.items.filter((item) => item.id === id)).toHaveLength(1);
    await app.close();
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
    const addressProfile = await request(viewer, "GET", `/api/v1/subscribers/${id}`);
    const addressData = (addressProfile.json() as { data: { subscriber: { version: number }; addresses: Array<{ id: string; isPrimary: boolean; isActive: boolean }> } }).data;
    expect(addressData.subscriber.version).toBe(newAddress.version + 1);
    expect(addressData.addresses.filter((address) => address.isActive)).toHaveLength(2);
    expect(addressData.addresses.filter((address) => address.isPrimary).map((address) => address.id)).toEqual([(addressResponse.json() as { data: { id: string } }).data.id]);
    const serviceAddress = await pool.query("select installation_address_id from service_accounts where id = $1", [service.id]);
    expect(serviceAddress.rows[0]?.installation_address_id).toBe(addressId);
    const addressAudit = await pool.query("select count(*)::int as total from audit_logs where entity_type = 'subscriber' and entity_id = $1 and action = 'subscriber.address.add'", [id]);
    expect(addressAudit.rows[0]?.total).toBe(1);

    const beforeContactEdit = await request(owner, "GET", `/api/v1/subscribers/${id}`);
    const contactState = (beforeContactEdit.json() as { data: { subscriber: { version: number }; contacts: Array<{ id: string; value: string; isPrimary: boolean; isActive: boolean }> } }).data;
    const oldContact = contactState.contacts.find((contact) => contact.value === "09170000001");
    const primaryContact = contactState.contacts.find((contact) => contact.value === "09170000002");
    if (!oldContact || !primaryContact) throw new Error("The contact fixtures are unavailable.");
    const replacement = { type: "MOBILE", value: "09170000004", isPrimary: false, version: contactState.subscriber.version };
    const contactUrl = `/api/v1/subscribers/${id}/contacts/${oldContact.id}`;
    expect((await request(viewer, "PUT", contactUrl, replacement)).statusCode).toBe(403);
    expect((await request(owner, "PUT", contactUrl, { ...replacement, value: "x" })).statusCode).toBe(400);
    expect((await request(owner, "PUT", contactUrl, { ...replacement, value: primaryContact.value })).statusCode).toBe(409);
    const replaced = await request(owner, "PUT", contactUrl, replacement);
    expect(replaced.statusCode).toBe(200);
    const newContactId = (replaced.json() as { data: { id: string } }).data.id;
    expect((await request(owner, "PUT", contactUrl, replacement)).statusCode).toBe(409);
    const oldContactSearch = await request(viewer, "GET", "/api/v1/subscribers?search=09170000001&page=1&pageSize=25");
    expect((oldContactSearch.json() as { data: { items: Array<{ id: string }> } }).data.items.some((item) => item.id === id)).toBe(false);
    const newContactSearch = await request(viewer, "GET", "/api/v1/subscribers?search=09170000004&page=1&pageSize=25");
    expect((newContactSearch.json() as { data: { items: Array<{ id: string }> } }).data.items.filter((item) => item.id === id)).toHaveLength(1);
    const primaryUrl = `/api/v1/subscribers/${id}/contacts/${primaryContact.id}/active`;
    expect((await request(viewer, "PATCH", primaryUrl, { version: replacement.version + 1 })).statusCode).toBe(403);
    expect((await request(owner, "PATCH", primaryUrl, { version: replacement.version })).statusCode).toBe(409);
    expect((await request(owner, "PATCH", primaryUrl, { version: replacement.version + 1 })).statusCode).toBe(204);
    expect((await request(owner, "PATCH", `/api/v1/subscribers/${id}/contacts/${newContactId}/active`, { version: replacement.version + 2 })).statusCode).toBe(409);
    await app.close();
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
    const finalContacts = await request(viewer, "GET", `/api/v1/subscribers/${id}`);
    const finalContactState = (finalContacts.json() as { data: { subscriber: { version: number }; contacts: Array<{ id: string; value: string; isPrimary: boolean; isActive: boolean }> } }).data;
    expect(finalContactState.subscriber.version).toBe(replacement.version + 2);
    expect(finalContactState.contacts.filter((contact) => contact.isActive)).toEqual([expect.objectContaining({ id: newContactId, isPrimary: true })]);
    expect(finalContactState.contacts.find((contact) => contact.id === oldContact.id)).toMatchObject({ isActive: false, isPrimary: false });
    expect(finalContactState.contacts.find((contact) => contact.id === primaryContact.id)).toMatchObject({ isActive: false, isPrimary: false });
    const contactHistoryAudit = await pool.query("select action, after_values::text as metadata from audit_logs where entity_type = 'subscriber' and entity_id = $1 and action in ('subscriber.contact.replace', 'subscriber.contact.deactivate') order by occurred_at", [id]);
    expect(contactHistoryAudit.rows.map((row) => row.action)).toEqual(["subscriber.contact.replace", "subscriber.contact.deactivate"]);
    expect(contactHistoryAudit.rows.every((row) => !row.metadata.includes("091700000"))).toBe(true);

    const addressVersion = finalContactState.subscriber.version;
    const referencedUrl = `/api/v1/subscribers/${id}/addresses/${addressId}`;
    const replacementAddress = { type: "SERVICE", line1: "789 Replacement Street", line2: "", barangay: "Third Barangay", cityMunicipality: "Test City", province: "Bukidnon", postalCode: "", isPrimary: false, version: addressVersion };
    expect((await request(viewer, "PUT", referencedUrl, replacementAddress)).statusCode).toBe(403);
    const referencedEdit = await request(owner, "PUT", referencedUrl, replacementAddress);
    expect(referencedEdit.statusCode).toBe(409);
    expect((referencedEdit.json() as { error: { code: string } }).error.code).toBe("ADDRESS_IN_USE");
    expect((await request(owner, "PATCH", `${referencedUrl}/active`, { version: addressVersion })).statusCode).toBe(409);
    const editableId = (addressResponse.json() as { data: { id: string } }).data.id;
    const editableUrl = `/api/v1/subscribers/${id}/addresses/${editableId}`;
    expect((await request(owner, "PUT", editableUrl, { ...replacementAddress, line1: "X" })).statusCode).toBe(400);
    expect((await request(owner, "PUT", editableUrl, { ...replacementAddress, line1: "123 Test Street", barangay: "Test Barangay" })).statusCode).toBe(409);
    const addressReplacement = await request(owner, "PUT", editableUrl, replacementAddress);
    expect(addressReplacement.statusCode).toBe(200);
    const replacementId = (addressReplacement.json() as { data: { id: string } }).data.id;
    expect((await request(owner, "PUT", editableUrl, replacementAddress)).statusCode).toBe(409);
    const removedSearch = await request(viewer, "GET", "/api/v1/subscribers?search=456%20second%20street&page=1&pageSize=25");
    expect((removedSearch.json() as { data: { items: Array<{ id: string }> } }).data.items.some((item) => item.id === id)).toBe(false);
    const replacementSearch = await request(viewer, "GET", "/api/v1/subscribers?search=789%20replacement%20street&page=1&pageSize=25");
    expect((replacementSearch.json() as { data: { items: Array<{ id: string }> } }).data.items.filter((item) => item.id === id)).toHaveLength(1);
    const spare = await request(owner, "POST", `/api/v1/subscribers/${id}/addresses`, { ...replacementAddress, line1: "999 Spare Street", barangay: "Spare Barangay", isPrimary: false, version: addressVersion + 1 });
    expect(spare.statusCode).toBe(200);
    const primaryAddressUrl = `/api/v1/subscribers/${id}/addresses/${replacementId}/active`;
    expect((await request(viewer, "PATCH", primaryAddressUrl, { version: addressVersion + 2 })).statusCode).toBe(403);
    expect((await request(owner, "PATCH", primaryAddressUrl, { version: addressVersion + 1 })).statusCode).toBe(409);
    expect((await request(owner, "PATCH", primaryAddressUrl, { version: addressVersion + 2 })).statusCode).toBe(204);
    const persistedServiceAddress = await pool.query("select installation_address_id from service_accounts where id = $1", [service.id]);
    expect(persistedServiceAddress.rows[0]?.installation_address_id).toBe(addressId);
    await app.close();
    app = await buildApp({ allowedOrigins: [], authService: new AuthService(new PostgresAuthStore(database.db)), subscriberService: new SubscriberService(database.db) });
    const finalAddresses = await request(viewer, "GET", `/api/v1/subscribers/${id}`);
    const finalAddressState = (finalAddresses.json() as { data: { subscriber: { version: number }; addresses: Array<{ id: string; isPrimary: boolean; isActive: boolean }> } }).data;
    expect(finalAddressState.subscriber.version).toBe(addressVersion + 3);
    expect(finalAddressState.addresses.filter((address) => address.isActive).map((address) => address.id)).toContain(addressId);
    expect(finalAddressState.addresses.find((address) => address.id === addressId)).toMatchObject({ isPrimary: true, isActive: true });
    expect(finalAddressState.addresses.find((address) => address.id === editableId)).toMatchObject({ isPrimary: false, isActive: false });
    expect(finalAddressState.addresses.find((address) => address.id === replacementId)).toMatchObject({ isPrimary: false, isActive: false });
    const addressHistoryAudit = await pool.query("select action, after_values::text as metadata from audit_logs where entity_type = 'subscriber' and entity_id = $1 and action in ('subscriber.address.replace', 'subscriber.address.deactivate') order by occurred_at", [id]);
    expect(addressHistoryAudit.rows.map((row) => row.action)).toEqual(["subscriber.address.replace", "subscriber.address.deactivate"]);
    expect(addressHistoryAudit.rows.every((row) => !row.metadata.includes("Street"))).toBe(true);
  });
});
