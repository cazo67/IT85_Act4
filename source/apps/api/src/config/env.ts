import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BCIS_API_HOST: z.string().min(1).default("127.0.0.1"),
  BCIS_API_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  BCIS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().url().optional(),
  BCIS_BACKUP_ROOT: z.string().min(1).default("backups"),
  BCIS_PG_DUMP_PATH: z.string().min(1).default("pg_dump"),
  BCIS_PG_RESTORE_PATH: z.string().min(1).default("pg_restore"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type ApiEnvironment = z.infer<typeof envSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const message = z.prettifyError(parsed.error);
    throw new Error(`Invalid API environment configuration:\n${message}`);
  }

  return parsed.data;
}
