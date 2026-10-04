import "./load-environment.js";

import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(scriptDirectory, "../migrations");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
let client: PoolClient | undefined;

try {
  client = await pool.connect();
  await client.query("select pg_advisory_lock(hashtext('bcis-schema-migrations'))");
  const database = drizzle(client);
  const dialect = new PgDialect();
  for (const migration of readMigrationFiles({ migrationsFolder })) {
    await dialect.migrate([migration], database._.session as unknown as Parameters<PgDialect["migrate"]>[1], { migrationsFolder });
  }
  console.info("BCIS database migrations are up to date.");
} finally {
  if (client) {
    await client.query("select pg_advisory_unlock(hashtext('bcis-schema-migrations'))").catch(() => undefined);
    client.release();
  }
  await pool.end();
}
