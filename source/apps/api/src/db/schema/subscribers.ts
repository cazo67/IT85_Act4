import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { users } from "./security.js";

export const subscriberStatus = pgEnum("subscriber_status", ["ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"]);
export const addressType = pgEnum("address_type", ["BILLING", "SERVICE", "MAILING", "OTHER"]);
export const contactType = pgEnum("contact_type", ["MOBILE", "PHONE", "EMAIL", "OTHER"]);
export const serviceAccountStatus = pgEnum("service_account_status", ["PENDING", "ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"]);
export const serviceEventType = pgEnum("service_event_type", ["CREATED", "ACTIVATED", "PLAN_CHANGED", "ADDRESS_CHANGED", "SUSPENDED", "RECONNECTED", "DISCONNECTED", "TERMINATED", "NOTE"]);

export const serviceTypes = pgTable("service_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true)
}, (table) => [uniqueIndex("service_types_code_uidx").on(table.code)]);

export const servicePlans = pgTable("service_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  serviceTypeId: uuid("service_type_id").notNull().references(() => serviceTypes.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCentavos: bigint("price_centavos", { mode: "bigint" }).notNull(),
  installationFeeCentavos: bigint("installation_fee_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  reconnectionFeeCentavos: bigint("reconnection_fee_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  internetSpeedMbps: integer("internet_speed_mbps"),
  cableChannelCount: integer("cable_channel_count"),
  isActive: boolean("is_active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("service_plans_code_uidx").on(table.code),
  index("service_plans_type_active_idx").on(table.serviceTypeId, table.isActive),
  check("service_plans_price_nonnegative_chk", sql`${table.priceCentavos} >= 0 and ${table.installationFeeCentavos} >= 0 and ${table.reconnectionFeeCentavos} >= 0`),
  check("service_plans_speed_channels_positive_chk", sql`(${table.internetSpeedMbps} is null or ${table.internetSpeedMbps} > 0) and (${table.cableChannelCount} is null or ${table.cableChannelCount} > 0)`)
]);

export const collectionAreas = pgTable("collection_areas", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("collection_areas_code_uidx").on(table.code)]);

export const collectionRoutes = pgTable("collection_routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  areaId: uuid("area_id").notNull().references(() => collectionAreas.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  scheduleNotes: text("schedule_notes").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("collection_routes_code_uidx").on(table.code),
  index("collection_routes_area_idx").on(table.areaId)
]);

export const collectors = pgTable("collectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  displayName: text("display_name").notNull(),
  contactNumber: text("contact_number"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("collectors_code_uidx").on(table.code),
  index("collectors_active_idx").on(table.isActive)
]);

export const subscribers = pgTable("subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountNumber: text("account_number").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  suffix: text("suffix"),
  normalizedName: text("normalized_name").notNull(),
  status: subscriberStatus("status").notNull().default("ACTIVE"),
  billingDay: integer("billing_day").notNull(),
  dueDay: integer("due_day").notNull(),
  collectionAreaId: uuid("collection_area_id").references(() => collectionAreas.id, { onDelete: "restrict" }),
  assignedCollectorId: uuid("assigned_collector_id").references(() => collectors.id, { onDelete: "restrict" }),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("subscribers_account_number_uidx").on(table.accountNumber),
  index("subscribers_normalized_name_idx").using("gin", sql`${table.normalizedName} gin_trgm_ops`),
  index("subscribers_status_area_idx").on(table.status, table.collectionAreaId),
  index("subscribers_collector_idx").on(table.assignedCollectorId),
  check("subscribers_billing_day_chk", sql`${table.billingDay} between 1 and 28`),
  check("subscribers_due_day_chk", sql`${table.dueDay} between 1 and 28`)
]);

export const subscriberAddresses = pgTable("subscriber_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  type: addressType("type").notNull(),
  label: text("label").notNull().default(""),
  line1: text("line1").notNull(),
  line2: text("line2"),
  barangay: text("barangay").notNull(),
  cityMunicipality: text("city_municipality").notNull(),
  province: text("province").notNull(),
  postalCode: text("postal_code"),
  normalizedSearch: text("normalized_search").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("subscriber_addresses_subscriber_idx").on(table.subscriberId),
  index("subscriber_addresses_search_idx").using("gin", sql`${table.normalizedSearch} gin_trgm_ops`)
]);

export const subscriberContacts = pgTable("subscriber_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  type: contactType("type").notNull(),
  value: text("value").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("subscriber_contacts_subscriber_idx").on(table.subscriberId),
  index("subscriber_contacts_value_idx").using("gin", sql`${table.normalizedValue} gin_trgm_ops`)
]);

export const serviceAccounts = pgTable("service_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountNumber: text("service_account_number").notNull(),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "restrict" }),
  planId: uuid("plan_id").notNull().references(() => servicePlans.id, { onDelete: "restrict" }),
  installationAddressId: uuid("installation_address_id").notNull().references(() => subscriberAddresses.id, { onDelete: "restrict" }),
  assignedCollectorId: uuid("assigned_collector_id").references(() => collectors.id, { onDelete: "restrict" }),
  activationDate: date("activation_date"),
  billingStartDate: date("billing_start_date").notNull(),
  billingDay: integer("billing_day").notNull(),
  dueDay: integer("due_day").notNull(),
  currentRateCentavos: bigint("current_rate_centavos", { mode: "bigint" }).notNull(),
  status: serviceAccountStatus("status").notNull().default("PENDING"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("service_accounts_number_uidx").on(table.serviceAccountNumber),
  index("service_accounts_subscriber_idx").on(table.subscriberId),
  index("service_accounts_status_collector_idx").on(table.status, table.assignedCollectorId),
  check("service_accounts_days_chk", sql`${table.billingDay} between 1 and 28 and ${table.dueDay} between 1 and 28`),
  check("service_accounts_rate_nonnegative_chk", sql`${table.currentRateCentavos} >= 0`)
]);

export const serviceEvents = pgTable("service_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  type: serviceEventType("type").notNull(),
  description: text("description").notNull(),
  oldStatus: serviceAccountStatus("old_status"),
  newStatus: serviceAccountStatus("new_status"),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("service_events_account_time_idx").on(table.serviceAccountId, table.occurredAt)]);

export const collectorAssignments = pgTable("collector_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  collectorId: uuid("collector_id").notNull().references(() => collectors.id, { onDelete: "restrict" }),
  routeId: uuid("route_id").references(() => collectionRoutes.id, { onDelete: "restrict" }),
  serviceAccountId: uuid("service_account_id").notNull().references(() => serviceAccounts.id, { onDelete: "restrict" }),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("collector_assignments_active_service_uidx").on(table.serviceAccountId).where(sql`${table.effectiveTo} is null`),
  index("collector_assignments_collector_idx").on(table.collectorId, table.effectiveFrom)
]);
