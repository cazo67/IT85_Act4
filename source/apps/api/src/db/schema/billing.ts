import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./security.js";
import { serviceAccounts, subscribers } from "./subscribers.js";

export const billingCycleStatus = pgEnum("billing_cycle_status", ["DRAFT", "FINALIZED"]);
export const invoiceStatus = pgEnum("invoice_status", ["OPEN", "PARTIALLY_PAID", "PAID", "VOID"]);
export const invoiceItemType = pgEnum("invoice_item_type", ["PLAN_SERVICE", "ADJUSTMENT"]);

export const billingCycles = pgTable("billing_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  periodKey: text("period_key").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: billingCycleStatus("status").notNull().default("DRAFT"),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  finalizedBy: uuid("finalized_by").references(() => users.id, { onDelete: "restrict" }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("billing_cycles_period_uidx").on(table.periodKey),
  check("billing_cycles_period_key_chk", sql`${table.periodKey} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
  check("billing_cycles_dates_chk", sql`${table.periodStart} <= ${table.periodEnd}`)
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  billingCycleId: uuid("billing_cycle_id").notNull().references(() => billingCycles.id, { onDelete: "restrict" }),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: invoiceStatus("status").notNull().default("OPEN"),
  subtotalCentavos: bigint("subtotal_centavos", { mode: "bigint" }).notNull(),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
  paidCentavos: bigint("paid_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  planCodeSnapshot: text("plan_code_snapshot").notNull(),
  planNameSnapshot: text("plan_name_snapshot").notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("invoices_number_uidx").on(table.invoiceNumber),
  uniqueIndex("invoices_service_cycle_uidx").on(table.serviceAccountId, table.billingCycleId),
  index("invoices_subscriber_date_idx").on(table.subscriberId, table.invoiceDate),
  index("invoices_status_due_idx").on(table.status, table.dueDate),
  check("invoices_amounts_chk", sql`${table.subtotalCentavos} > 0 and ${table.totalCentavos} > 0 and ${table.totalCentavos} = ${table.subtotalCentavos} and ${table.paidCentavos} >= 0 and ${table.paidCentavos} <= ${table.totalCentavos}`)
]);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  type: invoiceItemType("type").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCentavos: bigint("unit_amount_centavos", { mode: "bigint" }).notNull(),
  totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("invoice_items_invoice_idx").on(table.invoiceId),
  check("invoice_items_values_chk", sql`${table.quantity} > 0 and ${table.unitAmountCentavos} > 0 and ${table.totalCentavos} = ${table.quantity} * ${table.unitAmountCentavos}`)
]);

export const billingIdempotency = pgTable("billing_idempotency", {
  id: uuid("id").defaultRandom().primaryKey(),
  commandKey: text("command_key").notNull(),
  billingCycleId: uuid("billing_cycle_id").notNull().references(() => billingCycles.id, { onDelete: "restrict" }),
  responsePayload: jsonb("response_payload").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("billing_idempotency_command_uidx").on(table.commandKey)]);
