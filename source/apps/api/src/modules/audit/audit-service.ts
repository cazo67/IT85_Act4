import { and, desc, eq, gte, lte } from "drizzle-orm";

import type { BcisDatabase } from "../../db/client.js";
import { auditLogs, users } from "../../db/schema/index.js";

export class AuditService {
  constructor(private readonly db: BcisDatabase) {}

  async list(input: { action?: string | undefined; entityType?: string | undefined; dateFrom?: string | undefined; dateTo?: string | undefined; page: number; pageSize: number }) {
    const conditions = [];
    if (input.action) conditions.push(eq(auditLogs.action, input.action));
    if (input.entityType) conditions.push(eq(auditLogs.entityType, input.entityType));
    if (input.dateFrom) conditions.push(gte(auditLogs.occurredAt, new Date(`${input.dateFrom}T00:00:00.000Z`)));
    if (input.dateTo) conditions.push(lte(auditLogs.occurredAt, new Date(`${input.dateTo}T23:59:59.999Z`)));
    const rows = await this.db.select({ log: auditLogs, actorDisplayName: users.displayName, actorUsername: users.username }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
    return { items: rows.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }
}
