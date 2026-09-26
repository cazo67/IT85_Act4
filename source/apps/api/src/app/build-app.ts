import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";

import { registerErrorHandler } from "./error-handler.js";
import { registerAuthRoutes } from "../modules/auth/auth-routes.js";
import type { AuthService } from "../modules/auth/auth-service.js";
import { registerSecurityAdminRoutes } from "../modules/security-admin/security-admin-routes.js";
import type { SecurityAdminService } from "../modules/security-admin/security-admin-service.js";
import { registerSubscriberRoutes } from "../modules/subscribers/subscriber-routes.js";
import type { SubscriberService } from "../modules/subscribers/subscriber-service.js";
import { registerBillingRoutes } from "../modules/billing/billing-routes.js";
import type { BillingService } from "../modules/billing/billing-service.js";
import { registerPaymentRoutes } from "../modules/payments/payment-routes.js";
import type { PaymentService } from "../modules/payments/payment-service.js";
import { registerCollectionRoutes } from "../modules/collections/collection-routes.js";
import type { CollectionService } from "../modules/collections/collection-service.js";
import { registerReceivableRoutes } from "../modules/receivables/receivable-routes.js";
import type { ReceivableService } from "../modules/receivables/receivable-service.js";
import { registerReportRoutes } from "../modules/reports/report-routes.js";
import type { ReportService } from "../modules/reports/report-service.js";
import { registerBackupRoutes } from "../modules/backups/backup-routes.js";
import type { BackupService } from "../modules/backups/backup-service.js";
import { registerAuditRoutes } from "../modules/audit/audit-routes.js";
import type { AuditService } from "../modules/audit/audit-service.js";

export interface BuildAppOptions {
  allowedOrigins: readonly string[];
  checkDatabase?: () => Promise<void>;
  authService?: AuthService;
  securityAdminService?: SecurityAdminService;
  subscriberService?: SubscriberService;
  billingService?: BillingService;
  paymentService?: PaymentService;
  collectionService?: CollectionService;
  receivableService?: ReceivableService;
  reportService?: ReportService;
  backupService?: BackupService;
  auditService?: AuditService;
  logger?: boolean | Record<string, unknown>;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: "x-request-id"
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || options.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed"), false);
    }
  });

  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  registerErrorHandler(app);

  if (options.authService) registerAuthRoutes(app, options.authService);
  if (options.authService && options.securityAdminService) {
    registerSecurityAdminRoutes(app, options.authService, options.securityAdminService);
  }
  if (options.authService && options.subscriberService) {
    registerSubscriberRoutes(app, options.authService, options.subscriberService);
  }
  if (options.authService && options.billingService) {
    registerBillingRoutes(app, options.authService, options.billingService);
  }
  if (options.authService && options.paymentService) {
    registerPaymentRoutes(app, options.authService, options.paymentService);
  }
  if (options.authService && options.collectionService) {
    registerCollectionRoutes(app, options.authService, options.collectionService);
  }
  if (options.authService && options.receivableService) {
    registerReceivableRoutes(app, options.authService, options.receivableService);
  }
  if (options.authService && options.reportService) {
    registerReportRoutes(app, options.authService, options.reportService);
  }
  if (options.authService && options.backupService) {
    registerBackupRoutes(app, options.authService, options.backupService);
  }
  if (options.authService && options.auditService) {
    registerAuditRoutes(app, options.authService, options.auditService);
  }

  app.get("/api/v1/health/live", async () => ({
    data: {
      service: "bcis-api",
      status: "ok",
      timestamp: new Date().toISOString()
    }
  }));

  app.get("/api/v1/health/ready", async (_request, reply) => {
    if (!options.checkDatabase) {
      return reply.status(503).send({
        error: {
          code: "DATABASE_NOT_CONFIGURED",
          message: "The database connection is not configured."
        }
      });
    }

    try {
      await options.checkDatabase();
      return { data: { database: "ready", status: "ready" } };
    } catch {
      return reply.status(503).send({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is currently unavailable."
        }
      });
    }
  });

  return app;
}
