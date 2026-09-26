import type { PermissionCode, RoleCode } from "@bcis/shared";

import { AppError } from "../../app/app-error.js";
import { hashPassword, verifyPassword } from "../../security/password.js";
import { createSessionToken, hashSessionToken } from "../../security/tokens.js";
import type { AuthStore, LoginMetadata, SessionRecord } from "./auth-store.js";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  mustChangePassword: boolean;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export class AuthService {
  private readonly dummyHash = hashPassword("BCIS-invalid-login-placeholder");

  constructor(private readonly store: AuthStore) {}

  async login(username: string, password: string, metadata: LoginMetadata = {}): Promise<LoginResult> {
    const normalizedUsername = normalizeUsername(username);
    const user = await this.store.findUserByNormalizedUsername(normalizedUsername);
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const passwordMatches = await verifyPassword(passwordHash, password);
    const now = new Date();

    if (!user || !passwordMatches || !user.isActive || (user.lockedUntil && user.lockedUntil > now)) {
      const nextFailureCount = (user?.failedLoginCount ?? 0) + 1;
      const lockedUntil = user && nextFailureCount >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null;
      await this.store.recordFailedLogin(user, normalizedUsername, lockedUntil, metadata);
      throw new AppError(401, "INVALID_CREDENTIALS", "The username or password is incorrect.");
    }

    await this.store.recordSuccessfulLogin(user.id, metadata);
    const token = createSessionToken();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
    const session = await this.store.createSession(user.id, hashSessionToken(token), expiresAt, metadata);

    return { token, expiresAt: expiresAt.toISOString(), user: toPublicUser(session) };
  }

  async authenticate(token: string, allowLocked = false): Promise<SessionRecord> {
    const session = await this.store.findSessionByTokenHash(hashSessionToken(token));
    const now = new Date();

    if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Please sign in again.");
    }

    if (session.isLocked && !allowLocked) {
      throw new AppError(423, "SESSION_LOCKED", "This session is locked.");
    }

    return session;
  }

  async getCurrentUser(token: string): Promise<AuthenticatedUser> {
    return toPublicUser(await this.authenticate(token));
  }

  async logout(token: string, metadata: LoginMetadata = {}): Promise<void> {
    const session = await this.authenticate(token, true);
    await this.store.revokeSession(session.id, metadata);
  }

  async lock(token: string, metadata: LoginMetadata = {}): Promise<void> {
    const session = await this.authenticate(token);
    await this.store.setSessionLocked(session.id, true, metadata);
  }

  async unlock(token: string, password: string, metadata: LoginMetadata = {}): Promise<AuthenticatedUser> {
    const session = await this.authenticate(token, true);
    if (!(await verifyPassword(session.user.passwordHash, password))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "The password is incorrect.");
    }
    await this.store.setSessionLocked(session.id, false, metadata);
    return toPublicUser({ ...session, isLocked: false });
  }

  async changePassword(token: string, currentPassword: string, newPassword: string, metadata: LoginMetadata = {}): Promise<AuthenticatedUser> {
    const session = await this.authenticate(token, true);
    if (!(await verifyPassword(session.user.passwordHash, currentPassword))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "The current password is incorrect.");
    }
    if (newPassword.length < 12) throw new AppError(400, "WEAK_PASSWORD", "Use at least 12 characters for the new password.");
    if (currentPassword === newPassword) throw new AppError(400, "PASSWORD_REUSED", "The new password must be different.");
    const passwordHash = await hashPassword(newPassword);
    await this.store.changePassword(session.user.id, session.id, passwordHash, metadata);
    return toPublicUser({ ...session, user: { ...session.user, passwordHash, mustChangePassword: false }, isLocked: false });
  }

  async reauthenticate(token: string, password: string): Promise<SessionRecord> {
    const session = await this.authenticate(token);
    if (!(await verifyPassword(session.user.passwordHash, password))) throw new AppError(401, "INVALID_CREDENTIALS", "The password is incorrect.");
    return session;
  }

  requirePermission(session: SessionRecord, permission: PermissionCode): void {
    if (!session.permissions.includes(permission)) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
    }
  }
}

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function toPublicUser(session: SessionRecord): AuthenticatedUser {
  return {
    id: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    roles: session.roles,
    permissions: session.permissions,
    mustChangePassword: session.user.mustChangePassword
  };
}
