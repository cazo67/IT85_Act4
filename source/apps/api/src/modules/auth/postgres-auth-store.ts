import { permissionCodeSchema, roleCodeSchema } from "@bcis/shared";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import type { BcisDatabase } from "../../db/client.js";
import {
  auditLogs,
  authSessions,
  loginAttempts,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users
} from "../../db/schema/index.js";
import type { AuthStore, AuthUserRecord, LoginMetadata, SessionRecord } from "./auth-store.js";

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly db: BcisDatabase) {}

  async findUserByNormalizedUsername(normalizedUsername: string): Promise<AuthUserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.normalizedUsername, normalizedUsername)).limit(1);
    return row ? mapUser(row) : null;
  }

  async recordFailedLogin(
    user: AuthUserRecord | null,
    normalizedUsername: string,
    lockedUntil: Date | null,
    metadata: LoginMetadata
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      if (user) {
        await transaction
          .update(users)
          .set({
            failedLoginCount: sql`${users.failedLoginCount} + 1`,
            lockedUntil,
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id));
      }

      await transaction.insert(loginAttempts).values({
        normalizedUsername,
        userId: user?.id ?? null,
        wasSuccessful: false,
        remoteAddress: metadata.remoteAddress ?? null,
        userAgent: metadata.userAgent ?? null
      });
    });
  }

  async recordSuccessfulLogin(userId: string, metadata: LoginMetadata): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const now = new Date();
      const [user] = await transaction
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
        .where(eq(users.id, userId))
        .returning({ normalizedUsername: users.normalizedUsername });

      if (user) {
        await transaction.insert(loginAttempts).values({
          normalizedUsername: user.normalizedUsername,
          userId,
          wasSuccessful: true,
          remoteAddress: metadata.remoteAddress ?? null,
          userAgent: metadata.userAgent ?? null
        });
      }
    });
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date, metadata: LoginMetadata): Promise<SessionRecord> {
    const [created] = await this.db.transaction(async (transaction) => {
      const result = await transaction
        .insert(authSessions)
        .values({ userId, tokenHash, expiresAt })
        .returning({ id: authSessions.id });

      const sessionId = result[0]?.id;
      if (sessionId) {
        await transaction.insert(auditLogs).values({
          actorUserId: userId,
          actorSessionId: sessionId,
          action: "auth.login",
          entityType: "auth_session",
          entityId: sessionId,
          requestId: metadata.requestId ?? null
        });
      }
      return result;
    });

    if (!created) throw new Error("The session was not created.");
    const session = await this.findSessionById(created.id);
    if (!session) throw new Error("The created session could not be loaded.");
    return session;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    return row ? this.hydrateSession(row.session, mapUser(row.user)) : null;
  }

  async revokeSession(sessionId: string, metadata: LoginMetadata): Promise<void> {
    await this.updateSessionState(sessionId, { revokedAt: new Date() }, "auth.logout", metadata);
  }

  async setSessionLocked(sessionId: string, locked: boolean, metadata: LoginMetadata): Promise<void> {
    await this.updateSessionState(sessionId, { isLocked: locked }, locked ? "auth.lock" : "auth.unlock", metadata);
  }

  async changePassword(userId: string, sessionId: string, passwordHash: string, metadata: LoginMetadata): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.update(users).set({ passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, userId));
      await transaction.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.userId, userId), sql`${authSessions.id} <> ${sessionId}`, isNull(authSessions.revokedAt)));
      await transaction.update(authSessions).set({ isLocked: false, lastSeenAt: new Date() }).where(eq(authSessions.id, sessionId));
      await transaction.insert(auditLogs).values({ actorUserId: userId, actorSessionId: sessionId, action: "user.password.change", entityType: "user", entityId: userId, requestId: metadata.requestId ?? null });
    });
  }

  private async findSessionById(sessionId: string): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.id, sessionId))
      .limit(1);
    return row ? this.hydrateSession(row.session, mapUser(row.user)) : null;
  }

  private async hydrateSession(
    session: typeof authSessions.$inferSelect,
    user: AuthUserRecord
  ): Promise<SessionRecord> {
    const roleRows = await this.db
      .select({ id: roles.id, code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));
    const roleIds = roleRows.map((row) => row.id);
    const permissionRows = roleIds.length === 0
      ? []
      : await this.db
          .selectDistinct({ code: permissions.code })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(inArray(rolePermissions.roleId, roleIds));

    return {
      id: session.id,
      tokenHash: session.tokenHash,
      user,
      roles: roleRows.map((row) => roleCodeSchema.parse(row.code)),
      permissions: permissionRows.map((row) => permissionCodeSchema.parse(row.code)),
      isLocked: session.isLocked,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt
    };
  }

  private async updateSessionState(
    sessionId: string,
    values: Partial<Pick<typeof authSessions.$inferInsert, "isLocked" | "revokedAt">>,
    action: string,
    metadata: LoginMetadata
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [session] = await transaction
        .update(authSessions)
        .set({ ...values, lastSeenAt: new Date() })
        .where(eq(authSessions.id, sessionId))
        .returning({ userId: authSessions.userId });
      if (session) {
        await transaction.insert(auditLogs).values({
          actorUserId: session.userId,
          actorSessionId: sessionId,
          action,
          entityType: "auth_session",
          entityId: sessionId,
          requestId: metadata.requestId ?? null
        });
      }
    });
  }
}

function mapUser(row: typeof users.$inferSelect): AuthUserRecord {
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalizedUsername,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil
  };
}
