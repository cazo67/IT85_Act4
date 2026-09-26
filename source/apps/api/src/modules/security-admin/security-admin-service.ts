import { roleCodeSchema, type PermissionCode, type RoleCode } from "@bcis/shared";
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { AppError } from "../../app/app-error.js";
import type { BcisDatabase } from "../../db/client.js";
import { auditLogs, permissions, rolePermissions, roles, userRoles, users } from "../../db/schema/index.js";
import { hashPassword } from "../../security/password.js";
import { normalizeUsername } from "../auth/auth-service.js";

export interface SecurityActor {
  userId: string;
  sessionId: string;
  requestId?: string;
}

export class SecurityAdminService {
  constructor(private readonly db: BcisDatabase) {}

  async listUsers(search = "") {
    const pattern = `%${search.trim()}%`;
    const rows = await this.db
      .select({ id: users.id, username: users.username, displayName: users.displayName, isActive: users.isActive, mustChangePassword: users.mustChangePassword, version: users.version })
      .from(users)
      .where(search.trim() ? or(ilike(users.username, pattern), ilike(users.displayName, pattern)) : undefined)
      .orderBy(asc(users.displayName))
      .limit(100);

    return Promise.all(rows.map(async (user) => ({ ...user, roles: await this.rolesForUser(user.id) })));
  }

  async listRoles() {
    const roleRows = await this.db.select().from(roles).orderBy(asc(roles.name));
    return Promise.all(roleRows.map(async (role) => {
      const permissionRows = await this.db
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, role.id));
      return { ...role, permissions: permissionRows.map((row) => row.code) };
    }));
  }

  async createUser(input: { username: string; displayName: string; password: string; roles: RoleCode[] }, actor: SecurityActor) {
    const normalizedUsername = normalizeUsername(input.username);
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.normalizedUsername, normalizedUsername)).limit(1);
    if (existing) throw new AppError(409, "DUPLICATE_USERNAME", "That username is already in use.");

    return this.db.transaction(async (transaction) => {
      const [created] = await transaction.insert(users).values({
        username: input.username.trim(),
        normalizedUsername,
        displayName: input.displayName.trim(),
        passwordHash: await hashPassword(input.password),
        mustChangePassword: true
      }).returning({ id: users.id, username: users.username, displayName: users.displayName });
      if (!created) throw new Error("The user could not be created.");

      const roleRows = await transaction.select({ id: roles.id, code: roles.code }).from(roles).where(inArray(roles.code, input.roles));
      if (roleRows.length !== new Set(input.roles).size) throw new AppError(400, "INVALID_ROLE", "One or more roles are invalid.");
      if (roleRows.length > 0) await transaction.insert(userRoles).values(roleRows.map((role) => ({ userId: created.id, roleId: role.id, assignedBy: actor.userId })));
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "user.create", entityType: "user", entityId: created.id, requestId: actor.requestId ?? null, afterValues: { username: created.username, roles: input.roles } });
      return { ...created, isActive: true, mustChangePassword: true, version: 1, roles: input.roles };
    });
  }

  async setUserActive(userId: string, isActive: boolean, actor: SecurityActor): Promise<void> {
    if (!isActive && await this.isLastActiveOwner(userId)) throw new AppError(409, "LAST_OWNER", "The last active owner cannot be deactivated.");
    await this.db.transaction(async (transaction) => {
      const [updated] = await transaction.update(users).set({ isActive, version: sql`${users.version} + 1`, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
      if (!updated) throw new AppError(404, "USER_NOT_FOUND", "The user was not found.");
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: isActive ? "user.activate" : "user.deactivate", entityType: "user", entityId: userId, requestId: actor.requestId ?? null, afterValues: { isActive } });
    });
  }

  async setUserRoles(userId: string, roleCodes: RoleCode[], actor: SecurityActor): Promise<void> {
    const currentRoles = await this.rolesForUser(userId);
    if (currentRoles.includes("OWNER") && !roleCodes.includes("OWNER") && await this.isLastActiveOwner(userId)) {
      throw new AppError(409, "LAST_OWNER", "The last active owner must keep the owner role.");
    }

    await this.db.transaction(async (transaction) => {
      const selected = await transaction.select({ id: roles.id }).from(roles).where(inArray(roles.code, roleCodes));
      if (selected.length !== new Set(roleCodes).size) throw new AppError(400, "INVALID_ROLE", "One or more roles are invalid.");
      await transaction.delete(userRoles).where(eq(userRoles.userId, userId));
      if (selected.length > 0) await transaction.insert(userRoles).values(selected.map((role) => ({ userId, roleId: role.id, assignedBy: actor.userId })));
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "user.roles.replace", entityType: "user", entityId: userId, requestId: actor.requestId ?? null, beforeValues: { roles: currentRoles }, afterValues: { roles: roleCodes } });
    });
  }

  async setRolePermissions(roleId: string, permissionCodes: PermissionCode[], actor: SecurityActor): Promise<void> {
    const [targetRole] = await this.db.select({ code: roles.code }).from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!targetRole) throw new AppError(404, "ROLE_NOT_FOUND", "The role was not found.");
    if (targetRole.code === "OWNER" && !["user.manage", "role.manage", "backup.restore"].every((code) => permissionCodes.includes(code as PermissionCode))) {
      throw new AppError(409, "OWNER_PERMISSIONS_REQUIRED", "The owner role must retain critical administration and restore permissions.");
    }

    await this.db.transaction(async (transaction) => {
      const selected = await transaction.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, permissionCodes));
      if (selected.length !== new Set(permissionCodes).size) throw new AppError(400, "INVALID_PERMISSION", "One or more permissions are invalid.");
      await transaction.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (selected.length > 0) await transaction.insert(rolePermissions).values(selected.map((permission) => ({ roleId, permissionId: permission.id })));
      await transaction.insert(auditLogs).values({ actorUserId: actor.userId, actorSessionId: actor.sessionId, action: "role.permissions.replace", entityType: "role", entityId: roleId, requestId: actor.requestId ?? null, afterValues: { permissions: permissionCodes } });
    });
  }

  private async rolesForUser(userId: string): Promise<RoleCode[]> {
    const rows = await this.db.select({ code: roles.code }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, userId));
    return rows.map((row) => roleCodeSchema.parse(row.code));
  }

  private async isLastActiveOwner(userId: string): Promise<boolean> {
    const [target] = await this.db.select({ userId: userRoles.userId }).from(userRoles).innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.code, "OWNER"))).where(eq(userRoles.userId, userId)).limit(1);
    if (!target) return false;
    const [result] = await this.db.select({ value: count() }).from(users).innerJoin(userRoles, eq(users.id, userRoles.userId)).innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.code, "OWNER"))).where(eq(users.isActive, true));
    return Number(result?.value ?? 0) <= 1;
  }
}
