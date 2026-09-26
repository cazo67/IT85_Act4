import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { ReportService } from "./report-service.js";

const reportCode = z.enum(["monthly-collections", "ar-aging", "subscriber-soa", "collector-reconciliation"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({ asOf: date.optional(), dateFrom: date.optional(), dateTo: date.optional(), subscriberId: z.string().uuid().optional() });

export function registerReportRoutes(app: FastifyInstance, auth: AuthService, service: ReportService): void {
  app.get("/api/v1/dashboard", async (request) => {
    await authorizeRequest(auth, request, "dashboard.view");
    return { data: await service.dashboard(z.object({ asOf: date }).parse(request.query).asOf) };
  });
  app.get("/api/v1/reports", async (request) => {
    await authorizeRequest(auth, request, "report.view");
    return { data: service.definitions() };
  });
  app.get("/api/v1/reports/:code/preview", async (request) => {
    const session = await authorizeRequest(auth, request, "report.view");
    const code = reportCode.parse(z.object({ code: z.string() }).parse(request.params).code);
    return { data: await service.run(code, querySchema.parse(request.query), session.user.displayName) };
  });
  app.get("/api/v1/reports/:code/export", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "report.export");
    const code = reportCode.parse(z.object({ code: z.string() }).parse(request.params).code);
    const query = querySchema.extend({ format: z.enum(["pdf", "xlsx"]) }).parse(request.query);
    const output = await service.export(code, query, query.format, session.user.displayName, actor(session.id, session.user.id, request.id));
    return reply.header("content-type", output.mediaType).header("content-disposition", `attachment; filename="${output.filename}"`).header("cache-control", "no-store").send(output.buffer);
  });
}
function actor(sessionId: string, userId: string, requestId: string): SecurityActor { return { sessionId, userId, requestId }; }
