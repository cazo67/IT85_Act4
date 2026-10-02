import "../scripts/load-environment.js";

import { permissionCodes, type PermissionCode, type RoleCode } from "@bcis/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  auditLogs,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users
} from "../../source/apps/api/src/db/schema/index.js";
import { normalizeUsername } from "../../source/apps/api/src/modules/auth/auth-service.js";
import { hashPassword } from "../../source/apps/api/src/security/password.js";

const databaseUrl = process.env.DATABASE_URL;
const bootstrapPassword = process.env.BCIS_BOOTSTRAP_ADMIN_PASSWORD;
const bootstrapUsername = process.env.BCIS_BOOTSTRAP_ADMIN_USERNAME ?? "owner";

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!bootstrapPassword || bootstrapPassword.length < 12) {
  throw new Error("BCIS_BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.");
}

const roleMatrix: Record<RoleCode, readonly PermissionCode[]> = {
  OWNER: permissionCodes,
  ADMINISTRATOR: permissionCodes.filter((code) => !["user.manage", "role.manage", "backup.restore", "audit.view"].includes(code)),
  CASHIER: ["dashboard.view", "subscriber.view", "service.view", "billing.view", "payment.create", "payment.verify_gcash", "receipt.print", "receivable.view"],
  COLLECTION_SUPERVISOR: ["dashboard.view", "subscriber.view", "service.view", "billing.view", "collection.manage_routes", "collection.manage_batch", "collection.record", "collection.reconcile", "receivable.view", "report.view", "report.export"],
  ACCOUNTING_AUDITOR: ["dashboard.view", "subscriber.view", "service.view", "billing.view", "billing.adjust", "payment.verify_gcash", "payment.reverse", "receipt.print", "collection.reconcile", "receivable.view", "service.suspend", "service.reconnect", "report.view", "report.export", "audit.view"],
  TECHNICIAN: ["dashboard.view", "subscriber.view", "service.view", "receivable.view", "service.suspend", "service.reconnect"],
  VIEWER: ["dashboard.view", "subscriber.view", "service.view", "billing.view", "receivable.view", "report.view"]
};

const roleNames: Record<RoleCode, string> = {
  OWNER: "Owner / Super Admin",
  ADMINISTRATOR: "Administrator",
  CASHIER: "Cashier",
  COLLECTION_SUPERVISOR: "Collection Supervisor",
  ACCOUNTING_AUDITOR: "Accounting / Auditor",
  TECHNICIAN: "Technician",
  VIEWER: "Read-only Viewer"
};

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const db = drizzle(pool);

try {
  await db.transaction(async (transaction) => {
    await transaction
      .insert(permissions)
      .values(permissionCodes.map((code) => ({ code, description: code.replaceAll(".", " ") })))
      .onConflictDoNothing({ target: permissions.code });

    for (const [code, name] of Object.entries(roleNames) as [RoleCode, string][]) {
      await transaction
        .insert(roles)
        .values({ code, name, description: `${name} default permissions`, isSystem: true })
        .onConflictDoUpdate({ target: roles.code, set: { name, updatedAt: new Date() } });
    }

    const roleRows = await transaction.select().from(roles);
    const permissionRows = await transaction.select().from(permissions);

    for (const role of roleRows) {
      const roleCode = role.code as RoleCode;
      const expected = roleMatrix[roleCode];
      if (!expected) continue;
      await transaction.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      const permissionIds = permissionRows.filter((permission) => expected.includes(permission.code as PermissionCode));
      if (permissionIds.length > 0) {
        await transaction.insert(rolePermissions).values(permissionIds.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id
        })));
      }
    }

    const normalizedUsername = normalizeUsername(bootstrapUsername);
    const [owner] = await transaction
      .insert(users)
      .values({
        username: bootstrapUsername,
        normalizedUsername,
        displayName: "BCIS System Owner",
        passwordHash: await hashPassword(bootstrapPassword),
        mustChangePassword: true
      })
      .onConflictDoUpdate({
        target: users.normalizedUsername,
        set: { isActive: true, updatedAt: new Date() }
      })
      .returning({ id: users.id });

    const [ownerRole] = await transaction.select({ id: roles.id }).from(roles).where(eq(roles.code, "OWNER"));
    if (!owner || !ownerRole) throw new Error("The owner account or role could not be created.");

    await transaction.delete(userRoles).where(eq(userRoles.userId, owner.id));
    await transaction.insert(userRoles).values({ userId: owner.id, roleId: ownerRole.id });
    await transaction.insert(auditLogs).values({
      action: "security.bootstrap",
      entityType: "user",
      entityId: owner.id,
      afterValues: { username: bootstrapUsername, roles: ["OWNER"] }
    });

  });
} finally {
  await pool.end();
}

console.info("BCIS security roles, permissions, and bootstrap owner are ready.");
