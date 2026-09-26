import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { desc, eq, sql, sum } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import { auditLogs, authSessions, backupRuns, invoices, ledgerEntries, payments } from "../../db/schema/index.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import { postgresEnvironment, requirePathInside, requireRestoreConfirmation } from "./backup-rules.js";

const executeFile = promisify(execFile);

export interface BackupConfiguration { databaseUrl: string; backupRoot: string; pgDumpPath: string; pgRestorePath: string; }

export class BackupService {
  private operationRunning = false;
  private maintenance = false;
  private readonly root: string;
  constructor(private readonly db: BcisDatabase, private readonly config: BackupConfiguration) { this.root = resolve(config.backupRoot); }

  isMaintenanceMode(): boolean { return this.maintenance; }

  async list() { const rows = await this.db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(100); return rows.map(serialize); }

  async preflight() {
    const [dump, restore] = await Promise.all([toolVersion(this.config.pgDumpPath), toolVersion(this.config.pgRestorePath)]);
    return { backupRoot: this.root, pgDump: dump, pgRestore: restore, operationRunning: this.operationRunning, maintenanceMode: this.maintenance };
  }

  async create(actor: SecurityActor) {
    this.beginOperation();
    const id = randomUUID();
    const directory = requirePathInside(this.root, resolve(this.root, id));
    const databaseFile = requirePathInside(this.root, resolve(directory, "database.dump"));
    const manifestFile = requirePathInside(this.root, resolve(directory, "manifest.json"));
    try {
      await mkdir(this.root, { recursive: true });
      await mkdir(directory, { recursive: false });
      await this.db.insert(backupRuns).values({ id, backupDirectory: directory, databaseFile, manifestFile, createdBy: actor.userId });
      const snapshot = await this.financialSnapshot();
      await run(this.config.pgDumpPath, ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--file", databaseFile], this.config.databaseUrl);
      const file = await readFile(databaseFile);
      const sha256 = createHash("sha256").update(file).digest("hex");
      const manifest = { formatVersion: 1, backupId: id, createdAt: new Date().toISOString(), databaseFile: "database.dump", databaseBytes: file.byteLength, databaseSha256: sha256, financialSnapshot: snapshot, attachments: { included: false, reason: "Attachment storage is not configured in the implemented modules." } };
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      const [updated] = await this.db.update(backupRuns).set({ status: "CREATED", sizeBytes: BigInt(file.byteLength), sha256, financialSnapshot: snapshot, completedAt: new Date() }).where(eq(backupRuns.id, id)).returning();
      await audit(this.db, actor, "backup.create", id, { sizeBytes: file.byteLength, sha256 });
      if (!updated) throw new Error("Backup history could not be updated.");
      return serialize(updated);
    } catch (error) {
      await this.db.update(backupRuns).set({ status: "FAILED", verificationMessage: safeError(error), completedAt: new Date() }).where(eq(backupRuns.id, id)).catch(() => undefined);
      throw mapToolError(error, "Backup creation failed.");
    } finally { this.operationRunning = false; }
  }

  async verify(id: string, actor: SecurityActor) {
    this.beginOperation();
    try {
      const row = await this.get(id);
      const { sha256 } = await this.validateArchive(row);
      const [updated] = await this.db.update(backupRuns).set({ status: "VERIFIED", verifiedBy: actor.userId, verifiedAt: new Date(), verificationMessage: "Checksum and pg_restore catalog validation passed." }).where(eq(backupRuns.id, id)).returning();
      await audit(this.db, actor, "backup.verify", id, { sha256, result: "passed" });
      if (!updated) throw new Error("Backup verification could not be recorded.");
      return serialize(updated);
    } catch (error) { throw mapToolError(error, "Backup verification failed."); }
    finally { this.operationRunning = false; }
  }

  async restore(id: string, confirmation: string, actor: SecurityActor): Promise<void> {
    requireRestoreConfirmation(id, confirmation);
    this.beginOperation();
    this.maintenance = true;
    try {
      const row = await this.get(id);
      if (row.status !== "VERIFIED") throw new AppError(409, "BACKUP_NOT_VERIFIED", "Verify the backup immediately before restoring it.");
      const { databaseFile } = await this.validateArchive(row);
      await run(this.config.pgRestorePath, ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", "--dbname", databaseName(this.config.databaseUrl), databaseFile], this.config.databaseUrl);
      await this.db.transaction(async (transaction) => {
        await transaction.update(authSessions).set({ revokedAt: new Date() }).where(sql`${authSessions.revokedAt} is null`);
        await transaction.update(backupRuns).set({ status: "RESTORED", restoredBy: actor.userId, restoredAt: new Date(), verificationMessage: "Restored in one PostgreSQL transaction; all sessions revoked." }).where(eq(backupRuns.id, id));
        await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "backup.restore", entityType: "backup_run", entityId: id, requestId: actor.requestId ?? null, afterValues: { sessionsRevoked: true, singleTransaction: true } });
      });
    } catch (error) { throw mapToolError(error, "Database restore failed. PostgreSQL single-transaction mode prevented partial restore."); }
    finally { this.maintenance = false; this.operationRunning = false; }
  }

