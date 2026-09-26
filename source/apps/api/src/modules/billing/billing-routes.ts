import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../app/app-error.js";
import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { BillingService } from "./billing-service.js";

const id = z.string().uuid();
const periodKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export function registerBillingRoutes(app: FastifyInstance, auth: AuthService, billing: BillingService): void {
  app.get("/api/v1/billing/cycles", async (request) => {
    await authorizeRequest(auth, request, "billing.view");
    return { data: await billing.listCycles() };
  });

  app.get("/api/v1/billing/preview", async (request) => {
    await authorizeRequest(auth, request, "billing.generate");
    const query = z.object({ periodKey }).parse(request.query);
    return { data: await billing.preview(query.periodKey) };
  });

  app.post("/api/v1/billing/finalize", async (request) => {
    const session = await authorizeRequest(auth, request, "billing.generate");
    const body = parseBody(z.object({ periodKey, commandKey: z.string().uuid() }), request.body);
    return { data: await billing.finalize(body.periodKey, body.commandKey, actor(session.id, session.user.id, request.id)) };
  });

  app.get("/api/v1/invoices", async (request) => {
    await authorizeRequest(auth, request, "billing.view");
    const query = z.object({ periodKey: periodKey.optional(), subscriberId: id.optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query);
    return { data: await billing.listInvoices(query) };
  });

  app.get("/api/v1/invoices/:id", async (request) => {
    await authorizeRequest(auth, request, "billing.view");
    return { data: await billing.getInvoice(z.object({ id }).parse(request.params).id) };
  });

  app.get("/api/v1/subscribers/:id/statement", async (request) => {
    await authorizeRequest(auth, request, "receivable.view");
    return { data: await billing.getStatement(z.object({ id }).parse(request.params).id) };
  });

  app.post("/api/v1/invoices/:id/void", async (request) => {
    await authorizeRequest(auth, request, "billing.adjust");
    z.object({ id }).parse(request.params);
    parseBody(z.object({ reason: z.string().trim().min(10).max(500) }), request.body);
    throw new AppError(409, "POLICY_NOT_APPROVED", "Invoice voiding is disabled until its approval and credit policy is confirmed.");
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor {
  return { sessionId, userId, requestId };
}
