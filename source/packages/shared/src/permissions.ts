import { z } from "zod";

export const permissionCodes = [
  "dashboard.view",
  "subscriber.view",
  "subscriber.create",
  "subscriber.update",
  "plan.manage",
  "service.view",
  "service.manage",
  "billing.view",
  "billing.generate",
  "billing.adjust",
  "payment.create",
  "payment.verify_gcash",
  "payment.reverse",
  "receipt.print",
  "collection.manage_routes",
  "collection.manage_batch",
  "collection.record",
  "collection.reconcile",
  "receivable.view",
  "service.suspend",
  "service.reconnect",
  "report.view",
  "report.export",
  "audit.view",
  "user.manage",
  "role.manage",
  "settings.manage",
  "backup.create",
  "backup.restore"
] as const;

export const permissionCodeSchema = z.enum(permissionCodes);
export type PermissionCode = z.infer<typeof permissionCodeSchema>;

export const roleCodes = [
  "OWNER",
  "ADMINISTRATOR",
  "CASHIER",
  "COLLECTION_SUPERVISOR",
  "ACCOUNTING_AUDITOR",
  "TECHNICIAN",
  "VIEWER"
] as const;

export const roleCodeSchema = z.enum(roleCodes);
export type RoleCode = z.infer<typeof roleCodeSchema>;

