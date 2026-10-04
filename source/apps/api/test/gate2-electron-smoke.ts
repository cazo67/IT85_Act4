import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";

import { createDatabase } from "../src/db/client.js";
import { authSessions, userRoles, users } from "../src/db/schema/index.js";
import { hashPassword } from "../src/security/password.js";

async function main() {
const uri = process.env.BCIS_TEST_DATABASE_URL ?? "";
const target = new URL(uri);
if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") {
  throw new Error("Electron smoke requires local 127.0.0.1:5433/bcis_test.");
}

const pool = new Pool({ connectionString: uri, max: 2 });
const database = createDatabase(uri);
let actorId = "";
let client: CdpClient | undefined;

try {
  const check = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
  if (check.rows[0]?.name !== "bcis_test" || check.rows[0]?.migrations !== 19) throw new Error("Unmigrated or incorrect test database.");
  const ready = await fetch("http://127.0.0.1:4110/api/v1/health/ready");
  if (ready.status !== 200) throw new Error("The dedicated test API must be ready on port 4110.");
  const username = `gate2_ui_${randomUUID()}`;
  const password = randomBytes(24).toString("base64url");
  const role = await pool.query("select id from roles where code = 'OWNER'");
  if (!role.rows[0]?.id) throw new Error("The test OWNER role is missing.");
  const [actor] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: "Gate 2 Electron Test", passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
  if (!actor) throw new Error("Could not create the test actor.");
  actorId = actor.id;
  await database.db.insert(userRoles).values({ userId: actor.id, roleId: role.rows[0].id as string });

  client = await CdpClient.connect(9235);
  await client.evaluate("localStorage.setItem('bcis-sidebar-collapsed-v1', 'false'); location.reload(); true");
  await waitFor(client, "document.querySelector('#username') !== null");
  await fill(client, "#username", username);
  await fill(client, "#password", password);
  await click(client, "Sign in");
  await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
  const verifySubscriberId = process.env.BCIS_VERIFY_SUBSCRIBER_ID;
  if (verifySubscriberId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(verifySubscriberId)) throw new Error("Invalid restart-check subscriber ID.");
    const record = await pool.query("select s.account_number, (select count(*)::int from payments where subscriber_id=s.id and status='POSTED') as payments, (select coalesce(sum(total_centavos-paid_centavos),0) from invoices where subscriber_id=s.id) as outstanding, (select coalesce(sum(debit_centavos-credit_centavos),0) from ledger_entries where subscriber_id=s.id) as ledger_net from subscribers s where s.id=$1", [verifySubscriberId]);
    const prior = record.rows[0] as { account_number: string; payments: number; outstanding: string; ledger_net: string } | undefined;
    if (!prior || prior.payments !== 1 || prior.outstanding !== prior.ledger_net) throw new Error("Prior synthetic Cash record is missing or unbalanced.");
    await click(client, "Subscribers");
    await waitFor(client, "document.body.innerText.includes('New subscriber')");
    await fill(client, 'input[placeholder="Search account, name, contact, or address"]', prior.account_number);
    await click(client, "Search");
    await waitFor(client, `document.body.innerText.includes(${JSON.stringify(prior.account_number)})`);
    await client.evaluate(`(() => { const row = [...document.querySelectorAll('tbody tr')].find((element) => element.textContent?.includes(${JSON.stringify(prior.account_number)})); if (!row) throw new Error('Prior subscriber row missing'); row.click(); return true; })()`);
    await waitFor(client, "document.body.innerText.includes('Ledger / SOA')");
    const expectedPesos = (BigInt(prior.outstanding) / 100n).toLocaleString("en-PH");
    const expectedCents = (BigInt(prior.outstanding) % 100n).toString().padStart(2, "0");
    await waitFor(client, `document.body.innerText.includes(${JSON.stringify(`${expectedPesos}.${expectedCents}`)})`);
    console.log(JSON.stringify({ persistedAfterProcessRestart: true, payments: prior.payments, outstandingCentavos: prior.outstanding, ledgerMatches: true }));
    return;
  }
  await click(client, "Subscribers");
  await waitFor(client, "document.body.innerText.includes('New subscriber')");
  await click(client, "New subscriber");
  await waitFor(client, "document.body.innerText.includes('Account number is generated')");
  const lastName = `Journey${randomInt(100000, 999999)}`;
  for (const [label, value] of Object.entries({ "First name": "GateTwoUi", "Last name": lastName, Mobile: "09170000005", "Address line": "5 Test Street", Barangay: "Test Barangay", "City / Municipality": "Test City" })) {
    await fillField(client, label, value);
  }
  await click(client, "Create subscriber");
  await waitFor(client, `document.body.innerText.includes(${JSON.stringify(`GateTwoUi ${lastName}`)}) && document.body.innerText.includes('Add service')`);
  await click(client, "Add service");
  await waitFor(client, "document.body.innerText.includes('Create service')");
  await click(client, "Create service");
  await waitFor(client, "document.body.innerText.includes('Service history') && document.body.innerText.includes('ACTIVE')");

  let periodKey = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${2300 + randomInt(500)}-${String(randomInt(1, 13)).padStart(2, "0")}`;
    const exists = await pool.query("select 1 from billing_cycles where period_key = $1", [candidate]);
    if (!exists.rowCount) { periodKey = candidate; break; }
  }
  if (!periodKey) throw new Error("Could not find an unused synthetic billing period.");
  await click(client, "Generate billing");
  await waitFor(client, "document.querySelector('input[aria-label=\"Billing month\"]') !== null");
  await fill(client, 'input[aria-label="Billing month"]', periodKey);
  await click(client, "Preview");
  await waitFor(client, "document.body.innerText.includes('Review and finalize')");
  await click(client, "Review and finalize");
  await waitFor(client, "document.body.innerText.includes('Finalize monthly billing?')");
  await click(client, "Finalize billing");
  await waitFor(client, "document.body.innerText.includes('invoices finalized for')", 30000);

  await click(client, "Receive payment");
  await waitFor(client, "document.body.innerText.includes('Receive cash payment')");
  await fill(client, 'input[placeholder="Search subscriber account or name"]', lastName);
  await click(client, "Search");
  await waitFor(client, `document.body.innerText.includes(${JSON.stringify(lastName)})`);
  await client.evaluate(`(() => { const row = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(${JSON.stringify(lastName)})); if (!row) throw new Error('Test subscriber search row missing'); row.click(); return true; })()`);
  await fill(client, 'input[placeholder="Amount in PHP"]', "1.00");
  await click(client, "Preview allocation");
  await waitFor(client, "document.body.innerText.includes('Confirm and issue receipt')");
  await click(client, "Confirm and issue receipt");
  await waitFor(client, "document.body.innerText.includes('BCIS OFFICIAL RECEIPT')");

  const subscriber = await pool.query("select id from subscribers where last_name = $1", [lastName]);
  const subscriberId = subscriber.rows[0]?.id as string | undefined;
  if (!subscriberId) throw new Error("Electron-created subscriber was not persisted.");
  const financial = await pool.query("select (select count(*)::int from service_accounts where subscriber_id = $1) as services, (select count(*)::int from invoices where subscriber_id = $1) as invoices, (select count(*)::int from payments where subscriber_id = $1 and status = 'POSTED') as payments, (select count(*)::int from receipts r join payments p on p.id = r.payment_id where p.subscriber_id = $1) as receipts, (select count(*)::int from payment_allocations a join payments p on p.id = a.payment_id where p.subscriber_id = $1) as allocations, (select coalesce(sum(total_centavos - paid_centavos), 0) from invoices where subscriber_id = $1) as outstanding, (select coalesce(sum(debit_centavos - credit_centavos), 0) from ledger_entries where subscriber_id = $1) as ledger_net", [subscriberId]);
  const row = financial.rows[0];
  if (row.services !== 1 || row.invoices !== 1 || row.payments !== 1 || row.receipts !== 1 || row.allocations !== 1 || row.outstanding !== row.ledger_net) throw new Error("Electron Cash workflow did not reconcile.");
  await click(client, "Payment history");
  await waitFor(client, "document.body.innerText.includes('Posted payments and compensating reversals')");
  await click(client, "Reports");
  await waitFor(client, "document.body.innerText.includes('Reports')");
  await click(client, "Audit history");
  await waitFor(client, "document.body.innerText.includes('Audit history')");
  await client.evaluate("location.reload(); true");
  await waitFor(client, "document.querySelector('#username') !== null");
  await fill(client, "#username", username);
  await fill(client, "#password", password);
  await click(client, "Sign in");
  await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
  const persisted = await pool.query("select (select coalesce(sum(total_centavos - paid_centavos), 0) from invoices where subscriber_id = $1) as outstanding, (select coalesce(sum(debit_centavos - credit_centavos), 0) from ledger_entries where subscriber_id = $1) as ledger_net", [subscriberId]);
  if (persisted.rows[0]?.outstanding !== row.outstanding || persisted.rows[0]?.ledger_net !== row.ledger_net) throw new Error("Financial state changed after renderer restart.");
  console.log(JSON.stringify({ electronWorkflow: true, apiPort: 4110, services: row.services, invoices: row.invoices, payments: row.payments, receipts: row.receipts, allocations: row.allocations, persistedAfterRendererReload: true }));
} finally {
  client?.close();
  if (actorId) {
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, actorId));
    await database.db.update(authSessions).set({ revokedAt: sql`now()` }).where(eq(authSessions.userId, actorId));
  }
  await database.close();
  await pool.end();
}
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
    });
  }
  static async connect(port: number) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json() as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
    const target = targets.find((item) => item.type === "page" && item.url.startsWith("http://localhost:5173"));
    if (!target) throw new Error("The Electron development renderer is not running on 5173.");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { socket.addEventListener("open", () => resolve(), { once: true }); socket.addEventListener("error", () => reject(new Error("CDP connection failed.")), { once: true }); });
    return new CdpClient(socket);
  }
  async evaluate(expression: string) {
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    const response = await result as { result?: { value?: unknown }; exceptionDetails?: { text: string } };
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(client: CdpClient, condition: string, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await client.evaluate(`Boolean(${condition})`)) return; } catch { /* Renderer may be reloading. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Electron screen did not reach: ${condition}`);
}

async function fill(client: CdpClient, selector: string, value: string) {
  await client.evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) throw new Error('Input missing'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
}

async function fillField(client: CdpClient, label: string, value: string) {
  await client.evaluate(`(() => { const label = [...document.querySelectorAll('label')].find((element) => element.textContent?.trim() === ${JSON.stringify(label)}); const input = label?.parentElement?.querySelector('input'); if (!(input instanceof HTMLInputElement)) throw new Error('Field missing'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
}

async function click(client: CdpClient, label: string) {
  await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing: ${label}'); button.click(); return true; })()`);
}

await main();
