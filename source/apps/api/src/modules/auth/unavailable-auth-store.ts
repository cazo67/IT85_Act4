import { AppError } from "../../app/app-error.js";
import type { AuthStore, AuthUserRecord, LoginMetadata, SessionRecord } from "./auth-store.js";

export class UnavailableAuthStore implements AuthStore {
  private unavailable(): never {
    throw new AppError(503, "DATABASE_UNAVAILABLE", "Authentication is unavailable until the database is connected.");
  }

  async findUserByNormalizedUsername(_username: string): Promise<AuthUserRecord | null> { return this.unavailable(); }
  async recordFailedLogin(_user: AuthUserRecord | null, _username: string, _lockedUntil: Date | null, _metadata: LoginMetadata): Promise<void> { return this.unavailable(); }
  async recordSuccessfulLogin(_userId: string, _metadata: LoginMetadata): Promise<void> { return this.unavailable(); }
  async createSession(_userId: string, _tokenHash: string, _expiresAt: Date, _metadata: LoginMetadata): Promise<SessionRecord> { return this.unavailable(); }
  async findSessionByTokenHash(_tokenHash: string): Promise<SessionRecord | null> { return this.unavailable(); }
  async revokeSession(_sessionId: string, _metadata: LoginMetadata): Promise<void> { return this.unavailable(); }
  async setSessionLocked(_sessionId: string, _locked: boolean, _metadata: LoginMetadata): Promise<void> { return this.unavailable(); }
  async changePassword(_userId: string, _sessionId: string, _passwordHash: string, _metadata: LoginMetadata): Promise<void> { return this.unavailable(); }
}

