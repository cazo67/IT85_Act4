import type { FastifyInstance } from "fastify";
import { z } from "zod";

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
    const body = parseBody(z.object({ subscriberId: id, amountCentavos: centavos, method: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]), commandKey: z.string().uuid(), externalReference: z.string().trim().min(6).max(80).optional(), otherDescription: z.string().trim().min(10).max(200).optional(), receivedConfirmed: z.literal(true).optional() }).strict(), request.body);
    return { data: await payments.post(body, actor(session.id, session.user.id, request.id)) };
  });

  app.get("/api/v1/payments", async (request) => {
    await authorizeRequest(auth, request, "billing.view");
    const query = z.object({ subscriberId: id.optional(), search: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
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

  app.post("/api/v1/gcash/proofs", { bodyLimit: 3_000_000 }, async (request) => {
    const session = await authorizeRequest(auth, request, "payment.create");
    const body = parseBody(z.object({ subscriberId: id, amountCentavos: centavos, senderName: z.string().trim().min(2).max(100), senderMobile: z.string().regex(/^09\d{9}$/), externalReference: z.string().trim().min(6).max(80), originalFileName: z.string().regex(/^[A-Za-z0-9._ -]{1,100}\.(png|jpe?g)$/i), imageBase64: z.string().min(8).max(2_800_000) }), request.body);
    return { data: await payments.submitGcashProof(body, actor(session.id, session.user.id, request.id)) };
  });

  app.get("/api/v1/gcash/proofs", async (request) => {
    await authorizeRequest(auth, request, "payment.verify_gcash");
    const query = z.object({ status: z.enum(["PENDING", "REJECTED", "VERIFIED"]).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return { data: await payments.listGcashProofs(query) };
  });

  app.get("/api/v1/gcash/my-proofs", async (request) => {
    const session = await authorizeRequest(auth, request, "payment.create");
    const query = z.object({ status: z.enum(["PENDING", "REJECTED", "VERIFIED"]).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return { data: await payments.listGcashProofs({ ...query, uploadedBy: session.user.id }) };
  });

  app.get("/api/v1/gcash/proofs/:id", async (request) => {
    await authorizeRequest(auth, request, "payment.verify_gcash");
    return { data: await payments.getGcashProof(z.object({ id }).parse(request.params).id) };
  });

  app.get("/api/v1/gcash/proofs/:id/image", async (request, reply) => {
    await authorizeRequest(auth, request, "payment.verify_gcash");
    const proof = await payments.getGcashProofImage(z.object({ id }).parse(request.params).id);
    return reply.header("cache-control", "no-store").header("x-content-type-options", "nosniff").type(proof.mediaType).send(proof.proofData);
  });

  app.post("/api/v1/gcash/proofs/:id/reject", async (request) => {
    const session = await authorizeRequest(auth, request, "payment.verify_gcash");
    const proofId = z.object({ id }).parse(request.params).id;
    const body = parseBody(z.object({ reason: z.string().trim().min(10).max(500) }), request.body);
    return { data: await payments.rejectGcashProof(proofId, body.reason, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/gcash/proofs/:id/verify", async (request) => {
    const session = await authorizeRequest(auth, request, "payment.verify_gcash");
    const proofId = z.object({ id }).parse(request.params).id;
    parseBody(z.object({ receiverHistoryConfirmed: z.literal(true) }).strict(), request.body);
    return { data: await payments.verifyGcashProof(proofId, actor(session.id, session.user.id, request.id)) };
  });

  app.post("/api/v1/gcash/proofs/:id/resubmit", { bodyLimit: 3_000_000 }, async (request) => {
    const session = await authorizeRequest(auth, request, "payment.create");
    const proofId = z.object({ id }).parse(request.params).id;
    const body = parseBody(z.object({ amountCentavos: centavos, senderName: z.string().trim().min(2).max(100), senderMobile: z.string().regex(/^09\d{9}$/), originalFileName: z.string().regex(/^[A-Za-z0-9._ -]{1,100}\.(png|jpe?g)$/i), imageBase64: z.string().min(8).max(2_800_000) }).strict(), request.body);
    return { data: await payments.resubmitGcashProof(proofId, body, actor(session.id, session.user.id, request.id)) };
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor {
  return { sessionId, userId, requestId };
}