  private beginOperation() { if (this.operationRunning) throw new AppError(409, "BACKUP_OPERATION_RUNNING", "Another backup or restore operation is already running."); this.operationRunning = true; }
  private async get(id: string) { const [row] = await this.db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1); if (!row) throw new AppError(404, "BACKUP_NOT_FOUND", "The backup record was not found."); return row; }
  private async validateArchive(row: typeof backupRuns.$inferSelect) {
    const databaseFile = requirePathInside(this.root, row.databaseFile);
    const manifestFile = requirePathInside(this.root, row.manifestFile);
    const [file, manifestText] = await Promise.all([readFile(databaseFile), readFile(manifestFile, "utf8")]);
    const manifest = JSON.parse(manifestText) as { backupId?: string; databaseBytes?: number; databaseSha256?: string; financialSnapshot?: unknown };
    const sha256 = createHash("sha256").update(file).digest("hex");
    if (manifest.backupId !== row.id || manifest.databaseBytes !== file.byteLength || manifest.databaseSha256 !== sha256 || row.sha256 !== sha256 || JSON.stringify(manifest.financialSnapshot) !== JSON.stringify(row.financialSnapshot)) throw new AppError(409, "BACKUP_INTEGRITY_FAILED", "The backup manifest, financial snapshot, or database checksum does not match.");
    await run(this.config.pgRestorePath, ["--list", databaseFile], this.config.databaseUrl);
    return { databaseFile, sha256 };
  }
  private async financialSnapshot() {
    const [[invoice], [payment], [ledger]] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::integer`, total: sum(invoices.totalCentavos), paid: sum(invoices.paidCentavos) }).from(invoices),
      this.db.select({ count: sql<number>`count(*)::integer`, total: sum(payments.amountCentavos) }).from(payments),
      this.db.select({ count: sql<number>`count(*)::integer`, debit: sum(ledgerEntries.debitCentavos), credit: sum(ledgerEntries.creditCentavos) }).from(ledgerEntries)
    ]);
    return { invoiceCount: Number(invoice?.count ?? 0), invoiceTotalCentavos: money(invoice?.total), invoicePaidCentavos: money(invoice?.paid), paymentCount: Number(payment?.count ?? 0), paymentTotalCentavos: money(payment?.total), ledgerEntryCount: Number(ledger?.count ?? 0), ledgerDebitCentavos: money(ledger?.debit), ledgerCreditCentavos: money(ledger?.credit) };
  }
}

async function run(executable: string, args: string[], databaseUrl: string): Promise<void> { await executeFile(executable, args, { env: postgresEnvironment(databaseUrl), windowsHide: true, timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024 }); }
async function toolVersion(executable: string) { try { const { stdout } = await executeFile(executable, ["--version"], { windowsHide: true, timeout: 10_000 }); return { available: true, version: stdout.trim() }; } catch { return { available: false, version: "unavailable" }; } }
function databaseName(databaseUrl: string) { return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, "")); }
function money(value: unknown) { return BigInt(value as string | number | bigint | null ?? 0).toString(); }
function serialize(row: typeof backupRuns.$inferSelect) { return { ...row, sizeBytes: row.sizeBytes?.toString() ?? null }; }
function safeError(error: unknown) { return error instanceof AppError ? error.message : error instanceof Error ? error.message.slice(0, 500) : "Unknown backup failure."; }
function mapToolError(error: unknown, fallback: string) { if (error instanceof AppError) return error; return new AppError(503, "BACKUP_TOOL_FAILED", `${fallback} Check PostgreSQL tools, credentials, storage permissions, and server logs.`); }
async function audit(db: BcisDatabase, actor: SecurityActor, action: string, id: string, values: Record<string, unknown>) { await db.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action, entityType: "backup_run", entityId: id, requestId: actor.requestId ?? null, afterValues: values }); }
