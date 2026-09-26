import { buildApp } from "./app/build-app.js";
import { readEnvironment } from "./config/env.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import { AuthService } from "./modules/auth/auth-service.js";
import { PostgresAuthStore } from "./modules/auth/postgres-auth-store.js";
import { UnavailableAuthStore } from "./modules/auth/unavailable-auth-store.js";
import { SecurityAdminService } from "./modules/security-admin/security-admin-service.js";
import { SubscriberService } from "./modules/subscribers/subscriber-service.js";
import { BillingService } from "./modules/billing/billing-service.js";
import { PaymentService } from "./modules/payments/payment-service.js";
import { CollectionService } from "./modules/collections/collection-service.js";
import { ReceivableService } from "./modules/receivables/receivable-service.js";
import { ReportService } from "./modules/reports/report-service.js";
import { BackupService } from "./modules/backups/backup-service.js";
import { AuditService } from "./modules/audit/audit-service.js";

const environment = readEnvironment();
let database: DatabaseHandle | undefined;

if (environment.DATABASE_URL) {
  database = createDatabase(environment.DATABASE_URL);
}

const authService = new AuthService(database ? new PostgresAuthStore(database.db) : new UnavailableAuthStore());

const app = await buildApp({
  allowedOrigins: environment.BCIS_ALLOWED_ORIGINS.split(",").map((value) => value.trim()),
  ...(database ? { checkDatabase: database.check } : {}),
  authService,
  ...(database ? { securityAdminService: new SecurityAdminService(database.db) } : {}),
  ...(database ? { subscriberService: new SubscriberService(database.db) } : {}),
  ...(database ? { billingService: new BillingService(database.db) } : {}),
  ...(database ? { paymentService: new PaymentService(database.db) } : {}),
  ...(database ? { collectionService: new CollectionService(database.db) } : {}),
  ...(database ? { receivableService: new ReceivableService(database.db) } : {}),
  ...(database ? { reportService: new ReportService(database.db) } : {}),
  ...(database && environment.DATABASE_URL ? { backupService: new BackupService(database.db, { databaseUrl: environment.DATABASE_URL, backupRoot: environment.BCIS_BACKUP_ROOT, pgDumpPath: environment.BCIS_PG_DUMP_PATH, pgRestorePath: environment.BCIS_PG_RESTORE_PATH }) } : {}),
  ...(database ? { auditService: new AuditService(database.db) } : {}),
  logger: {
    level: environment.LOG_LEVEL,
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "token",
      "DATABASE_URL"
    ]
  }
});

async function stop(signal: string): Promise<void> {
  app.log.info({ signal }, "Stopping BCIS API");
  await app.close();
  await database?.close();
  process.exit(0);
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));

try {
  await app.listen({ host: environment.BCIS_API_HOST, port: environment.BCIS_API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, "BCIS API failed to start");
  await database?.close();
  process.exit(1);
}
