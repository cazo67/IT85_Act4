import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { CollectionService } from "./collection-service.js";

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const parsed = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, "Use a valid calendar date.");
const centavos = z.string().regex(/^(0|[1-9]\d*)$/);
const positiveCentavos = z.string().regex(/^[1-9]\d*$/);

export function registerCollectionRoutes(app: FastifyInstance, auth: AuthService, service: CollectionService): void {
  app.get("/api/v1/collection-batches", async (request) => {
    await authorizeRequest(auth, request, "collection.manage_batch");
    return { data: await service.listBatches() };
  });

  app.post("/api/v1/collection-batches", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.manage_batch");
    const body = parseBody(z.object({ collectorId: id, routeId: id, collectionDate: date }), request.body);
    return { data: await service.createBatch(body, actor(session.id, session.user.id, request.id)) };
  });

  app.get("/api/v1/collection-batches/:id", async (request) => {
    await authorizeRequest(auth, request, "collection.manage_batch");
    return { data: await service.getBatch(z.object({ id }).parse(request.params).id) };
  });

  for (const action of ["start", "submit", "close"] as const) {
    app.post(`/api/v1/collection-batches/:id/${action}`, async (request, reply) => {
      const session = await authorizeRequest(auth, request, action === "close" ? "collection.reconcile" : "collection.manage_batch");
      const params = z.object({ id }).parse(request.params);
      const body = parseBody(z.object({ version: z.number().int().positive() }), request.body);
      const status = action === "start" ? "ACTIVE" : action === "submit" ? "SUBMITTED" : "CLOSED";
      await service.transition(params.id, status, body.version, actor(session.id, session.user.id, request.id));
      return reply.status(204).send();
    });
  }

  app.post("/api/v1/collection-batches/:id/collections", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.record");
    const params = z.object({ id }).parse(request.params);
    const body = parseBody(z.object({ batchAccountId: id, amountCentavos: positiveCentavos, commandKey: z.string().uuid() }), request.body);
    return { data: await service.recordCollection(params.id, body, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/collection-batches/:id/remittance", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.reconcile");
    const params = z.object({ id }).parse(request.params);
    const body = parseBody(z.object({ remittedCashCentavos: centavos, notes: z.string().max(1000).default(""), version: z.number().int().positive() }), request.body);
    return { data: await service.remit(params.id, body, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/collection-batches/:id/reconcile", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "collection.reconcile");
    const params = z.object({ id }).parse(request.params);
    const body = parseBody(z.object({ notes: z.string().max(1000).default(""), version: z.number().int().positive() }), request.body);
    await service.reconcile(params.id, body.notes, body.version, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor { return { sessionId, userId, requestId }; }
