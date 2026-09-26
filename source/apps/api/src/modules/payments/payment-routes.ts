import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../app/app-error.js";
import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { PaymentService } from "./payment-service.js";

const id = z.string().uuid();
const centavos = z.string().regex(/^[1-9]\d*$/);

export function registerPaymentRoutes(app: FastifyInstance, auth: AuthService, payments: PaymentService): void {
  app.get("/api/v1/payments/preview", async (request) => {
    await authorizeRequest(auth, request, "payment.create");
    const query = z.object({ subscriberId: id, amountCentavos: centavos }).parse(request.query);
    return { data: await payments.preview(query.subscriberId, query.amountCentavos) };
  });

  app.post("/api/v1/payments", async (request) => {
    const session = await authorizeRequest(auth, request, "payment.create");
    const body = parseBody(z.object({ subscriberId: id, amountCentavos: centavos, method: z.enum(["CASH", "GCASH"]), commandKey: z.string().uuid() }), request.body);
    return { data: await payments.post(body, actor(session.id, session.user.id, request.id)) };
  });

  app.get("/api/v1/payments", async (request) => {
    await authorizeRequest(auth, request, "billing.view");
    const query = z.object({ subscriberId: id.optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return { data: await payments.list(query) };
  });

  app.get("/api/v1/payments/:id", async (request) => {
    await authorizeRequest(auth, request, "billing.view");
    return { data: await payments.get(z.object({ id }).parse(request.params).id) };
  });

  app.post("/api/v1/payments/:id/reverse", async (request) => {
    const session = await authorizeRequest(auth, request, "payment.reverse");
    const params = z.object({ id }).parse(request.params);
    const body = parseBody(z.object({ reason: z.string().trim().min(10).max(500) }), request.body);
    return { data: await payments.reverse(params.id, body.reason, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/gcash/proofs", async (request) => {
    await authorizeRequest(auth, request, "payment.create");
    throw new AppError(409, "GCASH_POLICY_NOT_APPROVED", "GCash proof upload is disabled until file, retention, verification, and duplicate-reference policies are approved.");
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor {
  return { sessionId, userId, requestId };
}
