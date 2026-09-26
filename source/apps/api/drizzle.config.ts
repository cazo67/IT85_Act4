import "dotenv/config";

import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Drizzle commands. Copy and review .env.example first.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/**/*.ts",
  out: "../../../database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL
  },
  strict: true,
  verbose: true
});

