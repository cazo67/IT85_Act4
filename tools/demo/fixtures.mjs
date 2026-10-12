// Builds the synthetic demo state through the real API (no direct SQL writes). Idempotent via manifests/fixtures.json.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { call, login, loadSecrets, runDir, pace } from "./lib/common.mjs";
pace.ms = 700;

const manifestPath = join(runDir, "manifests", "fixtures.json");
if (existsSync(manifestPath)) { console.log("fixtures already built:", manifestPath); process.exit(0); }
const log = (m) => console.log(`[fixtures] ${m}`);
const s = loadSecrets();
const sess = {};
for (const [k, u] of [["admin", "demo.administrator"], ["cashier", "demo.cashier"], ["supervisor", "demo.supervisor"], ["auditor", "demo.accounting"]]) sess[k] = (await login(u, s.users[u].password)).token;

const setup = await call("GET", "/collection-setup", { token: sess.supervisor });
const area1 = setup.areas.find((a) => a.code === "AREA-1"), route1 = setup.routes.find((r) => r.code === "ROUTE-1"), col1 = setup.collectors.find((c) => c.code === "COL-1");
const plans = await call("GET", "/plans", { token: sess.admin });
const plan = (code) => plans.find((x) => x.plan.code === code).plan;
const M = { keys: {} };

async function createSubscriber(first, last, line1, dueDay, startDate, mobile, desk, routeAssigned) {
  const created = await call("POST", "/subscribers", { token: sess.admin, body: { firstName: first, lastName: last, billingDay: 1, dueDay, collectionAreaId: area1.id, assignedCollectorId: col1.id, notes: "Synthetic demonstration subscriber",
    addresses: [{ type: "SERVICE", line1, barangay: "Barangay 1", cityMunicipality: "Demonstration City", province: "Bukidnon", postalCode: "8700", isPrimary: true }],
    contacts: [{ type: "MOBILE", value: mobile, isPrimary: true }, { type: "OTHER", value: desk, isPrimary: false }] } });
  const id = created.id ?? created.subscriber?.id;
  const profile = await call("GET", `/subscribers/${id}`, { token: sess.admin });
  const address = profile.addresses[0];
  const service = await call("POST", "/service-accounts", { token: sess.admin, body: { subscriberId: id, planId: plan("NET-50").id, installationAddressId: address.id, billingStartDate: startDate, activationDate: startDate, billingDay: 1, dueDay, assignedCollectorId: col1.id } });
  const serviceId = service.id ?? service.account?.id;
  await call("POST", "/collector-assignments", { token: sess.admin, body: { collectorId: col1.id, ...(routeAssigned ? { routeId: route1.id } : {}), serviceAccountId: serviceId, effectiveFrom: startDate } });
  const full = await call("GET", `/subscribers/${id}`, { token: sess.admin });
  return { subscriberId: id, serviceId, accountNumber: full.subscriber.accountNumber, serviceNumber: full.services?.[0]?.account?.serviceAccountNumber };
}
M.mara = await createSubscriber("Mara", "Demo", "1 Demo Main Street", 10, "2026-09-01", "09171230001", "Demo desk A", false); log(`Mara ${M.mara.accountNumber}`);
M.nilo = await createSubscriber("Nilo", "Demo", "2 Demo Route Street", 10, "2026-07-01", "09171230002", "Demo desk N", true); log(`Nilo ${M.nilo.accountNumber}`);

for (const p of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]) { const r = await call("POST", "/billing/finalize", { token: sess.admin, body: { periodKey: p, commandKey: randomUUID() } }); log(`billed ${p}: ${r.invoiceCount} invoices, total centavos ${r.totalCentavos}`); }

const subs = [];
for (let page = 1; page <= 6; page++) { const r = await call("GET", `/subscribers?page=${page}&pageSize=100`, { token: sess.admin }); subs.push(...r.items); if (r.items.length < 100) break; }
const demoSubs = subs.filter((x) => /^SUB-DEMO-\d{4}$/.test(x.accountNumber));
log(`seeded subscribers found: ${demoSubs.length}`);
const owed = async (subscriberId) => {
  const perMonth = {};
  for (let page = 1; page <= 5; page++) {
    const r = await call("GET", `/invoices?subscriberId=${subscriberId}&page=${page}&pageSize=100`, { token: sess.admin });
    for (const i of r.items) { const inv = i.invoice ?? i; const k = inv.periodKey ?? inv.billingPeriodKey ?? String(inv.invoiceDate).slice(0, 7); perMonth[k] = (perMonth[k] ?? 0n) + BigInt(inv.totalCentavos); }
    if (r.items.length < 100) break;
  }
  return perMonth;
};

