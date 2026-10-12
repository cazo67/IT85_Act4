// Independent read-only SQL assertions against the run-owned database (never the normal bcis / shared test DBs).
import { execFileSync } from "node:child_process";
import { loadSecrets } from "./common.mjs";

export function sql(query, db = "bcis_demo") {
  const s = loadSecrets();
  return execFileSync("C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe", ["-h", "127.0.0.1", "-p", "55432", "-U", "bcis_demo_app", "-d", db, "-At", "-F", "|", "-c", query], { env: { ...process.env, PGPASSWORD: s.pgApp }, encoding: "utf8" }).trim();
}
export function expect(label, actual, wanted) { if (String(actual) !== String(wanted)) throw new Error(`ASSERT ${label}: expected ${wanted}, got ${actual}`); return `${label}=${actual}`; }
export const maraOutstanding = () => sql(`select coalesce(sum(i.total_centavos - coalesce((select sum(pa.amount_centavos) from payment_allocations pa where pa.invoice_id=i.id and pa.reversed_at is null),0)),0) from invoices i join subscribers s on s.id=i.subscriber_id where s.first_name='Mara' and i.status<>'VOID'`);
