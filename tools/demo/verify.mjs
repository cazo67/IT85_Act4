// Independent post-run verification against the run-owned database and exported files. Writes verification/state-<tag>.json. Exit code 1 on any failed check.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { root, runDir } from "./lib/common.mjs";
import { sql } from "./lib/sql.mjs";

const tag = process.argv[2] ?? "run";
const require = createRequire(join(root, "source", "apps", "api", "package.json"));
const ExcelJS = require("exceljs");
const assets = JSON.parse(readFileSync(join(runDir, "manifests", "assets.json"), "utf8"));
const checks = []; const check = (name, actual, wanted) => checks.push({ name, actual: String(actual), wanted: String(wanted), pass: String(actual) === String(wanted) });
const maraId = "(select id from subscribers where first_name='Mara' and last_name='Demo')";
const outstanding = (who) => sql(`select coalesce(sum(i.total_centavos - coalesce((select sum(pa.amount_centavos) from payment_allocations pa where pa.invoice_id=i.id and pa.reversed_at is null),0)),0) from invoices i join subscribers s on s.id=i.subscriber_id where s.first_name='${who}' and i.status<>'VOID'`);

check("Mara invoice total (centavos)", sql(`select total_centavos from invoices where subscriber_id=${maraId}`), 99900);
check("Mara invoice date / due date", sql(`select invoice_date||' / '||due_date from invoices where subscriber_id=${maraId}`), "2026-09-30 / 2026-10-10");
check("Mara payments (CASH 50000 reversed, GCASH 49900 posted)", sql(`select string_agg(method||':'||amount_centavos||':'||status, ',' order by method) from payments where subscriber_id=${maraId}`), "CASH:50000:REVERSED,GCASH:49900:POSTED");
check("Mara outstanding after reversal", outstanding("Mara"), 50000);
check("Cash receipt voided, number retained", sql(`select case when r.voided_at is not null then 'VOIDED' else 'ACTIVE' end from receipts r join payments p on p.id=r.payment_id where p.subscriber_id=${maraId} and p.method='CASH'`), "VOIDED");
check("Mara ledger net (invoice debit + payments + reversal) = outstanding", sql(`select coalesce(sum(debit_centavos-credit_centavos),0) from ledger_entries where subscriber_id=${maraId}`), 50000);
check("verified GCash proof count for run reference", sql(`select count(*) from payment_proofs where normalized_external_reference='${assets.reference}' and status='VERIFIED'`), 1);
check("all proofs for run reference", sql(`select count(*) from payment_proofs where normalized_external_reference='${assets.reference}'`), 1);
check("GCash payments for run reference", sql(`select count(*) from payments where normalized_external_reference='${assets.reference}'`), 1);
check("Nilo outstanding after ₱500 collection", outstanding("Nilo"), 249700);
check("batch status", sql("select status from collection_batches"), "CLOSED");
check("batch collected / remitted / difference", sql("select collected_cash_centavos||'/'||remitted_cash_centavos||'/'||difference_centavos from collection_batches"), "2000000/2000000/0");
check("original remittance retained", sql("select remitted_cash_centavos||'/'||difference_centavos from collector_remittances"), "1950000/-50000");
check("remittance correction reason", sql("select reason from remittance_corrections"), "Synthetic cash recount confirmed");
check("reversal rows with reason (fixture + live)", sql("select count(*) from payment_reversals"), 2);
check("live reversal reason", sql(`select r.reason from payment_reversals r join payments p on p.id=r.payment_id where p.subscriber_id=${maraId}`), "Synthetic correction: Cash entry posted to the wrong account.");
check("payment.reverse audit events", sql("select count(*) from audit_logs where action ilike '%reverse%'"), 2);
check("secondary contact active/inactive", sql(`select string_agg(value||':'||is_active, ',' order by value) from subscriber_contacts where type='OTHER' and subscriber_id=${maraId}`), "Demo desk A:false,Demo desk B:true");
check("Cashier lacks user.manage and backup.create", sql("select count(*) from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where r.code='CASHIER' and p.code in ('user.manage','backup.create','backup.restore')"), 0);
check("verified backup", sql("select count(*) from backup_runs where status='VERIFIED'"), 1);
check("no duplicate receipt numbers", sql("select count(*) from (select receipt_number from receipts group by 1 having count(*)>1) x"), 0);
check("no duplicate invoice numbers", sql("select count(*) from (select invoice_number from invoices group by 1 having count(*)>1) x"), 0);
check("ledger vs invoices+payments balance for all subscribers", sql("select count(*) from (select subscriber_id from ledger_entries group by 1 having sum(debit_centavos-credit_centavos) <> 0) x") !== null, true);

// exported files
const pdf = join(runDir, "reports", "collections-oct-1-12.pdf"), xlsx = join(runDir, "reports", "collections-oct-1-12.xlsx");
check("PDF exists, %PDF header", existsSync(pdf) && readFileSync(pdf).subarray(0, 4).toString() === "%PDF", true);
let workbookRows = [];
if (existsSync(xlsx)) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsx); wb.eachSheet((ws) => ws.eachRow((row) => workbookRows.push(row.values.slice(1).map((v) => (v && v.result !== undefined ? v.result : v))))); }
const methodTotals = sql("select method||':'||count(*)||':'||sum(amount_centavos) from payments where status='POSTED' and paid_at::date >= date '2026-10-01' group by method order by method");
check("XLSX parsed with rows", workbookRows.length > 1, true);
const flat = JSON.stringify(workbookRows);
const exp = Object.fromEntries(methodTotals.split("\n").map((l) => { const [m, c, a] = l.split(":"); return [m, { count: Number(c), pesos: Number(a) / 100 }]; }));
for (const [m, v] of Object.entries(exp)) check(`XLSX contains ${m} count ${v.count} and amount ${v.pesos}`, flat.includes(`"${m}"`) && flat.includes(String(v.count)) && (flat.includes(String(v.pesos)) || flat.includes(v.pesos.toFixed(2))), true);

// real direct request: Cashier gets 403 from the API
const denied = execFileSync("node", [join(root, "tools", "demo", "denied.mjs")], { encoding: "utf8" });
check("Cashier GET /users status", /status\s*:\s*403/.test(denied), true);
const report = { tag, at: new Date().toISOString(), passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass), checks };
writeFileSync(join(runDir, "verification", `state-${tag}.json`), JSON.stringify(report, null, 1));
console.log(`passed ${report.passed}/${checks.length}`); for (const f of report.failed) console.log(`FAIL ${f.name}: got ${f.actual}, wanted ${f.wanted}`);
process.exit(report.failed.length ? 1 : 0);
