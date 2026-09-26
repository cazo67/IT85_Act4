import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const numberSequences = pgTable("number_sequences", {
  code: text("code").primaryKey(),
  lastValue: bigint("last_value", { mode: "bigint" }).notNull().default(sql`0`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    normalizedUsername: text("normalized_username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("users_normalized_username_uidx").on(table.normalizedUsername),
    index("users_active_idx").on(table.isActive)
  ]
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("roles_code_uidx").on(table.code)]
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    description: text("description").notNull().default("")
  },
  (table) => [uniqueIndex("permissions_code_uidx").on(table.code)]
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "restrict" })
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })]
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "restrict" })
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    isLocked: boolean("is_locked").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_uidx").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt)
  ]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    normalizedUsername: text("normalized_username").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    wasSuccessful: boolean("was_successful").notNull(),
    remoteAddress: text("remote_address"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("login_attempts_username_time_idx").on(table.normalizedUsername, table.occurredAt)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorSessionId: uuid("actor_session_id").references(() => authSessions.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    reason: text("reason"),
    requestId: text("request_id"),
    beforeValues: jsonb("before_values"),
    afterValues: jsonb("after_values"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_actor_time_idx").on(table.actorUserId, table.occurredAt),
    index("audit_logs_action_time_idx").on(table.action, table.occurredAt),
    index("audit_logs_time_idx").on(table.occurredAt)
  ]
);
