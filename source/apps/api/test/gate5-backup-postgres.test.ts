import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type DatabaseHandle } from "../src/db/client.js";
import { authSessions, users } from "../src/db/schema/index.js";
import { BackupService } from "../src/modules/backups/backup-service.js";
import { postgresEnvironment } from "../src/modules/backups/backup-rules.js";
import { PaymentService } from "../src/modules/payments/payment-service.js";
import { ReportService } from "../src/modules/reports/report-service.js";
import type { ReportDocument } from "../src/infrastructure/reports/report-model.js";

const testUri = process.env.BCIS_TEST_DATABASE_URL ?? "";
const restoreUri = process.env.BCIS_RESTORE_DATABASE_URL ?? "";
const restoreConfirmation = process.env.BCIS_RESTORE_CONFIRMATION ?? "";
const executeFile = promisify(execFile);
const restoreExecutable = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe";

describe.skipIf(!testUri)("Gate 5 backup on guarded PostgreSQL", () => {
  let database: DatabaseHandle;
  let pool: Pool;
  let verifiedArchive: { databaseFile: string; manifestFile: string; financialSnapshot: unknown } | undefined;
  let reportBeforeConcurrentPayment: ReportDocument | undefined;
  let reportDate: string | undefined;

  beforeAll(async () => {
    const target = new URL(testUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") throw new Error("Gate 5 backup tests require 127.0.0.1:5433/bcis_test.");
    if (!resolve(process.cwd()).endsWith(join("source", "apps", "api"))) throw new Error("Gate 5 backup tests must run from the API package so artifacts remain ignored.");
    pool = new Pool({ connectionString: testUri, max: 2 });
    const result = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (result.rows[0]?.name !== "bcis_test" || result.rows[0]?.migrations !== 19) throw new Error("The isolated test database must have all 19 migrations.");
    database = createDatabase(testUri);
  });

  afterAll(async () => {
    await database?.close();
    await pool?.end();
  });

  it("creates and verifies an archive whose manifest uses its exported database snapshot", async () => {
    const [owner] = await database.db.select({ id: users.id }).from(users).where(eq(users.username, "gate1_test_owner")).limit(1);
    if (!owner) throw new Error("Run the security seed in bcis_test first.");
    const [session] = await database.db.insert(authSessions).values({ userId: owner.id, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), expiresAt: new Date(), revokedAt: new Date() }).returning({ id: authSessions.id });
    if (!session) throw new Error("Could not create a synthetic audit session.");
    const [subscriber] = (await pool.query("select id from subscribers order by id limit 1")).rows as Array<{ id: string }>;
    if (!subscriber) throw new Error("Run the synthetic subscriber seed in bcis_test first.");
    reportDate = (await pool.query("select current_date::text as day")).rows[0]?.day as string;
    reportBeforeConcurrentPayment = await new ReportService(database.db).run("daily-collections", { dateFrom: reportDate, dateTo: reportDate }, "Gate 5 restore comparison");
    const beforeCount = Number((await pool.query("select count(*)::int as count from payments")).rows[0]?.count);
    let concurrentPaymentNumber: string | undefined;
    const backup = new BackupService(database.db, {
      databaseUrl: testUri,
      backupRoot: join(process.cwd(), "backups", "gate5-test"),
      pgDumpPath: "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
      pgRestorePath: "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe"
    }, async () => {
      const posted = await new PaymentService(database.db).post({ subscriberId: subscriber.id, amountCentavos: "137", method: "CASH", commandKey: randomUUID() }, { userId: owner.id, sessionId: session.id });
      concurrentPaymentNumber = posted.payment.paymentNumber;
    });
    const created = await backup.create({ userId: owner.id, sessionId: session.id });
    expect(created.status).toBe("CREATED");
    const file = await readFile(created.databaseFile);
    const manifest = JSON.parse(await readFile(created.manifestFile, "utf8")) as {
      backupId: string;
      databaseBytes: number;
      databaseSha256: string;
      financialSnapshot: unknown;
      attachments: { included: boolean; storage: string };
    };
    expect(manifest.backupId).toBe(created.id);
    expect(manifest.databaseBytes).toBe(file.byteLength);
    expect(manifest.databaseSha256).toBe(createHash("sha256").update(file).digest("hex"));
    expect(manifest.financialSnapshot).toEqual(created.financialSnapshot);
    expect(manifest.attachments).toEqual({ included: true, storage: "PostgreSQL payment_proofs.proof_data" });
    expect((manifest.financialSnapshot as { paymentCount: number }).paymentCount).toBe(beforeCount);
    expect(Number((await pool.query("select count(*)::int as count from payments")).rows[0]?.count)).toBe(beforeCount + 1);
    if (!concurrentPaymentNumber) throw new Error("The concurrent Cash fixture was not posted.");
    const dumpRows = await executeFile(restoreExecutable, ["--data-only", "--table=payments", "--file=-", created.databaseFile], { env: postgresEnvironment(testUri), windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
    expect(dumpRows.stdout).toContain("COPY public.payments");
    expect(dumpRows.stdout).not.toContain(concurrentPaymentNumber);
    const verified = await backup.verify(created.id, { userId: owner.id, sessionId: session.id });
    expect(verified.status).toBe("VERIFIED");
    expect(verified.sha256).toBe(manifest.databaseSha256);
    verifiedArchive = { databaseFile: created.databaseFile, manifestFile: created.manifestFile, financialSnapshot: manifest.financialSnapshot };
  }, 120_000);

  it.skipIf(!restoreUri && !restoreConfirmation)("restores only into the confirmed isolated target and reconciles totals and a report", async () => {
    if (!restoreUri || restoreConfirmation !== "RESTORE bcis_restore_test") throw new Error("Set both BCIS_RESTORE_DATABASE_URL and BCIS_RESTORE_CONFIRMATION=RESTORE bcis_restore_test.");
    const source = new URL(testUri);
    const target = new URL(restoreUri);
    if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_restore_test" || target.username !== source.username) throw new Error("Restore target must be the dedicated local bcis_restore_test database with the same app role.");
    if (!verifiedArchive) throw new Error("Create and verify the archive before restoring it.");
    const archive = await readFile(verifiedArchive.databaseFile);
    const manifest = JSON.parse(await readFile(verifiedArchive.manifestFile, "utf8")) as { databaseSha256: string; databaseBytes: number; financialSnapshot: unknown };
    if (archive.byteLength !== manifest.databaseBytes || createHash("sha256").update(archive).digest("hex") !== manifest.databaseSha256 || JSON.stringify(manifest.financialSnapshot) !== JSON.stringify(verifiedArchive.financialSnapshot)) throw new Error("The archive or manifest changed after verification.");
    await executeFile(restoreExecutable, ["--list", verifiedArchive.databaseFile], { env: postgresEnvironment(testUri), windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    const targetPool = new Pool({ connectionString: restoreUri, max: 2 });
    try {
      const identity = await targetPool.query("select current_database() as name, current_user as role, (select pg_get_userbyid(datdba) from pg_database where datname=current_database()) as owner");
      if (identity.rows[0]?.name !== "bcis_restore_test" || identity.rows[0]?.role !== "bcis_app" || identity.rows[0]?.owner !== "bcis_app") throw new Error("Restore target identity or owner is not the dedicated bcis_app test database.");
      if (!reportDate || !reportBeforeConcurrentPayment) throw new Error("The pre-backup report was not captured.");
      await executeFile(restoreExecutable, ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", "--dbname", "bcis_restore_test", verifiedArchive.databaseFile], {
        env: postgresEnvironment(restoreUri), windowsHide: true, timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024
      });
      const [invoice, payment, ledger] = await Promise.all([
        targetPool.query("select count(*)::int as count, coalesce(sum(total_centavos),0)::text as total, coalesce(sum(paid_centavos),0)::text as paid from invoices"),
        targetPool.query("select count(*)::int as count, coalesce(sum(amount_centavos),0)::text as total from payments"),
        targetPool.query("select count(*)::int as count, coalesce(sum(debit_centavos),0)::text as debit, coalesce(sum(credit_centavos),0)::text as credit from ledger_entries")
      ]);
      expect({
        invoiceCount: invoice.rows[0]?.count,
        invoiceTotalCentavos: invoice.rows[0]?.total,
        invoicePaidCentavos: invoice.rows[0]?.paid,
        paymentCount: payment.rows[0]?.count,
        paymentTotalCentavos: payment.rows[0]?.total,
        ledgerEntryCount: ledger.rows[0]?.count,
        ledgerDebitCentavos: ledger.rows[0]?.debit,
        ledgerCreditCentavos: ledger.rows[0]?.credit
      }).toEqual(verifiedArchive.financialSnapshot);
      const restoredDatabase = createDatabase(restoreUri);
      try {
        const restoredReport = await new ReportService(restoredDatabase.db).run("daily-collections", { dateFrom: reportDate, dateTo: reportDate }, "Gate 5 restore comparison");
        expect({ columns: restoredReport.columns, rows: restoredReport.rows, summary: restoredReport.summary }).toEqual({ columns: reportBeforeConcurrentPayment.columns, rows: reportBeforeConcurrentPayment.rows, summary: reportBeforeConcurrentPayment.summary });
      } finally {
        await restoredDatabase.close();
      }
    } finally {
      await targetPool.end();
    }
  }, 120_000);
});
