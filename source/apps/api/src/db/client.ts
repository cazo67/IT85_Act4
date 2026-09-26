import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

export type BcisDatabase = ReturnType<typeof createDrizzleDatabase>;

function createDrizzleDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

export interface DatabaseHandle {
  check: () => Promise<void>;
  close: () => Promise<void>;
  db: BcisDatabase;
}

export function createDatabase(databaseUrl: string): DatabaseHandle {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const db = createDrizzleDatabase(pool);

  return {
    db,
    async check() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    }
  };
}
