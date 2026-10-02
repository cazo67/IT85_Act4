import "./load-environment.js";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(scriptDirectory, "../migrations");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.info("BCIS database migrations are up to date.");
} finally {
  await pool.end();
}
