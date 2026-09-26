import type { PermissionCode, RoleCode } from "@bcis/shared";

export interface AuthUserRecord {
  id: string;
  username: string;
  normalizedUsername: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  user: AuthUserRecord;
  roles: RoleCode[];
  permissions: PermissionCode[];
  isLocked: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface LoginMetadata {
  remoteAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AuthStore {
  findUserByNormalizedUsername(normalizedUsername: string): Promise<AuthUserRecord | null>;
  recordFailedLogin(user: AuthUserRecord | null, normalizedUsername: string, lockedUntil: Date | null, metadata: LoginMetadata): Promise<void>;
  recordSuccessfulLogin(userId: string, metadata: LoginMetadata): Promise<void>;
  createSession(userId: string, tokenHash: string, expiresAt: Date, metadata: LoginMetadata): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(sessionId: string, metadata: LoginMetadata): Promise<void>;
  setSessionLocked(sessionId: string, locked: boolean, metadata: LoginMetadata): Promise<void>;
  changePassword(userId: string, sessionId: string, passwordHash: string, metadata: LoginMetadata): Promise<void>;
}
