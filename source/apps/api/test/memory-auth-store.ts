import type { PermissionCode, RoleCode } from "@bcis/shared";
import { randomUUID } from "node:crypto";

import type {
  AuthStore,
  AuthUserRecord,
  LoginMetadata,
  SessionRecord
} from "../src/modules/auth/auth-store.js";

export interface MemoryUser extends AuthUserRecord {
  roles: RoleCode[];
  permissions: PermissionCode[];
}

export class MemoryAuthStore implements AuthStore {
  readonly users = new Map<string, MemoryUser>();
  readonly sessions = new Map<string, SessionRecord>();

  constructor(initialUsers: readonly MemoryUser[]) {
    initialUsers.forEach((user) => this.users.set(user.normalizedUsername, { ...user }));
  }

  async findUserByNormalizedUsername(normalizedUsername: string): Promise<AuthUserRecord | null> {
    return this.users.get(normalizedUsername) ?? null;
  }

  async recordFailedLogin(user: AuthUserRecord | null, _username: string, lockedUntil: Date | null): Promise<void> {
    if (!user) return;
    const stored = this.users.get(user.normalizedUsername);
    if (stored) {
      stored.failedLoginCount += 1;
      stored.lockedUntil = lockedUntil;
    }
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    const user = [...this.users.values()].find((candidate) => candidate.id === userId);
    if (user) {
      user.failedLoginCount = 0;
      user.lockedUntil = null;
    }
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord> {
    const user = [...this.users.values()].find((candidate) => candidate.id === userId);
    if (!user) throw new Error("Missing test user");
    const session: SessionRecord = {
      id: randomUUID(),
      tokenHash,
      user,
      roles: user.roles,
      permissions: user.permissions,
      isLocked: false,
      expiresAt,
      revokedAt: null
    };
    this.sessions.set(tokenHash, session);
    return session;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(sessionId: string, _metadata: LoginMetadata): Promise<void> {
    const session = [...this.sessions.values()].find((candidate) => candidate.id === sessionId);
    if (session) session.revokedAt = new Date();
  }

  async setSessionLocked(sessionId: string, locked: boolean): Promise<void> {
    const session = [...this.sessions.values()].find((candidate) => candidate.id === sessionId);
    if (session) session.isLocked = locked;
  }

  async changePassword(userId: string, sessionId: string, passwordHash: string): Promise<void> {
    const user = [...this.users.values()].find((candidate) => candidate.id === userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
    }
    for (const session of this.sessions.values()) {
      if (session.user.id === userId && session.id !== sessionId) session.revokedAt = new Date();
      if (session.id === sessionId) session.isLocked = false;
    }
  }
}
