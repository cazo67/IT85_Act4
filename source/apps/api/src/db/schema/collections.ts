import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { payments } from "./payments.js";
import { users } from "./security.js";
import { collectionRoutes, collectors, serviceAccounts, subscribers } from "./subscribers.js";

export const collectionBatchStatus = pgEnum("collection_batch_status", ["DRAFT", "ACTIVE", "SUBMITTED", "RECONCILED", "CLOSED", "REMITTED"]);
export const batchAccountStatus = pgEnum("batch_account_status", ["PENDING", "PARTIAL", "COLLECTED"]);

export const collectionBatches = pgTable("collection_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchNumber: text("batch_number").notNull(),
  collectorId: uuid("collector_id").notNull().references(() => collectors.id, { onDelete: "restrict" }),
  routeId: uuid("route_id").notNull().references(() => collectionRoutes.id, { onDelete: "restrict" }),
  collectionDate: date("collection_date").notNull(),
  status: collectionBatchStatus("status").notNull().default("DRAFT"),
  expectedCashCentavos: bigint("expected_cash_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  collectedCashCentavos: bigint("collected_cash_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  nonCashCentavos: bigint("non_cash_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  remittedCashCentavos: bigint("remitted_cash_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  differenceCentavos: bigint("difference_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("collection_batches_number_uidx").on(table.batchNumber),
  uniqueIndex("collection_batches_collector_route_date_uidx").on(table.collectorId, table.routeId, table.collectionDate),
  index("collection_batches_status_date_idx").on(table.status, table.collectionDate),
  check("collection_batches_nonnegative_chk", sql`${table.expectedCashCentavos} >= 0 and ${table.collectedCashCentavos} >= 0 and ${table.nonCashCentavos} >= 0 and ${table.remittedCashCentavos} >= 0`),
  check("collection_batches_difference_chk", sql`${table.differenceCentavos} = ${table.remittedCashCentavos} - ${table.collectedCashCentavos}`)
]);

export const collectionBatchAccounts = pgTable("collection_batch_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => collectionBatches.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  accountNumberSnapshot: text("account_number_snapshot").notNull(),
  subscriberNameSnapshot: text("subscriber_name_snapshot").notNull(),
  serviceNumberSnapshot: text("service_number_snapshot").notNull(),
  addressSnapshot: text("address_snapshot"),
  currentBillCentavosSnapshot: bigint("current_bill_centavos_snapshot", { mode: "bigint" }),
  arrearsCentavosSnapshot: bigint("arrears_centavos_snapshot", { mode: "bigint" }),
  expectedCentavos: bigint("expected_centavos", { mode: "bigint" }).notNull(),
  collectedCentavos: bigint("collected_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  status: batchAccountStatus("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("collection_batch_accounts_service_uidx").on(table.batchId, table.serviceAccountId),
  index("collection_batch_accounts_subscriber_idx").on(table.batchId, table.subscriberId),
  check("collection_batch_accounts_amounts_chk", sql`${table.expectedCentavos} >= 0 and ${table.collectedCentavos} >= 0 and ${table.collectedCentavos} <= ${table.expectedCentavos}`),
  check("collection_batch_accounts_route_snapshot_chk", sql`(${table.addressSnapshot} is null and ${table.currentBillCentavosSnapshot} is null and ${table.arrearsCentavosSnapshot} is null) or (${table.addressSnapshot} is not null and ${table.currentBillCentavosSnapshot} >= 0 and ${table.arrearsCentavosSnapshot} >= 0 and ${table.currentBillCentavosSnapshot} + ${table.arrearsCentavosSnapshot} = ${table.expectedCentavos})`)
]);

export const batchCollectionEntries = pgTable("batch_collection_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => collectionBatches.id, { onDelete: "restrict" }),
  batchAccountId: uuid("batch_account_id").notNull().references(() => collectionBatchAccounts.id, { onDelete: "restrict" }),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("batch_collection_entries_payment_uidx").on(table.paymentId),
  index("batch_collection_entries_batch_idx").on(table.batchId, table.recordedAt),
  check("batch_collection_entries_amount_chk", sql`${table.amountCentavos} > 0`)
]);

export const collectorRemittances = pgTable("collector_remittances", {
  id: uuid("id").defaultRandom().primaryKey(),
  remittanceNumber: text("remittance_number").notNull(),
  batchId: uuid("batch_id").notNull().references(() => collectionBatches.id, { onDelete: "restrict" }),
  remittedCashCentavos: bigint("remitted_cash_centavos", { mode: "bigint" }).notNull(),
  differenceCentavos: bigint("difference_centavos", { mode: "bigint" }).notNull(),
  notes: text("notes").notNull().default(""),
  remittedBy: uuid("remitted_by").references(() => users.id, { onDelete: "restrict" }),
  remittedAt: timestamp("remitted_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("collector_remittances_number_uidx").on(table.remittanceNumber),
  uniqueIndex("collector_remittances_batch_uidx").on(table.batchId),
  check("collector_remittances_cash_chk", sql`${table.remittedCashCentavos} >= 0`)
]);

export const batchReconciliations = pgTable("batch_reconciliations", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => collectionBatches.id, { onDelete: "restrict" }),
  expectedCentavos: bigint("expected_centavos", { mode: "bigint" }).notNull(),
  collectedCashCentavos: bigint("collected_cash_centavos", { mode: "bigint" }).notNull(),
  remittedCashCentavos: bigint("remitted_cash_centavos", { mode: "bigint" }).notNull(),
  nonCashCentavos: bigint("non_cash_centavos", { mode: "bigint" }).notNull(),
  differenceCentavos: bigint("difference_centavos", { mode: "bigint" }).notNull(),
  notes: text("notes").notNull().default(""),
  reconciledBy: uuid("reconciled_by").references(() => users.id, { onDelete: "restrict" }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("batch_reconciliations_batch_uidx").on(table.batchId),
  check("batch_reconciliations_balanced_chk", sql`${table.differenceCentavos} = 0 and ${table.remittedCashCentavos} = ${table.collectedCashCentavos}`)
]);
