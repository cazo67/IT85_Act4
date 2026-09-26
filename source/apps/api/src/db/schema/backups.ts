import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./security.js";

export const backupStatus = pgEnum("backup_status", ["RUNNING", "CREATED", "VERIFIED", "FAILED", "RESTORED"]);

export const backupRuns = pgTable("backup_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: backupStatus("status").notNull().default("RUNNING"),
  backupDirectory: text("backup_directory").notNull(),
  databaseFile: text("database_file").notNull(),
  manifestFile: text("manifest_file").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }),
  sha256: text("sha256"),
  financialSnapshot: jsonb("financial_snapshot"),
  verificationMessage: text("verification_message"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "restrict" }),
  restoredBy: uuid("restored_by").references(() => users.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  restoredAt: timestamp("restored_at", { withTimezone: true })
}, (table) => [index("backup_runs_status_started_idx").on(table.status, table.startedAt)]);
