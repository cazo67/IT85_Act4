import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest } from "../auth/auth-routes.js";
import type { AuditService } from "./audit-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerAuditRoutes(app: FastifyInstance, auth: AuthService, service: AuditService): void {
  app.get("/api/v1/audit-logs", async (request) => {
    await authorizeRequest(auth, request, "audit.view");
    const query = z.object({ action: z.string().trim().max(100).optional(), entityType: z.string().trim().max(100).optional(), dateFrom: date.optional(), dateTo: date.optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return { data: await service.list(query) };
  });
}
