import { randomBytes, randomUUID } from "node:crypto";

import { chromium, type Browser } from "playwright-core";
import { Pool } from "pg";

import { createDatabase } from "../src/db/client.js";
import { userRoles, users } from "../src/db/schema/index.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";
const apiOrigin = "http://127.0.0.1:4110";

async function main() {
  const target = new URL(testUri);
  if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("Playwright Gate 4 requires guarded 127.0.0.1:5433/bcis_test.");
  const pool = new Pool({ connectionString: testUri, max: 2 });
  const database = createDatabase(testUri);
  let browser: Browser | undefined;
  let actorId: string | undefined;
  try {
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("Guarded test database is not at migration 19.");
    if ((await fetch(`${apiOrigin}/api/v1/health/ready`)).status !== 200) throw new Error("Isolated API 4110 is not ready.");
    const roleId = (await pool.query("select id from roles where code='OWNER'")).rows[0]?.id as string | undefined;
    if (!roleId) throw new Error("Owner role missing.");
    const username = `pw_gate4_${randomUUID()}`;
    const password = randomBytes(24).toString("base64url");
    const [actor] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: "Gate 4 Playwright Owner", passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
    if (!actor) throw new Error("Synthetic actor creation failed.");
    actorId = actor.id;
    await database.db.insert(userRoles).values({ userId: actor.id, roleId });
    const login = await fetch(`${apiOrigin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (login.status !== 200) throw new Error(`Synthetic owner login failed: ${login.status}`);
    const token = ((await login.json()) as { data: { token: string } }).data.token;
    const api = async (method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${apiOrigin}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error(`Fixture API ${method} ${path} returned ${response.status}: ${await response.text()}`);
      return (await response.json()).data as any;
    };
    const createSubscriber = async (lastName: string, mobile: string) => {
      const subscriber = await api("POST", "/api/v1/subscribers", {
        firstName: "Playwright", lastName, billingDay: 1, dueDay: 15,
        addresses: [{ type: "SERVICE", line1: "18 Synthetic Street", barangay: "Test", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }],
        contacts: [{ type: "MOBILE", value: mobile, isPrimary: true }]
      });
      const profile = await api("GET", `/api/v1/subscribers/${subscriber.id}`);
      const planId = (await pool.query("select id from service_plans where is_active order by code limit 1")).rows[0]?.id as string | undefined;
      if (!planId || !profile.addresses[0]?.id) throw new Error("Synthetic plan/address missing.");
      await api("POST", "/api/v1/service-accounts", { subscriberId: subscriber.id, planId, installationAddressId: profile.addresses[0].id, billingStartDate: "2026-01-01", activationDate: "2026-01-01", billingDay: 1, dueDay: 15 });
      return subscriber as { id: string; accountNumber: string };
    };
    const paySubscriber = await createSubscriber("Payment", "09170000018");
    const voidSubscriber = await createSubscriber("Void", "09170000019");
    const yearResult = await pool.query("select candidate::int as year from generate_series(9200, 9499) candidate where not exists (select 1 from billing_cycles where period_key=candidate::text || '-01') order by candidate limit 1");
    const year = yearResult.rows[0]?.year as number | undefined;
    if (!year) throw new Error("No unused synthetic billing period remains.");
    await api("POST", "/api/v1/billing/finalize", { periodKey: `${year}-01`, commandKey: randomUUID() });
    const voidInvoice = (await pool.query("select invoice_number from invoices where subscriber_id=$1 order by created_at desc limit 1", [voidSubscriber.id])).rows[0]?.invoice_number as string | undefined;
    if (!voidInvoice) throw new Error("Void fixture invoice missing.");
    const collector = (await pool.query("select id from collectors order by code limit 1")).rows[0]?.id as string | undefined;
    const route = (await pool.query("select id from collection_routes order by code limit 1")).rows[0]?.id as string | undefined;
    if (!collector || !route) throw new Error("Collector/route fixture missing.");
    const dateResult = await pool.query("select day::date::text as date from generate_series('8910-01-01'::date, '8919-12-31'::date, '1 day') day where not exists (select 1 from collection_batches where collector_id=$1 and route_id=$2 and collection_date=day::date) order by day limit 1", [collector, route]);
    const collectionDate = dateResult.rows[0]?.date as string | undefined;
    if (!collectionDate) throw new Error("No unused synthetic collection date remains.");
    const batchNumber = `BAT-PW-${randomBytes(6).toString("hex").toUpperCase()}`;
    const batch = await pool.query("insert into collection_batches(batch_number,collector_id,route_id,collection_date,status,expected_cash_centavos,collected_cash_centavos,remitted_cash_centavos,difference_centavos,created_by) values($1,$2,$3,$4,'REMITTED',1000,1000,900,-100,$5) returning id", [batchNumber, collector, route, collectionDate, actor.id]);
    await pool.query("insert into collector_remittances(remittance_number,batch_id,remitted_cash_centavos,difference_centavos,notes,remitted_by) values($1,$2,900,-100,'Playwright shortage',$3)", [`REM-PW-${randomBytes(6).toString("hex").toUpperCase()}`, batch.rows[0]?.id, actor.id]);

    browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
    const context = browser.contexts()[0];
    if (!context) throw new Error("Electron browser context was not found on CDP 9236.");
    const page = context.pages().find((candidate) => candidate.url().startsWith("http://localhost:5173"));
    if (!page) throw new Error("Electron renderer page was not found on CDP 9236.");
    page.setDefaultTimeout(15_000);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await page.reload();
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByText("Authenticated BCIS workspace").waitFor();
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await nav.getByRole("button", { name: "Receive payment" }).click();
    await page.getByPlaceholder("Search subscriber account or name").fill(paySubscriber.accountNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(paySubscriber.accountNumber) }).click();
    await page.getByLabel("Method").selectOption("BANK_TRANSFER");
    const reference = `PW${randomBytes(8).toString("hex").toUpperCase()}`;
    await page.getByLabel("Unique payment reference").fill(reference);
    await page.getByRole("checkbox", { name: /confirm the funds were received/i }).check();
    await page.getByLabel("Amount in PHP").fill("5.00");
    await page.getByRole("button", { name: "Preview allocation" }).click();
    await page.getByRole("button", { name: "Confirm and issue receipt" }).click();
    await page.getByText(reference, { exact: true }).waitFor();
    await page.getByText("BCIS OFFICIAL RECEIPT").waitFor();
    for (const method of ["CHEQUE", "OTHER"] as const) {
      await page.getByRole("button", { name: "Another payment" }).click();
      await page.getByPlaceholder("Search subscriber account or name").fill(paySubscriber.accountNumber);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(paySubscriber.accountNumber) }).click();
      await page.getByLabel("Method").selectOption(method);
      const methodReference = `${method === "CHEQUE" ? "CH" : "OT"}${randomBytes(8).toString("hex").toUpperCase()}`;
      await page.getByLabel("Unique payment reference").fill(methodReference);
      if (method === "OTHER") await page.getByLabel("Payment description").fill("Playwright synthetic payment");
      await page.getByRole("checkbox", { name: /I confirm/i }).check();
      await page.getByLabel("Amount in PHP").fill("5.00");
      await page.getByRole("button", { name: "Preview allocation" }).click();
      await page.getByRole("button", { name: "Confirm and issue receipt" }).click();
      await page.getByText(methodReference, { exact: true }).waitFor();
      if (method === "OTHER") await page.getByText("Playwright synthetic payment", { exact: true }).waitFor();
    }
    await nav.getByRole("button", { name: "Submit GCash proof" }).click();
    await page.getByLabel("GCash proof image").waitFor();
    await nav.getByRole("button", { name: "GCash proofs" }).click();
    await page.getByLabel("GCash proof status").waitFor();
    await nav.getByRole("button", { name: "Invoices" }).click();
    await page.getByLabel("Search invoice number").fill(voidInvoice);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: `View invoice ${voidInvoice}` }).click();
    await page.getByLabel("Void reason (10–500 characters)").fill("Playwright synthetic unpaid invoice void");
    await page.getByRole("button", { name: "Void unpaid invoice" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Void invoice" }).click();
    await page.getByText("Playwright synthetic unpaid invoice void").last().waitFor();
    await nav.getByRole("button", { name: "Collection batches" }).click();
    await page.locator("tr", { hasText: batchNumber }).click();
    await page.getByText("Current difference:", { exact: false }).waitFor();
    await page.getByLabel("Correction reason").fill("Playwright counted cash correction");
    await page.getByRole("checkbox", { name: /cash was counted and actually corrected/i }).check();
    await page.getByRole("button", { name: "Record exact-match correction" }).click();
    await page.getByText("Playwright counted cash correction").waitFor();
    await page.getByRole("button", { name: "Reconcile balanced batch" }).click();
    await page.getByRole("button", { name: "Close batch" }).first().waitFor();
    await cdp.send("Emulation.setDeviceMetricsOverride", { width:700, height:720, deviceScaleFactor:1, mobile:false });
    await page.waitForFunction(() => window.innerWidth < 1024);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.locator('aside[role="dialog"][aria-modal="true"]').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error("Responsive Gate 4 workspace has document-wide horizontal overflow.");
    await page.getByRole("button", { name: "Close navigation" }).click();
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.locator("#username").waitFor();
    console.info(JSON.stringify({ playwrightElectron: true, ownerLogin: true, confirmedBankChequeOtherReceipts: true, gcashProofNavigation: true, unpaidInvoiceVoid: true, remittanceCorrection: true, balancedReconciliation: true, responsiveDrawer: true, noHorizontalOverflow: true, signOut: true, installedClient: "not verified" }));
  } finally {
    await browser?.close();
    if (actorId) await database.db.update(users).set({ isActive: false }).where((await import("drizzle-orm")).eq(users.id, actorId));
    await database.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
