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
    throw new Error("Gate 3 auth smoke requires local 127.0.0.1:5433/bcis_test.");
  }
  const database = createDatabase(uri);
  const pool = new Pool({ connectionString: uri, max: 2 });
  const actors: string[] = [];
  let client: CdpClient | undefined;
  try {
    const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 15) throw new Error("The isolated test database is not ready.");
    if ((await apiFetch("http://127.0.0.1:4110/api/v1/health/ready")).status !== 200) throw new Error("The isolated test API is not ready on 4110.");
    const createActor = async (roleCode: "OWNER" | "VIEWER" | "COLLECTION_SUPERVISOR") => {
      const username = `gate3_${roleCode.toLowerCase()}_${randomUUID()}`;
      const password = randomBytes(24).toString("base64url");
      const role = await pool.query("select id from roles where code = $1", [roleCode]);
      if (!role.rows[0]?.id) throw new Error(`Missing ${roleCode} role.`);
      const [actor] = await database.db.insert(users).values({ username, normalizedUsername: username, displayName: `Gate 3 ${roleCode} Test`, passwordHash: await hashPassword(password), mustChangePassword: false }).returning();
      if (!actor) throw new Error("Could not create test actor.");
      actors.push(actor.id);
      await database.db.insert(userRoles).values({ userId: actor.id, roleId: role.rows[0].id as string });
      return { username, password };
    };
    const owner = await createActor("OWNER");
    const viewer = await createActor("VIEWER");
    client = await CdpClient.connect(9236);
    await client.evaluate("localStorage.setItem('bcis-sidebar-collapsed-v1', 'false'); location.reload(); true");
    await waitFor(client, "document.querySelector('#username') !== null");
    await signIn(client, owner.username, owner.password);
    try { await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')"); }
    catch (error) { throw new Error(`Owner login screen: ${JSON.stringify(await client.evaluate("document.body.innerText.slice(0, 1000)"))}`, { cause: error }); }
    expectDom(await client.evaluate("Boolean([...document.querySelectorAll('nav[aria-label=\"Main navigation\"] button')].find((button) => button.textContent?.trim() === 'User accounts'))"), "Owner admin navigation is missing.");

    if (process.argv.includes("--performance-report-only")) {
      const fixture = await pool.query("select b.batch_number, b.collection_date::text as batch_date, c.display_name as collector from collection_batches b join collectors c on c.id = b.collector_id join collector_remittances r on r.batch_id = b.id where b.difference_centavos <> 0 order by r.remitted_at desc, b.id desc limit 1");
      const batchNumber = fixture.rows[0]?.batch_number as string | undefined;
      const batchDate = fixture.rows[0]?.batch_date as string | undefined;
      const collector = fixture.rows[0]?.collector as string | undefined;
      if (!batchNumber || !batchDate || !collector) throw new Error("An unresolved synthetic collector batch fixture is missing from bcis_test.");
      const expected = process.argv.find((argument) => argument.startsWith("--expected-performance-batch="))?.split("=")[1];
      if (expected && expected !== batchNumber) throw new Error("Collector performance fixture changed across restart.");
      const checkPerformance = async (canExport: boolean) => {
        await click(client!, "Reports");
        await waitFor(client!, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Collector performance by batch date')");
        await click(client!, "Collector performance by batch date");
        await waitFor(client!, "document.body.innerText.includes('Groups recorded batches by collector') && document.querySelectorAll('form input[type=\"date\"]').length === 2");
        await fillReportDate(client!, 0, batchDate);
        await fillReportDate(client!, 1, batchDate);
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes(${JSON.stringify(collector)}) && document.body.innerText.includes('Unresolved difference batches') && document.body.innerText.includes('Confirmed difference')`);
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save XLSX')") === canExport, "Performance report export control did not match the signed-in role.");
        expectDom(await client!.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Performance report workspace has horizontal overflow.");
      };
      await checkPerformance(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      const supervisor = await createActor("COLLECTION_SUPERVISOR");
      await signIn(client, supervisor.username, supervisor.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkPerformance(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkPerformance(false);
      console.info(JSON.stringify({ performanceReportOwner: true, performanceReportSupervisor: true, performanceReportViewer: true, batchNumber, batchDate, noHorizontalOverflow: true }));
      return;
    }

    if (process.argv.includes("--assignment-report-only")) {
      const fixture = await pool.query("select sa.service_account_number, ca.effective_from::text as as_of from collector_assignments ca join service_accounts sa on sa.id = ca.service_account_id where ca.effective_to is null order by ca.created_at desc, ca.id desc limit 1");
      const serviceNumber = fixture.rows[0]?.service_account_number as string | undefined;
      const asOf = fixture.rows[0]?.as_of as string | undefined;
      if (!serviceNumber || !asOf) throw new Error("A synthetic collector assignment fixture is missing from bcis_test.");
      const expected = process.argv.find((argument) => argument.startsWith("--expected-assignment-service="))?.split("=")[1];
      if (expected && expected !== serviceNumber) throw new Error("Collector assignment fixture changed across restart.");
      const checkAssignments = async (canExport: boolean) => {
        await click(client!, "Reports");
        await waitFor(client!, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Collector assignments as of date')");
        await click(client!, "Collector assignments as of date");
        await waitFor(client!, "document.querySelector('form input[type=\"date\"]') !== null && document.body.innerText.includes('One row per assigned service account')");
        await fillReportDate(client!, 0, asOf);
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes(${JSON.stringify(serviceNumber)}) && document.body.innerText.includes('Effective to (exclusive)')`);
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save XLSX')") === canExport, "Assignment report export control did not match the signed-in role.");
        expectDom(await client!.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Assignment report workspace has horizontal overflow.");
      };
      await checkAssignments(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      const supervisor = await createActor("COLLECTION_SUPERVISOR");
      await signIn(client, supervisor.username, supervisor.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkAssignments(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkAssignments(false);
      console.info(JSON.stringify({ assignmentReportOwner: true, assignmentReportSupervisor: true, assignmentReportViewer: true, serviceAccountNumber: serviceNumber, asOf, noHorizontalOverflow: true }));
      return;
    }

    if (process.argv.includes("--ledger-report-only")) {
      const fixture = await pool.query("select s.account_number, l.occurred_at::date::text as posting_date from ledger_entries l join subscribers s on s.id = l.subscriber_id order by l.occurred_at desc, l.id desc limit 1");
      const account = fixture.rows[0]?.account_number as string | undefined;
      const postingDate = fixture.rows[0]?.posting_date as string | undefined;
      if (!account || !postingDate) throw new Error("A synthetic ledger fixture is missing from bcis_test.");
      const expected = process.argv.find((argument) => argument.startsWith("--expected-ledger-account="))?.split("=")[1];
      if (expected && expected !== account) throw new Error("Ledger report fixture changed across restart.");
      const checkLedgerReport = async (canExport: boolean) => {
        await click(client!, "Reports");
        await waitFor(client!, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Subscriber ledger detail')");
        await click(client!, "Subscriber ledger detail");
        await waitFor(client!, "document.querySelector('input[aria-label=\"Find subscriber by account or name\"]') !== null");
        await fill(client!, 'input[aria-label="Find subscriber by account or name"]', account);
        await click(client!, "Find");
        await waitFor(client!, `Boolean([...document.querySelectorAll('form select option')].find((option) => option.textContent?.includes(${JSON.stringify(account)})))`);
        await chooseSelectOption(client!, 0, account);
        await fillReportDate(client!, 0, postingDate);
        await fillReportDate(client!, 1, postingDate);
        await waitFor(client!, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Preview' && !item.disabled)");
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes(${JSON.stringify(account)}) && document.body.innerText.includes('Running balance') && document.body.innerText.includes('Posting time (UTC)')`);
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save XLSX')") === canExport, "Ledger report export control did not match the signed-in role.");
        expectDom(await client!.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Ledger report workspace has horizontal overflow.");
      };
      await checkLedgerReport(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkLedgerReport(false);
      console.info(JSON.stringify({ ledgerReportOwner: true, ledgerReportViewer: true, accountNumber: account, postingDate, noHorizontalOverflow: true }));
      return;
    }

    if (process.argv.includes("--master-report-only")) {
      const masterFixture = await pool.query("select s.account_number from subscribers s join service_accounts a on a.subscriber_id = s.id where s.status = 'ACTIVE' group by s.id having count(a.id) >= 2 order by max(a.created_at) desc limit 1");
      const account = masterFixture.rows[0]?.account_number as string | undefined;
      const inactiveFixture = await pool.query("select account_number from subscribers where status = 'INACTIVE' order by updated_at desc limit 1");
      const inactiveAccount = inactiveFixture.rows[0]?.account_number as string | undefined;
      if (!account || !inactiveAccount) throw new Error("Subscriber master smoke fixtures are missing from bcis_test.");
      const expected = process.argv.find((argument) => argument.startsWith("--expected-master-account="))?.split("=")[1];
      if (expected && expected !== account) throw new Error("Subscriber master fixture changed across restart.");
      const checkMaster = async (canExport: boolean) => {
        await click(client!, "Reports");
        await waitFor(client!, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Subscriber master list')");
        await click(client!, "Subscriber master list");
        await waitFor(client!, "document.body.innerText.includes('One row per subscriber') && document.querySelector('form select') !== null && document.querySelector('form input') !== null");
        await fill(client!, "form input", account);
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes(${JSON.stringify(account)}) && document.body.innerText.includes('One row per subscriber') && document.body.innerText.includes('Active services')`);
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save XLSX')") === canExport, "Master export control did not match the signed-in role.");
        await chooseValue(client!, "form select", "INACTIVE");
        await fill(client!, "form input", inactiveAccount);
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes(${JSON.stringify(inactiveAccount)}) && [...document.querySelectorAll('table tbody tr')].some((row) => row.textContent?.includes('INACTIVE'))`);
        expectDom(await client!.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Master report workspace has horizontal overflow.");
      };
      await checkMaster(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkMaster(false);
      console.info(JSON.stringify({ masterReportOwner: true, masterReportViewer: true, accountNumber: account, inactiveAccount, noHorizontalOverflow: true }));
      return;
    }

    if (process.argv.includes("--collection-reports-only")) {
      const paymentResult = await pool.query("select payment_number, paid_at::date::text as paid_on from payments where status = 'POSTED' order by paid_at desc, id desc limit 1");
      const payment = paymentResult.rows[0] as { payment_number: string; paid_on: string } | undefined;
      if (!payment) throw new Error("No posted synthetic test payment is available for report smoke.");
      const expected = process.argv.find((argument) => argument.startsWith("--expected-report-payment="))?.split("=")[1];
      if (expected && expected !== payment.payment_number) throw new Error("Posted report fixture changed across restart.");
      const checkReports = async (canExport: boolean) => {
        await click(client!, "Reports");
        await waitFor(client!, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Daily collection detail')");
        await click(client!, "Daily collection detail");
        await fillReportDate(client!, 0, payment.paid_on);
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes(${JSON.stringify(payment.payment_number)}) && document.body.innerText.includes('Daily Collection Detail')`);
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save XLSX')") === canExport, "Report export control did not match the signed-in role.");
        await click(client!, "Weekly collections by payment method");
        await fillReportDate(client!, 0, payment.paid_on);
        await fillReportDate(client!, 1, payment.paid_on);
        await click(client!, "Preview");
        await waitFor(client!, "document.body.innerText.includes('Weekly Collections by Payment Method') && document.body.innerText.includes('Week starting Monday') && document.body.innerText.includes('Collections:')");
        await click(client!, "Annual collections by month and payment method");
        await fill(client!, "form input[inputmode='numeric']", payment.paid_on.slice(0, 4));
        await click(client!, "Preview");
        await waitFor(client!, `document.body.innerText.includes('Annual Collections by Month and Payment Method') && document.body.innerText.includes('Month') && document.body.innerText.includes(${JSON.stringify(`${payment.paid_on.slice(0, 7)}-01`)})`);
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save PDF')") === canExport, "Annual report export control did not match the signed-in role.");
        await click(client!, "Billing versus collection by month");
        await fillReportDate(client!, 0, payment.paid_on);
        await fillReportDate(client!, 1, payment.paid_on);
        await click(client!, "Preview");
        await waitFor(client!, "document.body.innerText.includes('Billing versus Collection by Month') && document.body.innerText.includes('Period difference') && document.body.innerText.includes('not the receivable balance')");
        expectDom(await client!.evaluate("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Save XLSX')") === canExport, "Billing comparison export control did not match the signed-in role.");
        expectDom(await client!.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Report workspace has horizontal overflow.");
      };
      await checkReports(true);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkReports(false);
      console.info(JSON.stringify({ collectionReportsOwner: true, collectionReportsViewer: true, paymentNumber: payment.payment_number, noHorizontalOverflow: true }));
      return;
    }

    if (process.argv.includes("--dashboard-only")) {
      const checkDashboard = async () => {
        await click(client!, "Dashboard");
        await waitFor(client!, "document.body.innerText.includes('Billing versus collection') && document.body.innerText.includes('Payment methods') && document.body.innerText.includes('Collector performance') && document.body.innerText.includes('Overdue alerts') && document.body.innerText.includes('Recent payments')");
        expectDom(await client!.evaluate("!document.body.innerText.includes('Dashboard totals are unavailable.')"), "Dashboard showed an API error.");
        const overflow = await client!.evaluate("document.documentElement.scrollWidth > window.innerWidth");
        expectDom(overflow === false, "Dashboard has horizontal overflow.");
      };
      await checkDashboard();
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await checkDashboard();
      console.info(JSON.stringify({ dashboardOwner: true, dashboardViewer: true, noHorizontalOverflow: true }));
      return;
    }

    if (process.argv.includes("--collection-setup-only")) {
      const supervisor = await createActor("COLLECTION_SUPERVISOR");
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, supervisor.username, supervisor.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      await click(client, "Collection setup");
      await waitFor(client, "document.body.innerText.includes('Areas, routes, and collectors')");
      const code = `S${randomUUID().slice(0, 12).toUpperCase()}`;
      await fill(client, "input[placeholder='Code']", code);
      await fill(client, "input[placeholder='Name']", "Electron Supervisor Area");
      await click(client, "Create area");
      await waitFor(client, `document.body.innerText.includes(${JSON.stringify(code)}) && document.body.innerText.includes('Electron Supervisor Area')`);
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      expectDom(await client.evaluate("![...document.querySelectorAll('nav[aria-label=\"Main navigation\"] button')].some((button) => button.textContent?.trim() === 'Collection setup')"), "Viewer was shown collection setup navigation.");
      console.info(JSON.stringify({ collectionSetupSupervisor: true, viewerSetupNavigationHidden: true, code }));
      return;
    }

    const restartBatchNumber = process.argv.find((argument) => argument.startsWith("--batch-restart-check="))?.split("=")[1];
    if (restartBatchNumber) {
      await click(client, "Collection batches");
      await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(restartBatchNumber)})))`);
      await client.evaluate(`(() => { const row = [...document.querySelectorAll('table tbody tr')].find((item) => item.textContent?.includes(${JSON.stringify(restartBatchNumber)})); if (!row) throw new Error('Persisted batch missing'); row.click(); return true; })()`);
      await waitFor(client, `document.body.innerText.includes('Print route sheet') && document.body.innerText.includes('Current bill') && document.body.innerText.includes('123 Invoice Street')`);
      if (process.argv.includes("--expect-closed")) {
        await waitFor(client, "document.body.innerText.includes('CLOSED') && document.body.innerText.includes('₱5.00') && document.body.innerText.includes('Remitted cash')");
      }
      console.info(JSON.stringify({ routeSheetPersistedAfterApiRestart: true, closedBatchPersistedAfterApiRestart: process.argv.includes("--expect-closed"), batchNumber: restartBatchNumber }));
      return;
    }

    const restartAssignmentAccount = process.argv.find((argument) => argument.startsWith("--assignment-restart-check="))?.split("=")[1];
    if (restartAssignmentAccount) {
      await click(client, "Subscribers");
      await fill(client, "input[placeholder='Search account, name, contact, or address']", restartAssignmentAccount);
      await click(client, "Search");
      await openSubscriberRow(client, restartAssignmentAccount);
      await waitFor(client, "document.body.innerText.includes('Assignment history') && document.body.innerText.includes('Current:') && document.body.innerText.includes('Previous:')");
      console.info(JSON.stringify({ collectorAssignmentPersistedAfterApiRestart: true, accountNumber: restartAssignmentAccount }));
      return;
    }

    const restartReportBatch = process.argv.find((argument) => argument.startsWith("--report-restart-check="))?.split("=")[1];
    if (restartReportBatch) {
      const compactDate = restartReportBatch.slice(4, 12);
      const collectionDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
      await click(client, "Reports");
      await waitFor(client, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Collector reconciliation')");
      await click(client, "Collector reconciliation");
      await fillReportDate(client, 0, collectionDate);
      await fillReportDate(client, 1, collectionDate);
      await click(client, "Preview");
      await waitFor(client, `document.body.innerText.includes(${JSON.stringify(restartReportBatch)}) && document.body.innerText.includes('Accounts collected') && document.body.innerText.includes('Exception / remittance state') && document.body.innerText.includes('BALANCED')`);
      console.info(JSON.stringify({ collectorReportPersistedAfterApiRestart: true, batchNumber: restartReportBatch }));
      return;
    }

    if (process.argv.includes("--invoices-only") || process.argv.includes("--soa-only") || process.argv.includes("--payments-only") || process.argv.includes("--ledger-only") || process.argv.includes("--ar-only") || process.argv.includes("--batches-only") || process.argv.includes("--assignments-only")) {
      const api = "http://127.0.0.1:4110/api/v1";
      const ownerLogin = await apiFetch(`${api}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(owner) });
      if (ownerLogin.status !== 200) throw new Error("Synthetic Owner API login failed.");
      const ownerToken = ((await ownerLogin.json()) as { data: { token: string } }).data.token;
      const headers = { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" };
      const plans = await apiFetch(`${api}/plans`, { headers });
      if (plans.status !== 200) throw new Error("Synthetic test plans could not be read.");
      const planId = ((await plans.json()) as { data: Array<{ plan: { id: string } }> }).data[0]?.plan.id;
      if (!planId) throw new Error("No active synthetic plan is available.");
      const created = await apiFetch(`${api}/subscribers`, { method: "POST", headers, body: JSON.stringify({ firstName: "Invoice", lastName: "Smoke", billingDay: 1, dueDay: 10, addresses: [{ type: "SERVICE", line1: "123 Invoice Street", barangay: "Test Barangay", cityMunicipality: "Test City", province: "Bukidnon", isPrimary: true }], contacts: [{ type: "MOBILE", value: "09170000031", isPrimary: true }] }) });
      if (created.status !== 200) throw new Error(`Synthetic subscriber creation returned ${created.status}.`);
      const subscriberId = ((await created.json()) as { data: { id: string } }).data.id;
      const profile = await apiFetch(`${api}/subscribers/${subscriberId}`, { headers });
      const profileData = (await profile.json()) as { data: { subscriber: { accountNumber: string }; addresses: Array<{ id: string }> } };
      const addressId = profileData.data.addresses[0]?.id;
      if (profile.status !== 200 || !addressId) throw new Error("Synthetic subscriber address was not created.");
      const periodKey = `${9000 + randomInt(900)}-01`;
      const service = await apiFetch(`${api}/service-accounts`, { method: "POST", headers, body: JSON.stringify({ subscriberId, planId, installationAddressId: addressId, billingStartDate: `${periodKey}-01`, activationDate: `${periodKey}-01`, billingDay: 1, dueDay: 10 }) });
      if (service.status !== 200) throw new Error(`Synthetic service creation returned ${service.status}.`);
      const billed = await apiFetch(`${api}/billing/finalize`, { method: "POST", headers, body: JSON.stringify({ periodKey, commandKey: randomUUID() }) });
      if (billed.status !== 200) throw new Error(`Synthetic billing returned ${billed.status}.`);
      const invoiceList = await apiFetch(`${api}/invoices?subscriberId=${subscriberId}&pageSize=1`, { headers });
      const invoice = ((await invoiceList.json()) as { data: { items: Array<{ invoiceNumber: string; totalCentavos: string }> } }).data.items[0];
      if (invoiceList.status !== 200 || !invoice) throw new Error("Synthetic invoice was not found.");
      if (process.argv.includes("--assignments-only")) {
        const setupResponse = await apiFetch(`${api}/collection-setup`, { headers });
        if (setupResponse.status !== 200) throw new Error("Synthetic collection setup could not be read.");
        const setup = (await setupResponse.json()) as { data: { collectors: Array<{ id: string; displayName: string; isActive: boolean }>; routes: Array<{ id: string; isActive: boolean; areaId: string }>; areas: Array<{ id: string; isActive: boolean }> } };
        const collectors = setup.data.collectors.filter((item) => item.isActive);
        const route = setup.data.routes.find((item) => item.isActive && setup.data.areas.some((area) => area.id === item.areaId && area.isActive));
        if (!collectors[0] || !collectors[1] || !route) throw new Error("Two active collectors and one active route are required in the synthetic seed.");
        await click(client, "Subscribers");
        await fill(client, "input[placeholder='Search account, name, contact, or address']", profileData.data.subscriber.accountNumber);
        await click(client, "Search");
        await openSubscriberRow(client, profileData.data.subscriber.accountNumber);
        await waitFor(client, "document.body.innerText.includes('No collector assigned to this service yet.')");
        await chooseValue(client, "#assignment-collector", collectors[0].id);
        await chooseValue(client, "#assignment-route", route.id);
        await fill(client, "#assignment-date", `${periodKey}-01`);
        await click(client, "Assign collector");
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(`Current: ${collectors[0].displayName}`)}) && document.body.innerText.includes('Change assignment')`);
        await click(client, "Change assignment");
        await waitFor(client, "document.body.innerText.includes('The new assignment must start after the current assignment starts.')");
        await chooseValue(client, "#assignment-collector", collectors[1].id);
        await fill(client, "#assignment-date", `${periodKey}-02`);
        await click(client, "Change assignment");
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(`Current: ${collectors[1].displayName}`)}) && document.body.innerText.includes(${JSON.stringify(`Previous: ${collectors[0].displayName}`)})`);
        console.info(JSON.stringify({ collectorAssignmentDesktop: true, sameDateRejected: true, accountNumber: profileData.data.subscriber.accountNumber }));
        return;
      }
      if (process.argv.includes("--batches-only")) {
        const serviceId = ((await service.json()) as { data: { id: string } }).data.id;
        const setup = await apiFetch(`${api}/collection-setup`, { headers });
        const { collectors: collectorRows, routes } = ((await setup.json()) as { data: { collectors: Array<{ id: string }>; routes: Array<{ id: string }> } }).data;
        if (setup.status !== 200 || !collectorRows[0] || !routes[0]) throw new Error("Synthetic collection setup is incomplete.");
        const assigned = await apiFetch(`${api}/collector-assignments`, { method: "POST", headers, body: JSON.stringify({ collectorId: collectorRows[0].id, routeId: routes[0].id, serviceAccountId: serviceId, effectiveFrom: `${periodKey}-01` }) });
        if (assigned.status !== 200) throw new Error(`Synthetic assignment returned ${assigned.status}.`);
        const [billingYear, billingMonth] = periodKey.split("-").map(Number);
        const collectionDate = new Date(Date.UTC(billingYear!, billingMonth!, 20)).toISOString().slice(0, 10);
        const createdBatch = await apiFetch(`${api}/collection-batches`, { method: "POST", headers, body: JSON.stringify({ collectorId: collectorRows[0].id, routeId: routes[0].id, collectionDate }) });
        if (createdBatch.status !== 200) throw new Error(`Synthetic batch returned ${createdBatch.status}.`);
        const batchNumber = ((await createdBatch.json()) as { data: { batchNumber: string } }).data.batchNumber;
        await click(client, "Collection batches");
        await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(batchNumber)})))`);
        await client.evaluate(`(() => { const row = [...document.querySelectorAll('table tbody tr')].find((item) => item.textContent?.includes(${JSON.stringify(batchNumber)})); if (!row) throw new Error('Batch row missing'); row.click(); return true; })()`);
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(batchNumber)}) && document.body.innerText.includes('Uncollected') && document.body.innerText.includes('Current bill') && document.body.innerText.includes('Arrears') && document.body.innerText.includes('123 Invoice Street') && document.body.innerText.includes('Print route sheet')`);
        await waitFor(client, "document.body.innerText.includes('OPEN')");
        await click(client, "Start batch");
        await waitFor(client, "document.body.innerText.includes('IN PROGRESS') && document.body.innerText.includes('Post collection')");
        await fill(client, "input[placeholder='Amount in PHP']", "5.00");
        await click(client, "Post collection");
        await waitFor(client, "document.body.innerText.includes('₱5.00') && !document.body.innerText.includes('The request could not be completed')");
        await click(client, "Submit batch");
        await waitFor(client, "document.body.innerText.includes('SUBMITTED') && document.body.innerText.includes('Save remittance')");
        await click(client, "Save remittance");
        await waitFor(client, "document.body.innerText.includes('REMITTED') && document.body.innerText.includes('Reconcile balanced batch')");
        await click(client, "Reconcile balanced batch");
        await waitFor(client, "document.body.innerText.includes('RECONCILED') && document.body.innerText.includes('Close batch')");
        await click(client, "Close batch");
        await waitFor(client, "document.querySelector('[role=dialog]')?.textContent?.includes('Close reconciled batch?')");
        await client.evaluate("(() => { const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === 'Close batch'); if (!button) throw new Error('Batch confirmation missing'); button.click(); return true; })()");
        await waitFor(client, "document.body.innerText.includes('CLOSED') && !document.querySelector('[role=dialog]')");
        await click(client, "Reports");
        await waitFor(client, "[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Collector reconciliation')");
        await click(client, "Collector reconciliation");
        await fillReportDate(client, 0, collectionDate);
        await fillReportDate(client, 1, collectionDate);
        await click(client, "Preview");
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(batchNumber)}) && document.body.innerText.includes('Accounts collected') && document.body.innerText.includes('Exception / remittance state') && document.body.innerText.includes('BALANCED') && document.body.innerText.includes('Save PDF') && document.body.innerText.includes('Save XLSX')`);
        console.info(JSON.stringify({ collectionRouteSheetOwner: true, batchLifecycleOwner: true, collectorReportOwner: true, batchNumber }));
        return;
      }
      if (process.argv.includes("--payments-only")) {
        const postedPayment = await apiFetch(`${api}/payments`, { method: "POST", headers, body: JSON.stringify({ subscriberId, amountCentavos: invoice.totalCentavos, method: "CASH", commandKey: randomUUID() }) });
        if (postedPayment.status !== 200) throw new Error(`Synthetic Cash posting returned ${postedPayment.status}.`);
        const payment = ((await postedPayment.json()) as { data: { payment: { paymentNumber: string }; receipt: { receiptNumber: string } } }).data;
        await click(client, "Payment history");
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(payment.payment.paymentNumber)})`);
        await clickAria(client, `View payment ${payment.payment.paymentNumber}`);
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(payment.receipt.receiptNumber)}) && document.body.innerText.includes('Print receipt')`);
        await click(client, "Back to history");
        await clickAria(client, `Reverse payment ${payment.payment.paymentNumber}`);
        await fill(client, "input[aria-label='Reversal reason']", "Gate 3 synthetic payment reversal");
        await click(client, "Review reversal");
        await waitFor(client, "document.body.innerText.includes('Confirm payment reversal?')");
        await click(client, "Reverse payment");
        await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(payment.payment.paymentNumber)}) && row.textContent?.includes('REVERSED') && row.textContent?.includes('Voided')))`);
        await clickAria(client, `View payment ${payment.payment.paymentNumber}`);
        await waitFor(client, "document.body.innerText.includes('VOIDED') && document.body.innerText.includes('Print voided copy')");
        await click(client, "Back to history");
        await click(client, "Sign out");
        await waitFor(client, "document.querySelector('#username') !== null");
        await signIn(client, viewer.username, viewer.password);
        await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
        await click(client, "Payment history");
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(payment.payment.paymentNumber)})`);
        expectDom(await client.evaluate(`!Boolean(document.querySelector('button[aria-label=${JSON.stringify(`Reverse payment ${payment.payment.paymentNumber}`)}]'))`), "Viewer was shown a reversal action.");
        await clickAria(client, `View payment ${payment.payment.paymentNumber}`);
        await waitFor(client, "document.body.innerText.includes('VOIDED')");
        expectDom(await client.evaluate("!document.body.innerText.includes('Print voided copy')"), "Viewer was shown a receipt print action.");
        console.info(JSON.stringify({ paymentHistoryReceiptReversal: true, viewerReadOnly: true, paymentNumber: payment.payment.paymentNumber }));
        return;
      }
      await click(client, "Sign out");
      await waitFor(client, "document.querySelector('#username') !== null");
      await signIn(client, viewer.username, viewer.password);
      await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
      if (process.argv.includes("--ar-only")) {
        await click(client, "Receivables");
        await waitFor(client, "document.body.innerText.includes('Receivables and AR aging')");
        await fill(client, "input[aria-label='Receivables as of']", "9999-12-31");
        await fill(client, "input[aria-label='Search receivables']", profileData.data.subscriber.accountNumber);
        await chooseSelectOption(client, 0, "91+ days");
        await waitFor(client, "Boolean([...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Apply filters' && !button.disabled))");
        await click(client, "Apply filters");
        try { await waitFor(client, `document.body.innerText.includes(${JSON.stringify(invoice.invoiceNumber)}) && document.body.innerText.includes(${JSON.stringify(profileData.data.subscriber.accountNumber)}) && document.body.innerText.includes('91+ days')`); }
        catch (error) { throw new Error(`AR screen: ${JSON.stringify(await client.evaluate("({ text: document.body.innerText.slice(0, 2300), asOf: document.querySelector('input[aria-label=\"Receivables as of\"]')?.value, search: document.querySelector('input[aria-label=\"Search receivables\"]')?.value, bucket: document.querySelector('select[aria-label=\"Age bucket\"]')?.value })"))}`, { cause: error }); }
        await click(client, "Overdue accounts");
        await waitFor(client, `document.body.innerText.includes('Months unpaid') && document.body.innerText.includes(${JSON.stringify(invoice.invoiceNumber)}) && document.body.innerText.includes(${JSON.stringify(profileData.data.subscriber.accountNumber)})`);
        expectDom(await client.evaluate("Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes('Invoice Smoke') && row.textContent?.includes('1 invoice(s)')))"), "Grouped overdue follow-up row is missing.");
        expectDom(await client.evaluate("![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Request suspension')"), "Viewer was shown a suspension request action.");
        console.info(JSON.stringify({ receivableFiltersViewer: true, groupedOverdueViewer: true, accountNumber: profileData.data.subscriber.accountNumber }));
        return;
      }
      if (process.argv.includes("--soa-only") || process.argv.includes("--ledger-only")) {
        await click(client, "Subscribers");
        await waitFor(client, "document.body.innerText.includes('Server-side account, name, contact, and address search')");
        await fill(client, "input[placeholder='Search account, name, contact, or address']", profileData.data.subscriber.accountNumber);
        await click(client, "Search");
        await waitFor(client, `document.body.innerText.includes(${JSON.stringify(profileData.data.subscriber.accountNumber)})`);
        await openSubscriberRow(client, profileData.data.subscriber.accountNumber);
        await waitFor(client, "document.body.innerText.includes('Statement of Account') && document.body.innerText.includes('Preview statement')");
        if (process.argv.includes("--ledger-only")) {
          await waitFor(client, `document.body.innerText.includes('Subscriber ledger') && document.body.innerText.includes(${JSON.stringify(invoice.invoiceNumber)}) && document.body.innerText.includes('Running balance')`);
          const today = (await pool.query("select current_date::text as value")).rows[0]?.value as string;
          await fill(client, "input[aria-label='Ledger from date']", today);
          await fill(client, "input[aria-label='Ledger to date']", today);
          await click(client, "Apply dates");
          await waitFor(client, `document.body.innerText.includes(${JSON.stringify(invoice.invoiceNumber)}) && document.body.innerText.includes('Balance before this page')`);
          console.info(JSON.stringify({ subscriberLedgerViewer: true, accountNumber: profileData.data.subscriber.accountNumber }));
          return;
        }
        await click(client, "Preview statement");
        await waitFor(client, "document.querySelector('.print-report')?.innerText.includes('Closing balance')");
        expectDom(await client.evaluate("Boolean([...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Print'))"), "The statement print action is missing.");
        expectDom(await client.evaluate("![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Save PDF')"), "Viewer was shown an unauthorized SOA export.");
        console.info(JSON.stringify({ subscriberStatementViewer: true, accountNumber: profileData.data.subscriber.accountNumber }));
        return;
      }
      await click(client, "Invoices");
      await waitFor(client, "document.body.innerText.includes('Finalized monthly charges')");
      await fill(client, "input[aria-label='Search invoice number']", invoice.invoiceNumber);
      await click(client, "Search");
      await waitFor(client, `document.body.innerText.includes(${JSON.stringify(invoice.invoiceNumber)}) && document.body.innerText.includes(${JSON.stringify(profileData.data.subscriber.accountNumber)})`);
      await clickAria(client, `View invoice ${invoice.invoiceNumber}`);
      await waitFor(client, `document.body.innerText.includes('Invoice detail') && document.body.innerText.includes('Outstanding') && document.body.innerText.includes(${JSON.stringify(invoice.invoiceNumber)})`);
      const total = BigInt(invoice.totalCentavos);
      const formattedTotal = `₱${(total / 100n).toLocaleString("en-PH")}.${(total % 100n).toString().padStart(2, "0")}`;
      expectDom(await client.evaluate(`document.body.innerText.includes(${JSON.stringify(formattedTotal)})`), "Invoice total was not visible in the detail panel.");
      await click(client, "Back to invoices");
      await waitFor(client, "document.body.innerText.includes('Finalized monthly charges')");
      console.info(JSON.stringify({ invoiceSearchDetailViewer: true, invoiceNumber: invoice.invoiceNumber }));
      return;
    }

    if (process.argv.includes("--addresses-only")) {
      await click(client, "Subscribers");
      await waitFor(client, "document.body.innerText.includes('New subscriber')");
      await click(client, "New subscriber");
      for (const [index, value] of ["Address", "", "Smoke", "09170000021", "1", "10", "123 Test Street", "Test Barangay", "Test City", "Bukidnon", ""].entries()) await fillFormInput(client, index, value);
      await click(client, "Create subscriber");
      await waitFor(client, "document.body.innerText.includes('Add address')");
      await click(client, "Add address");
      await waitFor(client, "document.body.innerText.includes('Add subscriber address')");
      for (const [index, value] of ["456 Second Street", "", "Second Barangay", "Test City", "Bukidnon", ""].entries()) await fillFormInput(client, index, value);
      await click(client, "Save address");
      await waitFor(client, "document.body.innerText.includes('456 Second Street')");
      await clickAria(client, "Edit address 456 Second Street");
      await waitFor(client, "document.body.innerText.includes('Edit subscriber address')");
      await fillFormInput(client, 0, "789 Third Street");
      await client.evaluate("(() => { const checkbox = document.querySelector('form input[type=checkbox]'); if (!(checkbox instanceof HTMLInputElement)) throw new Error('Primary checkbox missing'); checkbox.click(); return true; })()");
      await click(client, "Save address changes");
      try { await waitFor(client, "Boolean(document.querySelector('button[aria-label=\"Deactivate address 789 Third Street\"]')?.parentElement?.parentElement?.innerText.includes('Primary'))"); }
      catch (error) { throw new Error(`Address edit screen: ${JSON.stringify(await client.evaluate("document.body.innerText.slice(-1200)"))}`, { cause: error }); }
      await clickAria(client, "Deactivate address 789 Third Street");
      await waitFor(client, "document.body.innerText.includes('Deactivate address?')");
      await click(client, "Deactivate address");
      await waitFor(client, "Boolean(document.querySelector('button[aria-label=\"Deactivate address 123 Test Street\"]')?.parentElement?.parentElement?.innerText.includes('Primary'))");
      console.info(JSON.stringify({ addressAddReplaceDeactivatePrimaryFallback: true }));
      return;
    }

    if (process.argv.includes("--plans-only")) {
    const planCode = `G3-${randomUUID().slice(0, 8).toUpperCase()}`;
    await click(client, "Service plans");
    await waitFor(client, "document.body.innerText.includes('Internet, Cable, and Combo rates used for future billing')");
    await click(client, "New plan");
    await chooseSelectOption(client, 0, "Internet");
    await fillFormInput(client, 0, planCode);
    await fillFormInput(client, 1, "Gate 3 synthetic plan");
    await fillFormInput(client, 2, "1450.00");
    await fillFormInput(client, 3, "50");
    await click(client, "Create plan");
    await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(planCode)})))`);
    await clickAria(client, `Edit ${planCode}`);
    await waitFor(client, "document.body.innerText.includes('Edit plan') && document.body.innerText.includes('Save plan')");
    await fillFormInput(client, 0, "Gate 3 edited plan");
    await fillFormInput(client, 1, "Synthetic future-rate test");
    await fillFormInput(client, 2, "1650.25");
    await fillFormInput(client, 3, "100.00");
    await fillFormInput(client, 4, "50.00");
    await click(client, "Save plan");
    await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(planCode)}) && row.textContent?.includes('Gate 3 edited plan') && row.textContent?.includes('1,650.25')))`);
    await clickAria(client, `Deactivate ${planCode}`);
    await waitFor(client, "document.body.innerText.includes('Deactivate plan?')");
    await click(client, "Deactivate plan");
    await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(planCode)}) && row.textContent?.includes('Inactive')))`);
    await clickAria(client, `Activate ${planCode}`);
    await waitFor(client, "document.body.innerText.includes('Activate plan?')");
    await click(client, "Activate plan");
    await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(planCode)}) && row.textContent?.includes('Active')))`);
    console.info(JSON.stringify({ planCreateEditDeactivateActivate: true }));
    return;
    }

    await click(client, "Subscribers");
    await waitFor(client, "document.body.innerText.includes('New subscriber')");
    await click(client, "New subscriber");
    await waitFor(client, "document.body.innerText.includes('Account number is generated')");
    for (const [index, value] of ["Original", "", "Identity", "09170000001", "1", "10", "123 Test Street", "Test Barangay", "Test City", "Bukidnon", ""].entries()) await fillFormInput(client, index, value);
    await click(client, "Create subscriber");
    await waitFor(client, "document.body.innerText.includes('Edit identity')");
    const accountNumber = await client.evaluate("document.querySelector('section.rounded-xl h2')?.previousElementSibling?.textContent?.trim()") as string;
    if (!accountNumber?.startsWith("SUB-")) throw new Error("The new synthetic subscriber account number was not visible.");
    await click(client, "Edit identity");
    await waitFor(client, "document.body.innerText.includes('Save identity')");
    for (const [index, value] of ["Edited", "Middle", "Subscriber", "Jr"].entries()) await fillFormInput(client, index, value);
    await click(client, "Save identity");
    try { await waitFor(client, "document.body.innerText.includes('Edited Subscriber')"); }
    catch (error) {
      const state = await client.evaluate("({ heading: document.querySelector('section h2')?.textContent, formText: document.querySelector('form')?.innerText?.slice(-500) })");
      throw new Error(`Identity edit did not appear: ${JSON.stringify(state)}`, { cause: error });
    }
    await click(client, "Back");
    await waitFor(client, "document.body.innerText.includes('Server-side account, name, contact, and address search')");
    await fill(client, "input[placeholder='Search account, name, contact, or address']", "Edited Middle Subscriber");
    await click(client, "Search");
    await waitFor(client, "document.body.innerText.includes('Edited Subscriber')");
    await openSubscriberRow(client, accountNumber);
    await waitFor(client, "document.body.innerText.includes('Add contact')");
    await click(client, "Add contact");
    await waitFor(client, "document.body.innerText.includes('Add subscriber contact')");
    await fillFormInput(client, 0, "09170000003");
    await click(client, "Save contact");
    await waitFor(client, "document.body.innerText.includes('09170000003')");
    if (process.argv.includes("--contacts-only")) {
      await clickAria(client, "Edit contact 09170000003");
      await waitFor(client, "document.body.innerText.includes('Edit subscriber contact')");
      await fillFormInput(client, 0, "09170000005");
      await click(client, "Save contact changes");
      await waitFor(client, "document.body.innerText.includes('09170000005')");
      await clickAria(client, "Deactivate contact 09170000001");
      await waitFor(client, "document.body.innerText.includes('Deactivate contact?')");
      await click(client, "Deactivate contact");
      await waitFor(client, "document.body.innerText.includes('09170000005 (primary)')");
      console.info(JSON.stringify({ contactAddReplaceDeactivatePrimaryFallback: true }));
      return;
    }
    await click(client, "Back");
    await waitFor(client, "document.body.innerText.includes('Server-side account, name, contact, and address search')");
    await fill(client, "input[placeholder='Search account, name, contact, or address']", "09170000003");
    await click(client, "Search");
    await waitFor(client, "document.body.innerText.includes('Edited Subscriber')");
    await openSubscriberRow(client, accountNumber);
    await waitFor(client, "document.body.innerText.includes('Add address')");
    await click(client, "Add address");
    await waitFor(client, "document.body.innerText.includes('Add subscriber address')");
    for (const [index, value] of ["456 Second Street", "", "Second Barangay", "Test City", "Bukidnon", ""].entries()) await fillFormInput(client, index, value);
    await click(client, "Save address");
    await waitFor(client, "document.body.innerText.includes('456 Second Street')");
    await click(client, "Back");
    await waitFor(client, "document.body.innerText.includes('Server-side account, name, contact, and address search')");
    await fill(client, "input[placeholder='Search account, name, contact, or address']", "456 Second Street");
    await click(client, "Search");
    await waitFor(client, "document.body.innerText.includes('Edited Subscriber')");
    await openSubscriberRow(client, accountNumber);
    await click(client, "Add service");
    await waitFor(client, "document.body.innerText.includes('New service account')");
    await click(client, "Create service");
    await waitFor(client, "document.body.innerText.includes('Service account details') && document.body.innerText.includes('Edit service details')");
    await click(client, "Edit service details");
    await waitFor(client, "document.body.innerText.includes('Save service details')");
    await chooseSelectOption(client, 1, "456 Second Street");
    await fillFormInput(client, 0, "Correct installation address");
    await click(client, "Save service details");
    await waitFor(client, "document.body.innerText.includes('Service address: 456 Second Street')");
    await click(client, "Edit service details");
    await waitFor(client, "document.body.innerText.includes('Save service details')");
    const newPlanName = await chooseDifferentPlan(client);
    await fillFormInput(client, 0, "Customer selected another plan");
    await click(client, "Save service details");
    await waitFor(client, `!document.body.innerText.includes('Save service details') && document.body.innerText.includes(${JSON.stringify(newPlanName)})`);
    const ownerLogin = await apiFetch("http://127.0.0.1:4110/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(owner) });
    if (ownerLogin.status !== 200) throw new Error("Synthetic Owner API login failed.");
    const ownerToken = ((await ownerLogin.json()) as { data: { token: string } }).data.token;
    const foundSubscriber = await apiFetch(`http://127.0.0.1:4110/api/v1/subscribers?search=${encodeURIComponent(accountNumber)}`, { headers: { authorization: `Bearer ${ownerToken}` } });
    if (foundSubscriber.status !== 200) throw new Error("Synthetic subscriber lookup failed.");
    const subscriberId = ((await foundSubscriber.json()) as { data: { items: Array<{ id: string }> } }).data.items[0]?.id;
    if (!subscriberId) throw new Error("Synthetic subscriber was not found.");
    const serviceProfile = await apiFetch(`http://127.0.0.1:4110/api/v1/subscribers/${subscriberId}`, { headers: { authorization: `Bearer ${ownerToken}` } });
    if (serviceProfile.status !== 200) throw new Error("Synthetic service profile could not be read.");
    const activeService = ((await serviceProfile.json()) as { data: { services: Array<{ account: { id: string; planId: string; installationAddressId: string; version: number } }> } }).data.services[0]?.account;
    if (!activeService) throw new Error("Synthetic service account was not created.");
    const termination = await apiFetch(`http://127.0.0.1:4110/api/v1/service-accounts/${activeService.id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ planId: activeService.planId, installationAddressId: activeService.installationAddressId, status: "TERMINATED", reason: "Synthetic smoke-test closure", version: activeService.version }) });
    if (termination.status !== 204) throw new Error("Synthetic service closure failed.");
    await click(client, "Back");
    await waitFor(client, "document.body.innerText.includes('Server-side account, name, contact, and address search')");
    await fill(client, "input[placeholder='Search account, name, contact, or address']", accountNumber);
    await click(client, "Search");
    await waitFor(client, "document.body.innerText.includes('Edited Subscriber')");
    await openSubscriberRow(client, accountNumber);
    await waitFor(client, "document.body.innerText.includes('TERMINATED')");
    await waitFor(client, "document.body.innerText.includes('Deactivate')");
    await click(client, "Deactivate");
    await waitFor(client, "document.body.innerText.includes('Deactivate subscriber?')");
    await click(client, "Deactivate subscriber");
    await waitFor(client, "document.body.innerText.includes('INACTIVE')");
    await click(client, "Dashboard");
    await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");

    await client.evaluate("(() => { const original = window.fetch.bind(window); window.__bcisRestoreFetch = () => { window.fetch = original; }; window.fetch = (input, init) => { const url = typeof input === 'string' ? input : input.url; if (url.endsWith('/api/v1/auth/lock')) return Promise.reject(new TypeError('Simulated API outage')); return original(input, init); }; return true; })()");
    await click(client, "Lock");
    await waitFor(client, "document.body.innerText.includes('Session locked')");
    expectDom(await client.evaluate("!document.body.innerText.includes('User accounts')"), "Private Owner navigation remained visible after an offline lock.");
    await client.evaluate("window.__bcisRestoreFetch(); true");
    await fill(client, "#unlock-password", owner.password);
    await click(client, "Unlock");
    await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");

    await click(client, "Lock");
    await waitFor(client, "document.body.innerText.includes('Session locked')");
    await fill(client, "#unlock-password", owner.password);
    await click(client, "Unlock");
    await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
    await click(client, "Sign out");
    await waitFor(client, "document.querySelector('#username') !== null");
    await signIn(client, viewer.username, viewer.password);
    await waitFor(client, "document.body.innerText.includes('Authenticated BCIS workspace')");
    expectDom(await client.evaluate("![...document.querySelectorAll('nav[aria-label=\"Main navigation\"] button')].some((button) => button.textContent?.trim() === 'User accounts')"), "Viewer saw Owner-only navigation.");
    const login = await apiFetch("http://127.0.0.1:4110/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(viewer) });
    if (login.status !== 200) throw new Error("Viewer API login failed.");
    const token = ((await login.json()) as { data: { token: string } }).data.token;
    const denied = await apiFetch("http://127.0.0.1:4110/api/v1/users", { headers: { authorization: `Bearer ${token}` } });
    if (denied.status !== 403) throw new Error(`Viewer API access check returned ${denied.status}, expected 403.`);
    await client.evaluate("location.reload(); true");
    await waitFor(client, "document.querySelector('#username') !== null");
    console.info(JSON.stringify({ subscriberServiceCreateEditPlanAddressDeactivate: true, offlineLockHidesPrivateView: true, serverLockUnlock: true, roleNavigation: true, viewerUsersApi: 403, reloadClearsSession: true }));
  } finally {
    client?.close();
    for (const actorId of actors) {
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

function expectDom(result: unknown, message: string) { if (result !== true) throw new Error(message); }

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt === 2) return response;
    const retryAfter = Number(response.headers.get("retry-after") ?? "60");
    await new Promise((resolve) => setTimeout(resolve, (Math.max(1, Math.min(retryAfter, 60)) + 1) * 1000));
  }
  throw new Error("Rate-limit retry did not return a response.");
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

async function chooseValue(client: CdpClient, selector: string, value: string) {
  await client.evaluate(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); if (!(select instanceof HTMLSelectElement)) throw new Error('Select missing: ${selector}'); if (![...select.options].some((option) => option.value === ${JSON.stringify(value)})) throw new Error('Option missing: ${selector}'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
}

async function fillReportDate(client: CdpClient, index: number, value: string) {
  await client.evaluate(`(() => { const input = document.querySelectorAll('form input[type="date"]')[${index}]; if (!(input instanceof HTMLInputElement)) throw new Error('Report date missing'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
}

async function fillFormInput(client: CdpClient, index: number, value: string) {
  await client.evaluate(`(() => { const input = document.querySelectorAll('form input')[${index}]; if (!(input instanceof HTMLInputElement)) throw new Error('Form input missing: ${index}'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
}

async function chooseSelectOption(client: CdpClient, index: number, optionText: string) {
  await client.evaluate(`(() => { const select = document.querySelectorAll('form select')[${index}]; if (!(select instanceof HTMLSelectElement)) throw new Error('Service select missing'); const option = [...select.options].find((item) => item.textContent?.includes(${JSON.stringify(optionText)})); if (!option) throw new Error('Service option missing'); select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
}

async function chooseDifferentPlan(client: CdpClient): Promise<string> {
  const name = await client.evaluate("(() => { const select = document.querySelector('form select'); if (!(select instanceof HTMLSelectElement)) throw new Error('Plan select missing'); const option = [...select.options].find((item) => item.value !== select.value && !item.textContent?.includes('(inactive')); if (!option) throw new Error('Alternate active plan missing'); select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return option.textContent?.split(' · ')[0] ?? ''; })()") as string;
  if (!name) throw new Error("Alternate active plan name missing.");
  return name;
}

async function openSubscriberRow(client: CdpClient, accountNumber: string) {
  await waitFor(client, `Boolean([...document.querySelectorAll('table tbody tr')].find((row) => row.textContent?.includes(${JSON.stringify(accountNumber)})))`);
  await client.evaluate(`(() => { const row = [...document.querySelectorAll('table tbody tr')].find((item) => item.textContent?.includes(${JSON.stringify(accountNumber)})); if (!row) throw new Error('Subscriber row missing'); row.click(); return true; })()`);
  await waitFor(client, `document.querySelector('section.rounded-xl h2')?.previousElementSibling?.textContent?.trim() === ${JSON.stringify(accountNumber)}`);
}

async function click(client: CdpClient, label: string) {
  await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing: ${label}'); button.click(); return true; })()`);
}

async function clickAria(client: CdpClient, label: string) {
  await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing: ${label}'); button.click(); return true; })()`);
}

async function signIn(client: CdpClient, username: string, password: string) {
  await fill(client, "#username", username);
  await fill(client, "#password", password);
  await click(client, "Sign in");
}

await main();
