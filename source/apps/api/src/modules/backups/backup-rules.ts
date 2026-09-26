import { relative, resolve } from "node:path";

import { AppError } from "../../app/app-error.js";

export function expectedRestoreConfirmation(backupId: string): string { return `RESTORE ${backupId}`; }

export function requireRestoreConfirmation(backupId: string, confirmation: string): void {
  if (confirmation !== expectedRestoreConfirmation(backupId)) throw new AppError(400, "RESTORE_CONFIRMATION_MISMATCH", `Type ${expectedRestoreConfirmation(backupId)} exactly.`);
}

export function requirePathInside(root: string, candidate: string): string {
  const safeRoot = resolve(root);
  const safeCandidate = resolve(candidate);
  const child = relative(safeRoot, safeCandidate);
  if (!child || child.startsWith("..") || /^[A-Za-z]:/.test(child)) throw new AppError(500, "UNSAFE_BACKUP_PATH", "The backup path is outside the configured backup root.");
  return safeCandidate;
}

export function postgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new AppError(500, "INVALID_DATABASE_URL", "Backup requires a PostgreSQL database URL.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new AppError(500, "INVALID_DATABASE_URL", "The PostgreSQL database name is missing.");
  const environment: NodeJS.ProcessEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database };
  delete environment.DATABASE_URL;
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}
