import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { Pool } from "pg";

import { createDatabase } from "../src/db/client.js";
import { authSessions, userRoles, users } from "../src/db/schema/index.js";
import { hashPassword } from "../src/security/password.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";
const apiOrigin = "http://127.0.0.1:4110";

async function main() {
  const target = new URL(testUri);
  if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("Gate 5 Playwright smoke requires guarded 127.0.0.1:5433/bcis_test.");
  const pool = new Pool({ connectionString: testUri, max: 2 });
  const database = createDatabase(testUri);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let actorId: string | undefined;
  let traceStarted = false;
  let passed = false;
  try {
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("The guarded test database is not at migration 19.");
    if ((await fetch(`${apiOrigin}/api/v1/health/ready`)).status !== 200) throw new Error("The isolated API 4110 is not ready.");
    browser = await chromium.connectOverCDP("http://127.0.0.1:9236");
    context = browser.contexts()[0];
    const page = context?.pages().find((candidate) => candidate.url().startsWith("http://localhost:5173"));
    if (!context || !page) throw new Error("The Electron renderer at localhost:5173 was not found on CDP 9236.");
    page.setDefaultTimeout(15_000);
    await context.tracing.start({ screenshots: true, snapshots: true });
    traceStarted = true;

    const roleId = (await pool.query("select id from roles where code='OWNER'")).rows[0]?.id as string | undefined;
    if (!roleId) throw new Error("The synthetic OWNER role is missing.");
    const username = `pw_gate5_${randomUUID()}`;
    const password = randomBytes(24).toString("base64url");
    const [actor] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: "Gate 5 Playwright Owner", passwordHash: await hashPassword(password), mustChangePassword: false }).returning({ id: users.id });
    if (!actor) throw new Error("Synthetic Owner creation failed.");
    actorId = actor.id;
    await database.db.insert(userRoles).values({ userId: actor.id, roleId });

    // A new renderer load must start at the login screen because tokens stay in memory.
    await page.reload();
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.route("**/api/v1/auth/login", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("alert").getByText("The BCIS server is unavailable.").waitFor();
    await page.locator("#username").waitFor();
    await page.unroute("**/api/v1/auth/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Authenticated BCIS workspace").waitFor();
    await page.getByText("Fastify API").waitFor();
    await page.getByText("PostgreSQL", { exact: true }).waitFor();
    await page.getByText("online", { exact: true }).waitFor();
    await page.getByText("ready", { exact: true }).waitFor();

    const navigation = page.locator('nav[aria-label="Main navigation"]');
    await navigation.getByRole("button", { name: "Subscribers" }).click();
    await page.getByText("New subscriber").waitFor();
    await navigation.getByRole("button", { name: "Dashboard" }).click();
    await page.getByText("Authenticated BCIS workspace").waitFor();

    await page.route("**/api/v1/health/**", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Check connection" }).click();
    await page.getByText("offline", { exact: true }).waitFor();
    await page.getByText("unavailable", { exact: true }).waitFor();
    await page.unroute("**/api/v1/health/**");
    await page.getByRole("button", { name: "Check connection" }).click();
    await page.getByText("online", { exact: true }).waitFor();
    await page.getByText("ready", { exact: true }).waitFor();

    // Full UI Cash slice: create the subscriber and service, finalize a bill,
    // then collect a partial Cash payment and reconcile the persisted records.
    const lastName = `GateFive${randomUUID().slice(0, 8)}`;
    await navigation.getByRole("button", { name: "Subscribers" }).click();
    await page.getByRole("button", { name: "New subscriber" }).click();
    const fillSubscriberField = async (label: string, value: string) => {
      await page.getByText(label, { exact: true }).locator("..").locator("input").fill(value);
    };
    await fillSubscriberField("First name", "Playwright");
    await fillSubscriberField("Last name", lastName);
    await fillSubscriberField("Mobile", "09170000025");
    await fillSubscriberField("Address line", "25 Synthetic Street");
    await fillSubscriberField("Barangay", "Test Barangay");
    await fillSubscriberField("City / Municipality", "Test City");
    await page.getByRole("button", { name: "Create subscriber" }).click();
    await page.getByRole("heading", { name: `Playwright ${lastName}` }).waitFor();
    await page.getByRole("button", { name: "Add service" }).click();
    const newService = page.getByText("New service account", { exact: true }).locator("..");
    await newService.locator("select").first().locator("option").first().waitFor({ state: "attached" });
    await newService.getByRole("button", { name: "Create service" }).click();
    await page.getByText("Service history", { exact: true }).waitFor();
    const subscriberId = (await pool.query("select id from subscribers where last_name=$1", [lastName])).rows[0]?.id as string | undefined;
    if (!subscriberId) throw new Error("The UI-created subscriber was not persisted.");
    const period = (await pool.query("select candidate::text || '-01' as period from generate_series(2400, 2499) candidate where not exists (select 1 from billing_cycles where period_key=candidate::text || '-01') order by candidate limit 1")).rows[0]?.period as string | undefined;
    if (!period) throw new Error("No unused synthetic billing period remains.");
    await navigation.getByRole("button", { name: "Generate billing" }).click();
    await page.getByLabel("Billing month").fill(period);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Review and finalize" }).waitFor();
    await page.getByRole("button", { name: "Review and finalize" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Finalize billing" }).click();
    await page.getByText(/invoices finalized for/).waitFor({ timeout: 30_000 });
    await navigation.getByRole("button", { name: "Receive payment" }).click();
    await page.getByPlaceholder("Search subscriber account or name").fill(lastName);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(lastName) }).click();
    await page.getByLabel("Amount in PHP").fill("1.37");
    await page.getByRole("button", { name: "Preview allocation" }).click();
    let firstCommandKey: string | undefined;
    let responseLostAfterCommit = false;
    let retryReusedCommandKey = false;
    await page.route("**/api/v1/payments", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const input = route.request().postDataJSON() as { commandKey: string };
      if (!firstCommandKey) {
        firstCommandKey = input.commandKey;
        const committed = await route.fetch();
        responseLostAfterCommit = committed.status() === 200;
        await route.abort("failed");
        return;
      }
      retryReusedCommandKey = input.commandKey === firstCommandKey;
      await route.continue();
    });
    await page.getByRole("button", { name: "Confirm and issue receipt" }).click();
    await page.getByText("If the response was lost, retry the same payment.", { exact: false }).waitFor();
    if (!responseLostAfterCommit) throw new Error("The first Cash payment did not commit before its response was lost.");
    const afterLostResponse = (await pool.query("select (select count(*)::int from payments where subscriber_id=$1 and status='POSTED') as payments, (select count(*)::int from receipts r join payments p on p.id=r.payment_id where p.subscriber_id=$1) as receipts", [subscriberId])).rows[0];
    if (afterLostResponse?.payments !== 1 || afterLostResponse?.receipts !== 1) throw new Error("The lost-response payment did not persist exactly once.");
    await page.getByRole("button", { name: "Confirm and issue receipt" }).click();
    await page.getByText("BCIS OFFICIAL RECEIPT").waitFor();
    await page.unroute("**/api/v1/payments");
    if (!retryReusedCommandKey) throw new Error("The desktop retry used a new financial command key.");

    const financial = (await pool.query("select (select count(*)::int from service_accounts where subscriber_id=$1) as services, (select count(*)::int from invoices where subscriber_id=$1) as invoices, (select count(*)::int from payments where subscriber_id=$1 and status='POSTED') as payments, (select count(*)::int from receipts r join payments p on p.id=r.payment_id where p.subscriber_id=$1) as receipts, (select count(*)::int from payment_allocations a join payments p on p.id=a.payment_id where p.subscriber_id=$1 and not a.is_reversed) as allocations, (select coalesce(sum(total_centavos-paid_centavos),0)::text from invoices where subscriber_id=$1 and status<>'VOID') as outstanding, (select coalesce(sum(debit_centavos-credit_centavos),0)::text from ledger_entries where subscriber_id=$1) as ledger_net, (select coalesce(sum(paid_centavos),0)::text from invoices where subscriber_id=$1) as invoice_paid, (select count(*)::int from audit_logs where entity_id in (select id::text from payments where subscriber_id=$1) and action='payment.post') as payment_audits", [subscriberId])).rows[0] as { services: number; invoices: number; payments: number; receipts: number; allocations: number; outstanding: string; ledger_net: string; invoice_paid: string; payment_audits: number } | undefined;
    if (!financial || financial.services !== 1 || financial.invoices !== 1 || financial.payments !== 1 || financial.receipts !== 1 || financial.allocations !== 1 || financial.invoice_paid !== "137" || financial.outstanding !== financial.ledger_net || financial.payment_audits !== 1) throw new Error("The Playwright Cash workflow did not reconcile across invoice, payment, allocation, receipt, ledger and audit.");
    const payment = (await pool.query("select payment_number, paid_at::date::text as day from payments where subscriber_id=$1", [subscriberId])).rows[0] as { payment_number: string; day: string } | undefined;
    if (!payment) throw new Error("The Cash payment was not persisted.");
    const apiLogin = await fetch(`${apiOrigin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (apiLogin.status !== 200) throw new Error("The synthetic Owner could not authenticate for report reconciliation.");
    const apiToken = ((await apiLogin.json()) as { data: { token: string } }).data.token;
    const reportResponse = await fetch(`${apiOrigin}/api/v1/reports/daily-collections/preview?dateFrom=${payment.day}&dateTo=${payment.day}`, { headers: { authorization: `Bearer ${apiToken}` } });
    if (reportResponse.status !== 200) throw new Error("The daily-collections report could not be read.");
    const report = ((await reportResponse.json()) as { data: { rows: Array<{ paymentNumber: string; amountCentavos: string }> } }).data;
    if (!report.rows.some((row) => row.paymentNumber === payment.payment_number && row.amountCentavos === "137")) throw new Error("The Cash payment is missing or has the wrong amount in the daily-collections report.");
    await navigation.getByRole("button", { name: "Payment history" }).click();
    await page.getByText("Posted payments and compensating reversals").waitFor();
    await navigation.getByRole("button", { name: "Reports" }).click();
    await page.getByRole("heading", { name: "Reports" }).waitFor();
    await navigation.getByRole("button", { name: "Audit history" }).click();
    await page.getByRole("heading", { name: "Business audit history", level: 1 }).waitFor();
    await page.reload();
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Authenticated BCIS workspace").waitFor();
    const persisted = (await pool.query("select (select coalesce(sum(total_centavos-paid_centavos),0)::text from invoices where subscriber_id=$1 and status<>'VOID') as outstanding, (select coalesce(sum(debit_centavos-credit_centavos),0)::text from ledger_entries where subscriber_id=$1) as ledger_net", [subscriberId])).rows[0];
    if (persisted?.outstanding !== financial.outstanding || persisted?.ledger_net !== financial.ledger_net) throw new Error("Cash balances changed after the Electron renderer restart.");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.locator("#username").waitFor();
    passed = true;
    console.info(JSON.stringify({ playwrightElectronSmoke: true, ownerLogin: true, dashboard: true, navigation: true, apiUnavailableAndRecovery: true, cashUiWorkflow: true, lostPaymentResponseRetriedOnce: true, invoicePaymentLedgerReconciled: true, reportReconciled: true, paymentAuditRows: financial.payment_audits, rendererRestartPersistence: true, signOut: true, installedClient: "not verified" }));
  } finally {
    if (traceStarted && context) {
      if (passed) await context.tracing.stop();
      else {
        const artifactDirectory = join(process.cwd(), "..", "..", "..", "tests", "screenshots");
        await mkdir(artifactDirectory, { recursive: true });
        await context.tracing.stop({ path: join(artifactDirectory, `gate5-playwright-smoke-${Date.now()}.zip`) });
      }
    }
    await browser?.close();
    if (actorId) {
      await database.db.update(users).set({ isActive: false }).where(eq(users.id, actorId));
      await database.db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.userId, actorId));
    }
    await database.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
