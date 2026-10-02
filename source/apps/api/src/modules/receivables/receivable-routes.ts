import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { ReceivableService } from "./receivable-service.js";

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const parsed = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, "Use a valid calendar date.");
const centavos = z.string().regex(/^(0|[1-9]\d*)$/);
const workflowBody = z.object({ version: z.number().int().positive(), notes: z.string().trim().max(1000).default("") });
const listQuery = z.object({ asOf: date, search: z.string().trim().min(1).max(100).optional(), bucket: z.enum(["CURRENT", "DAYS_1_30", "DAYS_31_60", "DAYS_61_90", "DAYS_91_PLUS"]).optional(), areaId: id.optional(), collectorId: id.optional(), planId: id.optional(), serviceTypeId: id.optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });

export function registerReceivableRoutes(app: FastifyInstance, auth: AuthService, service: ReceivableService): void {
  app.get("/api/v1/receivables", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    const query = listQuery.extend({ overdueOnly: z.stringbool().default(false) }).parse(request.query);
    return { data: await service.list(query) };
  });
  app.get("/api/v1/receivables/overdue-accounts", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    return { data: await service.overdueAccounts(listQuery.parse(request.query)) };
  });
  app.get("/api/v1/receivables/filter-options", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    return { data: await service.filterOptions() };
  });
  app.get("/api/v1/receivables/aging", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    return { data: await service.aging(z.object({ asOf: date }).parse(request.query).asOf) };
  });
  app.get("/api/v1/receivables/suspension-candidates", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    const query = z.object({ asOf: date, minimumDaysOverdue: z.coerce.number().int().min(1).max(3650), minimumBalanceCentavos: centavos }).parse(request.query);
    return { data: await service.candidates(query) };
  });
  app.get("/api/v1/service-control", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    return { data: await service.listServiceControl() };
  });
  app.post("/api/v1/suspensions", async (request) => {
    const session = await authorizeRequest(auth, request, "service.suspend");
    const body = parseBody(z.object({ serviceAccountId: id, asOf: date, reason: z.string().trim().min(10).max(1000) }), request.body);
    return { data: await service.requestSuspension(body, actor(session.id, session.user.id, request.id)) };
  });
  app.post("/api/v1/suspensions/:id/approve", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "service.suspend");
    await service.approveSuspension(z.object({ id }).parse(request.params).id, parseBody(workflowBody, request.body), actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
  app.post("/api/v1/suspensions/:id/complete", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "service.suspend");
    const body = parseBody(z.object({ version: z.number().int().positive() }), request.body);
    await service.completeSuspension(z.object({ id }).parse(request.params).id, body.version, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
  app.post("/api/v1/reconnections", async (request) => {
    const session = await authorizeRequest(auth, request, "service.reconnect");
    const body = parseBody(z.object({ serviceAccountId: id, reason: z.string().trim().min(10).max(1000), qualifyingPaymentId: id.optional() }), request.body);
    return { data: await service.requestReconnection(body, actor(session.id, session.user.id, request.id)) };
  });
  app.post("/api/v1/reconnections/:id/approve", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "service.reconnect");
    await service.approveReconnection(z.object({ id }).parse(request.params).id, parseBody(workflowBody, request.body), actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
  app.post("/api/v1/reconnections/:id/complete", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "service.reconnect");
    const body = parseBody(z.object({ version: z.number().int().positive() }), request.body);
    await service.completeReconnection(z.object({ id }).parse(request.params).id, body.version, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor { return { sessionId, userId, requestId }; }
