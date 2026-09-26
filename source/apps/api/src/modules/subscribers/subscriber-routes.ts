import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { SubscriberService } from "./subscriber-service.js";

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const centavos = z.string().regex(/^(0|[1-9]\d*)$/);
const day = z.number().int().min(1).max(28);

const planSchema = z.object({
  code: z.string().trim().min(2).max(30),
  serviceTypeId: id,
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000).default(""),
  priceCentavos: centavos,
  installationFeeCentavos: centavos.default("0"),
  reconnectionFeeCentavos: centavos.default("0"),
  internetSpeedMbps: z.number().int().positive().optional(),
  cableChannelCount: z.number().int().positive().optional()
});

const addressSchema = z.object({
  type: z.enum(["BILLING", "SERVICE", "MAILING", "OTHER"]),
  label: z.string().max(80).optional(),
  line1: z.string().trim().min(3).max(180),
  line2: z.string().max(180).optional(),
  barangay: z.string().trim().min(2).max(100),
  cityMunicipality: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postalCode: z.string().max(12).optional(),
  isPrimary: z.boolean()
});

const contactSchema = z.object({
  type: z.enum(["MOBILE", "PHONE", "EMAIL", "OTHER"]),
  value: z.string().trim().min(3).max(150),
  isPrimary: z.boolean()
});

const subscriberSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().trim().min(2).max(100),
  suffix: z.string().max(20).optional(),
  billingDay: day,
  dueDay: day,
  collectionAreaId: id.optional(),
  assignedCollectorId: id.optional(),
  notes: z.string().max(2000).optional(),
  addresses: z.array(addressSchema).min(1).max(10),
  contacts: z.array(contactSchema).min(1).max(10)
});

const serviceAccountSchema = z.object({
  subscriberId: id,
  planId: id,
  installationAddressId: id,
  billingStartDate: date,
  activationDate: date.optional(),
  billingDay: day,
  dueDay: day,
  assignedCollectorId: id.optional()
});

const version = z.number().int().positive();

const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000).default(""),
  priceCentavos: centavos,
  installationFeeCentavos: centavos,
  reconnectionFeeCentavos: centavos,
  version
});

const subscriberUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"]),
  billingDay: day,
  dueDay: day,
  notes: z.string().max(2000).default(""),
  collectionAreaId: id.optional(),
  assignedCollectorId: id.optional(),
  version
});

const serviceAccountUpdateSchema = z.object({
  planId: id,
  installationAddressId: id,
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"]),
  reason: z.string().trim().min(3).max(500),
  version
});

export function registerSubscriberRoutes(app: FastifyInstance, auth: AuthService, service: SubscriberService): void {
  app.get("/api/v1/service-types", async (request) => {
    await authorizeRequest(auth, request, "service.view");
    return { data: await service.listServiceTypes() };
  });

  app.get("/api/v1/plans", async (request) => {
    await authorizeRequest(auth, request, "service.view");
    const query = z.object({ includeInactive: z.enum(["true", "false"]).default("false").transform((value) => value === "true") }).parse(request.query);
    return { data: await service.listPlans(query.includeInactive) };
  });

  app.post("/api/v1/plans", async (request) => {
    const session = await authorizeRequest(auth, request, "plan.manage");
    return { data: await service.createPlan(parseBody(planSchema, request.body), actor(session.id, session.user.id, request.id)) };
  });

  app.put("/api/v1/plans/:id", async (request) => {
    const session = await authorizeRequest(auth, request, "plan.manage");
    const params = z.object({ id }).parse(request.params);
    return { data: await service.updatePlan(params.id, parseBody(planUpdateSchema, request.body), actor(session.id, session.user.id, request.id)) };
  });

  app.patch("/api/v1/plans/:id/active", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "plan.manage");
    const params = z.object({ id }).parse(request.params);
    const body = parseBody(z.object({ isActive: z.boolean() }), request.body);
    await service.setPlanActive(params.id, body.isActive, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/subscribers", async (request) => {
    await authorizeRequest(auth, request, "subscriber.view");
    const query = z.object({ search: z.string().max(120).optional(), status: z.enum(["ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"]).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query);
    return { data: await service.listSubscribers(query) };
  });

  app.post("/api/v1/subscribers", async (request) => {
    const session = await authorizeRequest(auth, request, "subscriber.create");
    return { data: await service.createSubscriber(parseBody(subscriberSchema, request.body), actor(session.id, session.user.id, request.id)) };
  });

  app.get("/api/v1/subscribers/:id", async (request) => {
    await authorizeRequest(auth, request, "subscriber.view");
    return { data: await service.getSubscriber(z.object({ id }).parse(request.params).id) };
  });

  app.patch("/api/v1/subscribers/:id", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "subscriber.update");
    const params = z.object({ id }).parse(request.params);
    await service.updateSubscriber(params.id, parseBody(subscriberUpdateSchema, request.body), actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });

  app.post("/api/v1/service-accounts", async (request) => {
    const session = await authorizeRequest(auth, request, "service.manage");
    return { data: await service.createServiceAccount(parseBody(serviceAccountSchema, request.body), actor(session.id, session.user.id, request.id)) };
  });

  app.patch("/api/v1/service-accounts/:id", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "service.manage");
    const params = z.object({ id }).parse(request.params);
    await service.updateServiceAccount(params.id, parseBody(serviceAccountUpdateSchema, request.body), actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/collection-setup", async (request) => {
    await authorizeRequest(auth, request, "collection.manage_routes");
    return { data: await service.listCollectionSetup() };
  });

  app.post("/api/v1/collection-areas", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.manage_routes");
    const body = parseBody(z.object({ code: z.string().min(2).max(30), name: z.string().min(2).max(120), description: z.string().max(500).default("") }), request.body);
    return { data: await service.createCollectionArea(body, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/collection-routes", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.manage_routes");
    const body = parseBody(z.object({ areaId: id, code: z.string().min(2).max(30), name: z.string().min(2).max(120), scheduleNotes: z.string().max(500).default("") }), request.body);
    return { data: await service.createCollectionRoute(body, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/collectors", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.manage_routes");
    const body = parseBody(z.object({ code: z.string().min(2).max(30), displayName: z.string().min(2).max(120), contactNumber: z.string().max(40).optional() }), request.body);
    return { data: await service.createCollector(body, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/collector-assignments", async (request) => {
    const session = await authorizeRequest(auth, request, "collection.manage_routes");
    const body = parseBody(z.object({ collectorId: id, routeId: id.optional(), serviceAccountId: id, effectiveFrom: date }), request.body);
    return { data: await service.assignCollector(body, actor(session.id, session.user.id, request.id)) };
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor {
  return { sessionId, userId, requestId };
}
