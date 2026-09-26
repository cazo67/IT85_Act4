import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { invoices } from "./billing.js";
import { users } from "./security.js";
import { serviceAccounts, subscribers } from "./subscribers.js";

export const paymentMethod = pgEnum("payment_method", ["CASH", "GCASH"]);
export const paymentStatus = pgEnum("payment_status", ["POSTED", "REVERSED"]);
export const creditStatus = pgEnum("credit_status", ["AVAILABLE", "CONSUMED", "REFUNDED"]);
export const proofStatus = pgEnum("payment_proof_status", ["PENDING", "VERIFIED", "REJECTED"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", ["INVOICE_DEBIT", "PAYMENT_CREDIT", "PAYMENT_REVERSAL_DEBIT", "ADJUSTMENT_DEBIT", "ADJUSTMENT_CREDIT", "VOID_CREDIT"]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentNumber: text("payment_number").notNull(),
  commandKey: text("command_key").notNull(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  method: paymentMethod("method").notNull(),
  amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
  externalReference: text("external_reference"),
  normalizedExternalReference: text("normalized_external_reference"),
  status: paymentStatus("status").notNull().default("POSTED"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  postedBy: uuid("posted_by").references(() => users.id, { onDelete: "restrict" }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("payments_number_uidx").on(table.paymentNumber),
  uniqueIndex("payments_command_uidx").on(table.commandKey),
  uniqueIndex("payments_gcash_reference_uidx").on(table.normalizedExternalReference).where(sql`${table.method} = 'GCASH' and ${table.normalizedExternalReference} is not null`),
  index("payments_subscriber_time_idx").on(table.subscriberId, table.paidAt),
  check("payments_amount_positive_chk", sql`${table.amountCentavos} > 0`),
  check("payments_reference_chk", sql`(${table.method} = 'CASH' and ${table.normalizedExternalReference} is null) or (${table.method} = 'GCASH' and ${table.normalizedExternalReference} is not null)`)
]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequenceNumber: bigint("sequence_number", { mode: "bigint" }).notNull(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").references(() => serviceAccounts.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
  type: ledgerEntryType("type").notNull(),
  description: text("description").notNull(),
  debitCentavos: bigint("debit_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  creditCentavos: bigint("credit_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" })
}, (table) => [
  uniqueIndex("ledger_entries_sequence_uidx").on(table.sequenceNumber),
  uniqueIndex("ledger_entries_invoice_type_uidx").on(table.invoiceId, table.type),
  uniqueIndex("ledger_entries_payment_type_uidx").on(table.paymentId, table.type),
  index("ledger_entries_subscriber_time_idx").on(table.subscriberId, table.occurredAt, table.id),
  check("ledger_entries_exclusive_amount_chk", sql`(${table.debitCentavos} > 0 and ${table.creditCentavos} = 0) or (${table.creditCentavos} > 0 and ${table.debitCentavos} = 0)`)
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
  isReversed: boolean("is_reversed").notNull().default(false),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("payment_allocations_payment_invoice_uidx").on(table.paymentId, table.invoiceId),
  index("payment_allocations_invoice_idx").on(table.invoiceId),
  check("payment_allocations_amount_positive_chk", sql`${table.amountCentavos} > 0`)
]);

export const subscriberCredits = pgTable("subscriber_credits", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  sourcePaymentId: uuid("source_payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  originalCentavos: bigint("original_centavos", { mode: "bigint" }).notNull(),
  remainingCentavos: bigint("remaining_centavos", { mode: "bigint" }).notNull(),
  status: creditStatus("status").notNull().default("AVAILABLE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("subscriber_credits_source_uidx").on(table.sourcePaymentId),
  index("subscriber_credits_subscriber_idx").on(table.subscriberId, table.status),
  check("subscriber_credits_values_chk", sql`${table.originalCentavos} > 0 and ${table.remainingCentavos} >= 0 and ${table.remainingCentavos} <= ${table.originalCentavos}`)
]);

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptNumber: text("receipt_number").notNull(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "restrict" }),
  voidedAt: timestamp("voided_at", { withTimezone: true })
}, (table) => [
  uniqueIndex("receipts_number_uidx").on(table.receiptNumber),
  uniqueIndex("receipts_payment_uidx").on(table.paymentId)
]);

export const paymentReversals = pgTable("payment_reversals", {
  id: uuid("id").defaultRandom().primaryKey(),
  reversalNumber: text("reversal_number").notNull(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  reversedBy: uuid("reversed_by").references(() => users.id, { onDelete: "restrict" }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("payment_reversals_number_uidx").on(table.reversalNumber),
  uniqueIndex("payment_reversals_payment_uidx").on(table.paymentId),
  check("payment_reversals_reason_chk", sql`length(trim(${table.reason})) >= 10`)
]);

export const paymentProofs = pgTable("payment_proofs", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  externalReference: text("external_reference").notNull(),
  normalizedExternalReference: text("normalized_external_reference").notNull(),
  originalFileName: text("original_file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  mediaType: text("media_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
  sha256: text("sha256").notNull(),
  status: proofStatus("status").notNull().default("PENDING"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewReason: text("review_reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("payment_proofs_reference_uidx").on(table.normalizedExternalReference),
  uniqueIndex("payment_proofs_storage_key_uidx").on(table.storageKey),
  index("payment_proofs_status_time_idx").on(table.status, table.createdAt),
  check("payment_proofs_size_chk", sql`${table.sizeBytes} > 0`)
]);