function pngBytes() {
  const w = 32, h = 32, raw = Buffer.alloc((w * 3 + 1) * h, 0xe8);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const png64 = pngBytes().toString("base64");
const pay = (subscriberId, amount) => call("POST", "/payments", { token: sess.cashier, body: { subscriberId, amountCentavos: String(amount), method: "CASH", commandKey: randomUUID() } });
const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const sum = (o, ms) => ms.reduce((t, m) => t + (o[m] ?? 0n), 0n);
const stats = { unpaid: 0, partial: 0, advance: 0, gcash: 0, exact: 0 };
M.payments = [];
for (const sub of demoSubs) {
  const idx = Number(sub.accountNumber.slice(-4)); const o = await owed(sub.id); const all = sum(o, months);
  let amount = all, tag = "exact", method = "CASH";
  if (idx % 6 === 1) { stats.unpaid++; continue; }
  else if (idx % 5 === 2) { amount = sum(o, months.slice(0, 4)); tag = "partial"; }
  else if (idx % 5 === 3) { amount = sum(o, months.slice(0, 2)); tag = "partial"; }
  else if (idx % 7 === 0) { amount = all - (o["2026-09"] ?? 0n) / 2n; tag = "partial"; }
  else if (idx % 11 === 5) { amount = all + 50000n; tag = "advance"; }
  else if (idx === 4 || idx === 10) { tag = "gcash"; method = "GCASH"; }
  if (amount <= 0n) continue;
  if (method === "GCASH") {
    const ref = `FIXG${String(idx).padStart(3, "0")}${Date.now().toString(36).toUpperCase()}`;
    const proof = await call("POST", "/gcash/proofs", { token: sess.cashier, body: { subscriberId: sub.id, amountCentavos: String(amount), senderName: "Demo Sender", senderMobile: "09170000000", externalReference: ref, originalFileName: "fixture-proof.png", imageBase64: png64 } });
    await call("POST", `/gcash/proofs/${proof.id ?? proof.proof?.id}/verify`, { token: sess.auditor, body: { receiverHistoryConfirmed: true } });
    stats.gcash++; M.payments.push({ idx, tag, amount: String(amount), ref });
  } else { const p = await pay(sub.id, amount); stats[tag]++; M.payments.push({ idx, tag, amount: String(amount), paymentId: p.payment?.id ?? p.id }); }
}
log(`payments: ${JSON.stringify(stats)}`);

const rev = M.payments.find((p) => p.idx === 40 && p.paymentId) ?? M.payments.find((p) => p.tag === "exact" && p.paymentId);
if (rev) { await call("POST", `/payments/${rev.paymentId}/reverse`, { token: sess.auditor, body: { reason: "Synthetic fixture: payment posted to the wrong account." } }); M.reversedFixture = rev; log(`reversed fixture payment idx ${rev.idx}`); }

const today = new Date().toISOString().slice(0, 10);
const batch = await call("POST", "/collection-batches", { token: sess.supervisor, body: { collectorId: col1.id, routeId: route1.id, collectionDate: today } });
const bid = batch.id ?? batch.batch?.id;
let det = await call("GET", `/collection-batches/${bid}`, { token: sess.supervisor });
await call("POST", `/collection-batches/${bid}/start`, { token: sess.supervisor, body: { version: det.batch.version } });
det = await call("GET", `/collection-batches/${bid}`, { token: sess.supervisor });
let target = 1950000n; const taken = [];
for (const a of det.accounts) {
  if (target <= 0n) break; if (a.subscriberId === M.nilo.subscriberId) continue;
  const room = BigInt(a.expectedCentavos) - BigInt(a.collectedCentavos); if (room <= 0n) continue;
  const amt = [room, target, 300000n].reduce((x, y) => (y < x ? y : x));
  await call("POST", `/collection-batches/${bid}/collections`, { token: sess.supervisor, body: { batchAccountId: a.id, amountCentavos: String(amt), commandKey: randomUUID() } });
  target -= amt; taken.push({ account: a.accountNumberSnapshot, amount: String(amt) });
}
det = await call("GET", `/collection-batches/${bid}`, { token: sess.supervisor });
M.batch = { id: bid, number: det.batch.batchNumber, status: det.batch.status, collectedCashCentavos: det.batch.collectedCashCentavos, expectedCashCentavos: det.batch.expectedCashCentavos, priorCollections: taken, niloBatchAccount: det.accounts.find((a) => a.subscriberId === M.nilo.subscriberId)?.id, remainingTarget: String(target) };
log(`batch ${M.batch.number} ${M.batch.status} collected ${M.batch.collectedCashCentavos} remaining target ${target}`);
writeFileSync(manifestPath, JSON.stringify(M, null, 1));
log("done");
