import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { payments } from "./payments.js";
import { users } from "./security.js";
import { serviceAccounts } from "./subscribers.js";

export const serviceControlStatus = pgEnum("service_control_status", ["REQUESTED", "APPROVED", "COMPLETED", "REJECTED", "CANCELLED"]);

export const suspensionRecords = pgTable("suspension_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  asOfDate: date("as_of_date").notNull(),
  outstandingCentavosSnapshot: bigint("outstanding_centavos_snapshot", { mode: "bigint" }).notNull(),
  reason: text("reason").notNull(),
  status: serviceControlStatus("status").notNull().default("REQUESTED"),
  requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "restrict" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  decisionNotes: text("decision_notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("suspension_records_open_service_uidx").on(table.serviceAccountId).where(sql`${table.status} in ('REQUESTED', 'APPROVED')`),
  index("suspension_records_status_time_idx").on(table.status, table.requestedAt),
  check("suspension_records_reason_chk", sql`length(trim(${table.reason})) >= 10`),
  check("suspension_records_amount_chk", sql`${table.outstandingCentavosSnapshot} >= 0`)
]);

export const reconnectionRecords = pgTable("reconnection_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  suspensionId: uuid("suspension_id").notNull().references(() => suspensionRecords.id, { onDelete: "restrict" }),
  qualifyingPaymentId: uuid("qualifying_payment_id").references(() => payments.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  status: serviceControlStatus("status").notNull().default("REQUESTED"),
  requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "restrict" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  decisionNotes: text("decision_notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("reconnection_records_open_service_uidx").on(table.serviceAccountId).where(sql`${table.status} in ('REQUESTED', 'APPROVED')`),
  index("reconnection_records_status_time_idx").on(table.status, table.requestedAt),
  check("reconnection_records_reason_chk", sql`length(trim(${table.reason})) >= 10`)
]);
