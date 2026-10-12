// Isolated restore drill for the run's own backup: verify archive hash, restore into the run-owned disposable DB bcis_demo_restore, compare financial aggregates.
// Never touches the story database, the normal bcis, bcis_test or bcis_restore_test.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { runDir, loadSecrets } from "./lib/common.mjs";
import { sql } from "./lib/sql.mjs";

const tag = process.argv[2] ?? "run";
const PG = "C:\\Program Files\\PostgreSQL\\18\\bin\\";
const s = loadSecrets();
const root = join(runDir, "reports", "backups");
const dirs = readdirSync(root).map((d) => join(root, d)).filter((d) => statSync(d).isDirectory()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
if (!dirs.length) throw new Error("no backup directory found");
const dir = dirs[0], files = readdirSync(dir);
const archive = join(dir, files.find((f) => /\.(dump|backup|pgdump)$/i.test(f)) ?? files.find((f) => !f.endsWith(".json")));
const manifestFile = files.find((f) => f.endsWith(".json")); const manifest = manifestFile ? JSON.parse(readFileSync(join(dir, manifestFile), "utf8")) : {};
const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
const out = { tag, archive, bytes: statSync(archive).size, sha256: sha, manifestSha256: manifest.databaseSha256 ?? manifest.sha256 ?? null };
out.hashMatchesManifest = out.manifestSha256 ? out.manifestSha256.toLowerCase() === sha : null;

const su = { env: { ...process.env, PGPASSWORD: s.pgSuper } }, app = { env: { ...process.env, PGPASSWORD: s.pgApp } };
const psqlSu = (q, db = "postgres") => execFileSync(PG + "psql.exe", ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { ...su, encoding: "utf8" });
// identity guard: only the run-owned restore target may be replaced
const owner = psqlSu("select pg_get_userbyid(datdba) from pg_database where datname='bcis_demo_restore'").trim();
if (owner !== "bcis_demo_app") throw new Error(`restore target identity unexpected: ${owner}`);
psqlSu("select pg_terminate_backend(pid) from pg_stat_activity where datname='bcis_demo_restore'");
psqlSu("DROP DATABASE bcis_demo_restore"); psqlSu("CREATE DATABASE bcis_demo_restore OWNER bcis_demo_app");
execFileSync(PG + "pg_restore.exe", ["-h", "127.0.0.1", "-p", "55432", "-U", "bcis_demo_app", "-d", "bcis_demo_restore", "--single-transaction", "--no-owner", archive], { ...app, stdio: "pipe" });

const agg = (db) => sql(`select 'migrations='||(select count(*) from drizzle.__drizzle_migrations)||';invoices='||(select count(*)||'/'||coalesce(sum(total_centavos),0) from invoices)||';payments='||(select count(*)||'/'||coalesce(sum(amount_centavos),0) from payments)||';allocations='||(select count(*)||'/'||coalesce(sum(amount_centavos),0) from payment_allocations)||';ledger='||(select count(*)||'/'||coalesce(sum(debit_centavos),0)||'/'||coalesce(sum(credit_centavos),0) from ledger_entries)||';receipts='||(select count(*)||'/'||count(voided_at) from receipts)||';proofs='||(select count(*) from payment_proofs)||';reversals='||(select count(*) from payment_reversals)||';batches='||(select count(*)||'/'||coalesce(sum(collected_cash_centavos),0)||'/'||coalesce(sum(remitted_cash_centavos),0) from collection_batches)||';corrections='||(select count(*) from remittance_corrections)||';subscribers='||(select count(*) from subscribers)||';contacts='||(select count(*) from subscriber_contacts)`, db);
const src = agg("bcis_demo"), dst = agg("bcis_demo_restore");
const collections = (db) => sql("select string_agg(m, ',' order by m) from (select method||':'||count(*)||':'||sum(amount_centavos) as m from payments where status='POSTED' group by method) x", db);
const bytes = sql("select octet_length(proof_data) from payment_proofs where normalized_external_reference=(select normalized_external_reference from payment_proofs order by created_at desc limit 1)", "bcis_demo_restore");
Object.assign(out, { sourceAggregates: src, restoredAggregates: dst, aggregatesEqual: src === dst, collectionsByMethodSource: collections("bcis_demo"), collectionsByMethodRestored: collections("bcis_demo_restore"), restoredProofBytes: bytes, restoredIdentity: sql("select current_database()||'|'||current_user", "bcis_demo_restore"), at: new Date().toISOString() });
out.pass = out.aggregatesEqual && out.collectionsByMethodSource === out.collectionsByMethodRestored && out.hashMatchesManifest !== false;
writeFileSync(join(runDir, "verification", `restore-drill-${tag}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ pass: out.pass, hashMatchesManifest: out.hashMatchesManifest, aggregatesEqual: out.aggregatesEqual, restoredIdentity: out.restoredIdentity, restoredProofBytes: out.restoredProofBytes, sha256: sha }, null, 1));
process.exit(out.pass ? 0 : 1);
